/// <reference types="node" />
// Opens a visible terminal tab through Orca's own CLI. The plugin API's `terminal.create` always
// starts terminals in the background, which on Orca 1.4.247 means no tab at all (the process runs
// with no pane), so a script started that way cannot be seen. The CLI creates a real tab.
import { execFile } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** Runs the CLI with `args` and answers its stdout; rejects when it fails. */
export type CliRunner = (cli: string, args: string[]) => Promise<string>

export const runCli: CliRunner = async (cli, args) => {
  try {
    const { stdout } = await run(cli, args, { timeout: 20_000, maxBuffer: 1024 * 1024 })
    return stdout
  } catch (error) {
    // A refusal still prints its JSON answer; hand it on so its message reaches the panel.
    const stdout = (error as { stdout?: string }).stdout
    if (stdout?.trim().startsWith('{')) return stdout
    throw error
  }
}

/**
 * Where the `orca` CLI may be, most specific first: beside the Orca app this worker runs in,
 * on PATH, then the default macOS install.
 */
export function cliCandidates(execPath: string, pathEnv: string | undefined): string[] {
  const candidates: string[] = []
  const app = execPath.match(/^(.*?\.app)\/Contents\//)?.[1]
  if (app) candidates.push(join(app, 'Contents', 'Resources', 'bin', 'orca'))
  for (const dir of (pathEnv ?? '').split(delimiter).filter(Boolean)) {
    candidates.push(join(dir, 'orca'))
  }
  candidates.push('/Applications/Orca.app/Contents/Resources/bin/orca')
  return [...new Set(candidates)]
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** The first `orca` CLI that exists, or null. */
export function findCli(
  execPath = process.execPath,
  pathEnv = process.env.PATH,
  exists: (path: string) => boolean = isExecutable
): string | null {
  return cliCandidates(execPath, pathEnv).find(exists) ?? null
}

export type VisibleTerminal = { terminalId: string; visible: boolean }

/**
 * Creates a terminal tab in the workspace at `path`, runs `command` in it and switches to it.
 * `visible` is false when Orca could only start it in the background.
 */
export async function openTerminalTab(
  cli: string,
  options: { path: string; title: string; command: string },
  runner: CliRunner = runCli
): Promise<VisibleTerminal> {
  const stdout = await runner(cli, [
    'terminal',
    'create',
    '--worktree',
    `path:${options.path}`,
    '--title',
    options.title,
    '--command',
    options.command,
    '--focus',
    '--json'
  ])
  const answer = JSON.parse(stdout) as {
    ok?: boolean
    error?: { message?: string }
    result?: { terminal?: { handle?: string; surface?: string } }
  }
  const terminal = answer.result?.terminal
  if (!answer.ok || !terminal?.handle) {
    throw new Error(answer.error?.message ?? 'orca terminal create gave no terminal')
  }
  return { terminalId: terminal.handle, visible: terminal.surface !== 'background' }
}
