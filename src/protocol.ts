// The panel <-> worker contract, declared once: src/panel.tsx and src/worker.ts both read it.

/** A workspace as `workspace.list` reports it. */
export type Workspace = {
  id: string
  name: string
  path: string
  branch: string | null
}

/** One entry of `scripts:` in orca.yaml. */
export type Script = { name: string; command: string }

/** What the panel shows for the focused workspace. */
export type ScriptsView = {
  /** Null when no workspace is focused. */
  workspace: Workspace | null
  /** The orca.yaml the scripts came from, or null when there is none. */
  configPath: string | null
  /** True when the scripts came from the primary checkout, not the worktree itself. */
  fromPrimaryCheckout: boolean
  scripts: Script[]
  /** Why the scripts could not be read; the rest of the view still applies. */
  error: string | null
}

declare module 'orca' {
  interface PluginRequests {
    /** The focused workspace and the scripts its orca.yaml defines. */
    'scripts.list': { output: ScriptsView }
    /** Runs one script of a workspace in a new terminal of that workspace. */
    'scripts.run': {
      input: { workspaceId: string; name: string }
      /** `visible`: false when Orca could only start it in the background, with no tab. */
      output: { terminalId: string; title: string; visible: boolean }
    }
  }
}
