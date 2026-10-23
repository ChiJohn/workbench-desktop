import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RunnerExitEvent, RunnerOutputEvent } from '../../shared/types'
import { RunnerService } from './runnerService'

let dir: string
let runner: RunnerService

const SERVER = `
const { spawn } = require('child_process')
const fs = require('fs')
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
fs.writeFileSync('grandchild.pid', String(child.pid))
let i = 0
console.log('ready')
setInterval(() => console.log('tick ' + i++), 20)
`

const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const waitFor = async (check: () => boolean, timeoutMs = 15_000) => {
  const start = Date.now()
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out')
    await new Promise((r) => setTimeout(r, 50))
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wb-run-'))
  writeFileSync(join(dir, 'server.js'), SERVER)
  writeFileSync(join(dir, 'fail.js'), 'console.error("boom"); process.exit(2)')
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ scripts: { serve: 'node server.js', fail: 'node fail.js' } })
  )
  runner = new RunnerService({ maxLines: 5, flushMs: 20 })
})

afterEach(async () => {
  await runner.stopAll()
  rmSync(dir, { recursive: true, force: true })
})

describe('RunnerService', () => {
  it('streams output, refuses duplicates and kills the whole process tree on stop', async () => {
    const output: string[] = []
    const exits: RunnerExitEvent[] = []
    runner.on('output', (e: RunnerOutputEvent) => output.push(e.chunk))
    runner.on('exit', (e: RunnerExitEvent) => exits.push(e))

    const session = await runner.start({ projectId: 'p', repoPath: dir, script: 'serve' })
    expect(session).toMatchObject({ projectId: 'p', script: 'serve', status: 'running' })
    expect(runner.hasRunning()).toBe(true)

    await waitFor(() => output.join('').includes('tick 10'))
    await expect(runner.start({ projectId: 'p', repoPath: dir, script: 'serve' })).rejects.toMatchObject({
      code: 'ALREADY_RUNNING'
    })

    const lines = runner.buffer(session.runId).split('\n')
    expect(lines.length).toBeLessThanOrEqual(6)

    const grandchild = Number(readFileSync(join(dir, 'grandchild.pid'), 'utf8'))
    expect(isAlive(grandchild)).toBe(true)

    await runner.stop(session.runId)
    await waitFor(() => exits.length === 1)
    expect(exits[0].runId).toBe(session.runId)
    expect(runner.list()[0].status).toBe('exited')
    expect(runner.hasRunning()).toBe(false)
    await waitFor(() => !isAlive(grandchild), 5_000)
  })

  it('reports a non-zero exit code', async () => {
    const exits: RunnerExitEvent[] = []
    runner.on('exit', (e: RunnerExitEvent) => exits.push(e))
    const session = await runner.start({ projectId: 'p', repoPath: dir, script: 'fail' })
    await waitFor(() => exits.length === 1)
    expect(exits[0].exitCode).not.toBe(0)
    expect(runner.buffer(session.runId)).toContain('boom')
  })

  it('rejects unknown scripts', async () => {
    await expect(runner.start({ projectId: 'p', repoPath: dir, script: 'nope' })).rejects.toMatchObject({
      code: 'SCRIPT_NOT_FOUND'
    })
  })

  it('disposes exited sessions but not running ones', async () => {
    const exits: RunnerExitEvent[] = []
    runner.on('exit', (e: RunnerExitEvent) => exits.push(e))
    const running = await runner.start({ projectId: 'p', repoPath: dir, script: 'serve' })
    expect(() => runner.dispose(running.runId)).toThrow(expect.objectContaining({ code: 'RUN_STILL_RUNNING' }))
    await runner.stop(running.runId)
    await waitFor(() => exits.length === 1)
    const pidFile = join(dir, 'grandchild.pid')
    if (existsSync(pidFile)) {
      const grandchild = Number(readFileSync(pidFile, 'utf8'))
      await waitFor(() => !isAlive(grandchild), 5_000)
    }
    runner.dispose(running.runId)
    expect(runner.list()).toEqual([])
    expect(() => runner.buffer(running.runId)).toThrow(expect.objectContaining({ code: 'RUN_NOT_FOUND' }))
  })
})
