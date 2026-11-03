/// <reference types="node" />
// The plugin's worker: reads orca.yaml from disk and starts scripts in workspace terminals,
// neither of which a panel can do. Orca starts it on the panel's first plugin.request.
import { existsSync } from 'node:fs'
import type { OrcaWorkerApi } from 'orca/worker'
import { readScripts } from './config'
import { type CliRunner, findCli, openTerminalTab, runCli } from './orca-cli'
import type { Script, ScriptsView, Workspace } from './protocol'
import { prepareRun } from './runner'
import { matchFocused, primaryCheckout } from './workspace'

/** How the worker reaches Orca's CLI; tests swap it so they never open real terminals. */
export const cli: { find: () => string | null; run: CliRunner } = {
  find: () => findCli(),
  run: runCli
}

async function listWorkspaces(orca: OrcaWorkerApi): Promise<Workspace[]> {
  const { workspaces } = await orca.host.call('workspace.list')
  return workspaces.map(({ id, name, path, branch }) => ({ id, name, path, branch }))
}

type Loaded = Pick<ScriptsView, 'configPath' | 'fromPrimaryCheckout' | 'scripts'>

/** The worktree's own orca.yaml, else the primary checkout's (where Orca reads archive from). */
async function loadScripts(workspace: Workspace): Promise<Loaded> {
  if (!existsSync(workspace.path)) {
    throw new Error(`The workspace files are not on this machine (${workspace.path}).`)
  }
  const own = await readScripts(workspace.path)
  if (own) return { configPath: own.path, fromPrimaryCheckout: false, scripts: own.scripts }
  const root = await primaryCheckout(workspace.path)
  const primary = root === workspace.path ? null : await readScripts(root)
  if (primary) {
    return { configPath: primary.path, fromPrimaryCheckout: true, scripts: primary.scripts }
  }
  return { configPath: null, fromPrimaryCheckout: false, scripts: [] }
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error))

async function view(orca: OrcaWorkerApi): Promise<ScriptsView> {
  const empty = { configPath: null, fromPrimaryCheckout: false, scripts: [] }
  const context = await orca.host.call('workspace.readContext')
  if (!context) return { workspace: null, ...empty, error: null }
  const workspace = matchFocused(context, await listWorkspaces(orca))
  if (!workspace) {
    return {
      workspace: null,
      ...empty,
      error: `Could not match the focused workspace "${context.displayName}" to exactly one workspace in Orca.`
    }
  }
  try {
    return { workspace, ...(await loadScripts(workspace)), error: null }
  } catch (error) {
    return { workspace, ...empty, error: message(error) }
  }
}

export default function activate(orca: OrcaWorkerApi): void {
  orca.panels.handle('scripts.list', () => view(orca))

  orca.panels.handle('scripts.run', async ({ workspaceId, name }) => {
    const workspace = (await listWorkspaces(orca)).find(({ id }) => id === workspaceId)
    if (!workspace) throw new Error('That workspace no longer exists.')
    // Read the file again so the command that runs is the one on disk now.
    const { scripts } = await loadScripts(workspace)
    const script = scripts.find((entry: Script) => entry.name === name)
    if (!script) throw new Error(`orca.yaml no longer defines the script "${name}".`)
    const command = await prepareRun({
      script: script.command,
      worktreePath: workspace.path,
      rootPath: await primaryCheckout(workspace.path)
    })
    // A visible tab through Orca's CLI; the plugin API alone only starts a terminal with no tab.
    // A failed CLI call is reported, not retried another way: it may have started the script.
    const path = cli.find()
    if (path) {
      const opened = await openTerminalTab(
        path,
        { path: workspace.path, title: name, command },
        cli.run
      )
      orca.log(`started "${name}" in ${workspace.path} (terminal ${opened.terminalId})`)
      return { ...opened, title: name }
    }
    orca.log(`no orca CLI found, starting "${name}" in the background`)
    const { terminalId } = await orca.host.call('terminal.create', {
      workspaceId,
      title: name,
      command
    })
    return { terminalId, title: name, visible: false }
  })
}
