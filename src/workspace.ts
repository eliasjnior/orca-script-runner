/// <reference types="node" />
// Finds the focused workspace's id and path, and its primary checkout.
import { execFile } from 'node:child_process'
import { basename, dirname } from 'node:path'
import { promisify } from 'node:util'
import type { Workspace } from './protocol'

const run = promisify(execFile)

/** What `workspace.readContext` answers for the focused workspace. */
export type FocusedContext = { branch: string; displayName: string }

const shortBranch = (branch: string | null | undefined): string =>
  (branch ?? '').replace(/^refs\/heads\//, '')

/**
 * `workspace.readContext` names the focused workspace only by display name and branch, while
 * `workspace.list` carries ids and paths: match on both, then on the name alone. Null when nothing
 * matches or the match is ambiguous.
 */
export function matchFocused(
  context: FocusedContext,
  workspaces: readonly Workspace[]
): Workspace | null {
  const named = workspaces.filter((workspace) => workspace.name === context.displayName)
  const exact = named.filter(
    (workspace) => shortBranch(workspace.branch) === shortBranch(context.branch)
  )
  if (exact.length === 1) return exact[0] ?? null
  if (exact.length === 0 && named.length === 1) return named[0] ?? null
  return null
}

/**
 * The primary checkout of the Git worktree at `path`: the folder holding the shared `.git`.
 * Falls back to `path` itself for a folder that is not a linked worktree.
 */
export async function primaryCheckout(path: string): Promise<string> {
  try {
    const { stdout } = await run(
      'git',
      ['-C', path, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
      { timeout: 5000 }
    )
    const commonDir = stdout.trim()
    return basename(commonDir) === '.git' ? dirname(commonDir) : path
  } catch {
    return path
  }
}
