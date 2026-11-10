import { describe, expect, it } from 'vitest'
import {
  assistantView,
  clampWorkspaceSplit,
  clearProject,
  clickProject,
  closeSettings,
  closeWorkspace,
  escapeWorkspace,
  focusProject,
  loadWorkspaceSplit,
  openSettings,
  openWorkspace,
  showOverview,
  toggleSettings,
  toggleWorkspace,
  toolbarActive,
  workspaceCompact,
  workspaceOverlay,
  type WorkspaceNav
} from '../shared/workspaceNav'

const base: WorkspaceNav = { projectId: 'repo-a', workspace: null, settingsOpen: false }

describe('workspace navigation', () => {
  it('opens a workspace without dropping the project', () => {
    expect(openWorkspace(base, 'tasks')).toEqual({ projectId: 'repo-a', workspace: 'tasks', settingsOpen: false })
  })

  it('keeps the same workspace open when asked again', () => {
    const open = openWorkspace(base, 'tasks')
    expect(openWorkspace(open, 'tasks')).toEqual(open)
  })

  it('closes settings when a workspace is opened', () => {
    expect(openWorkspace({ ...base, settingsOpen: true, workspace: 'reports' }, 'agents')).toEqual({
      projectId: 'repo-a',
      workspace: 'agents',
      settingsOpen: false
    })
  })

  it('closes the workspace when its toolbar button is pressed again', () => {
    const open = openWorkspace(base, 'tasks')
    expect(toggleWorkspace(open, 'tasks')).toEqual(base)
  })

  it('switches the workspace when another toolbar button is pressed', () => {
    expect(toggleWorkspace(openWorkspace(base, 'tasks'), 'agents').workspace).toBe('agents')
  })

  it('reveals the workspace instead of closing it while settings covers the stage', () => {
    const covered = { projectId: 'repo-a', workspace: 'tasks' as const, settingsOpen: true }
    expect(toggleWorkspace(covered, 'tasks')).toEqual({ projectId: 'repo-a', workspace: 'tasks', settingsOpen: false })
    expect(toggleWorkspace(covered, 'knowledge').workspace).toBe('knowledge')
  })

  it('focuses a project and leaves the workspace open', () => {
    const open = openWorkspace(base, 'tasks')
    expect(focusProject(open, 'repo-b')).toEqual({ projectId: 'repo-b', workspace: 'tasks', settingsOpen: false })
  })

  it('closes settings when focusing a project', () => {
    expect(focusProject({ ...base, settingsOpen: true }, 'repo-b').settingsOpen).toBe(false)
  })

  it('collapses the workspace when the selected project is clicked again', () => {
    const open = openWorkspace(base, 'agents')
    expect(clickProject(open, 'repo-a')).toEqual(base)
  })

  it('keeps the workspace when a different project is clicked', () => {
    const open = openWorkspace(base, 'agents')
    expect(clickProject(open, 'repo-b')).toEqual({ projectId: 'repo-b', workspace: 'agents', settingsOpen: false })
  })

  it('returns to the full project when the selected project is clicked under settings', () => {
    const covered = { projectId: 'repo-a', workspace: 'tasks' as const, settingsOpen: true }
    expect(clickProject(covered, 'repo-a')).toEqual(base)
  })

  it('leaves the nav alone when the selected project is clicked with nothing else open', () => {
    expect(clickProject(base, 'repo-a')).toEqual(base)
  })

  it('clears both sides from overview', () => {
    const busy = { projectId: 'repo-a', workspace: 'reports' as const, settingsOpen: true }
    expect(showOverview(busy)).toEqual({ projectId: null, workspace: null, settingsOpen: false })
  })

  it('drops only the project when the current repo is removed', () => {
    const open = openWorkspace(base, 'tasks')
    expect(clearProject(open)).toEqual({ projectId: null, workspace: 'tasks', settingsOpen: false })
  })

  it('covers and uncovers settings without touching the stage', () => {
    const open = openWorkspace(base, 'bookmarks')
    expect(openSettings(open)).toEqual({ ...open, settingsOpen: true })
    expect(closeSettings(openSettings(open))).toEqual(open)
    expect(toggleSettings(open).settingsOpen).toBe(true)
    expect(toggleSettings(openSettings(open))).toEqual(open)
  })

  it('closes the workspace on escape only when it is the visible layer', () => {
    const open = openWorkspace(base, 'tasks')
    expect(escapeWorkspace(open)).toEqual(base)
    expect(escapeWorkspace({ ...open, settingsOpen: true })).toEqual({ ...open, settingsOpen: true })
    expect(escapeWorkspace(base)).toEqual(base)
  })

  it('describes the visible page and still knows the project', () => {
    expect(assistantView(base)).toBe('project')
    expect(assistantView(openWorkspace(base, 'tasks'))).toBe('tasks')
    expect(assistantView({ projectId: null, workspace: null, settingsOpen: false })).toBe('overview')
    expect(assistantView({ ...base, settingsOpen: true })).toBe('settings')
  })

  it('highlights overview, the open workspace, and settings on separate axes', () => {
    const open = openWorkspace(base, 'tasks')
    expect(toolbarActive(open, 'tasks')).toBe(true)
    expect(toolbarActive(open, 'overview')).toBe(false)
    expect(toolbarActive(open, 'agents')).toBe(false)
    expect(toolbarActive({ ...open, settingsOpen: true }, 'tasks')).toBe(false)
    expect(toolbarActive({ ...open, settingsOpen: true }, 'settings')).toBe(true)
    expect(toolbarActive({ projectId: null, workspace: null, settingsOpen: false }, 'overview')).toBe(true)
    expect(toolbarActive({ projectId: null, workspace: 'tasks', settingsOpen: false }, 'overview')).toBe(false)
  })
})

describe('workspace layout', () => {
  it('splits at 980px and covers the stage below that', () => {
    expect(workspaceOverlay(980)).toBe(false)
    expect(workspaceOverlay(979)).toBe(true)
  })

  it('uses a drill-in layout for a narrow pane and for the cover layer', () => {
    expect(workspaceCompact(760, false)).toBe(false)
    expect(workspaceCompact(759, false)).toBe(true)
    expect(workspaceCompact(900, true)).toBe(true)
  })

  it('keeps the split ratio between 32% and 50%', () => {
    expect(clampWorkspaceSplit(0.4)).toBe(0.4)
    expect(clampWorkspaceSplit(0.1)).toBe(0.32)
    expect(clampWorkspaceSplit(0.9)).toBe(0.5)
    expect(clampWorkspaceSplit(Number.NaN)).toBe(0.4)
    expect(loadWorkspaceSplit(null)).toBe(0.4)
    expect(loadWorkspaceSplit('0.35')).toBe(0.35)
    expect(loadWorkspaceSplit('nope')).toBe(0.4)
  })

  it('closes a workspace without changing the project', () => {
    expect(closeWorkspace(openWorkspace(base, 'knowledge'))).toEqual(base)
  })
})
