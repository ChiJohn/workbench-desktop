import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { startUaViewerServer } from './viewerServer'

describe('startUaViewerServer', () => {
  it('serves graph from vault graphDir and source code from separate repoPath', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-ua-srv-'))
    const vaultUa = join(root, 'vault', '项目', 'demo', '.ua')
    const repo = join(root, 'repo')
    const dist = join(root, 'dist')
    mkdirSync(vaultUa, { recursive: true })
    mkdirSync(join(repo, 'src'), { recursive: true })
    mkdirSync(dist, { recursive: true })

    writeFileSync(join(dist, 'index.html'), '<html>UA</html>')
    writeFileSync(join(repo, 'src', 'hello.ts'), 'export const x = 42\n')
    writeFileSync(join(repo, 'secret.txt'), 'do not expose')
    writeFileSync(
      join(vaultUa, 'knowledge-graph.json'),
      JSON.stringify({
        project: { name: 'demo' },
        nodes: [{ id: '1', name: 'hello.ts', filePath: 'src/hello.ts', summary: 'entry' }],
        edges: []
      })
    )

    const srv = await startUaViewerServer({ graphDir: vaultUa, repoPath: repo, distDir: dist })
    try {
      const parsed = new URL(srv.url)
      const token = parsed.searchParams.get('token')
      const base = `${parsed.protocol}//${parsed.host}`

      // Static HTML
      const htmlRes = await fetch(`${base}/`)
      expect(htmlRes.status).toBe(200)
      expect(await htmlRes.text()).toContain('UA')

      // Missing token -> 403
      const forbidden = await fetch(`${base}/knowledge-graph.json`)
      expect(forbidden.status).toBe(403)

      // Graph JSON from Vault
      const graphRes = await fetch(`${base}/knowledge-graph.json?token=${token}`)
      expect(graphRes.status).toBe(200)
      const graphJson = (await graphRes.json()) as { nodes: Array<{ filePath: string }> }
      expect(graphJson.nodes[0].filePath).toBe('src/hello.ts')

      // Source file preview from Repo
      const srcRes = await fetch(`${base}/file-content.json?path=src/hello.ts&token=${token}`)
      expect(srcRes.status).toBe(200)
      const srcJson = (await srcRes.json()) as { content: string; language: string }
      expect(srcJson.language).toBe('typescript')
      expect(srcJson.content).toContain('export const x = 42')

      // Unlisted file in repo -> 404
      const unlisted = await fetch(`${base}/file-content.json?path=secret.txt&token=${token}`)
      expect(unlisted.status).toBe(404)
    } finally {
      await srv.close()
      rmSync(root, { recursive: true, force: true })
    }
  })
})
