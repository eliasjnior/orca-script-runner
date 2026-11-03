/// <reference types="node" />
// Turns an orca.yaml script into a one-line terminal command.
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

export type RunnerInput = {
  script: string
  worktreePath: string
  rootPath: string
}

/** Single-quotes a value for a POSIX shell. */
export const shellQuote = (value: string): string => `'${value.replaceAll("'", `'\\''`)}'`

/**
 * A Bash file that runs `script` the way Orca runs its setup script: `set -e`, from the worktree,
 * with the same ORCA_* variables. It deletes itself first; Bash keeps reading the open file.
 */
export function runnerScript({ script, worktreePath, rootPath }: RunnerInput): string {
  return [
    '#!/usr/bin/env bash',
    'rm -f -- "$0"',
    'set -e',
    `export ORCA_ROOT_PATH=${shellQuote(rootPath)}`,
    `export ORCA_WORKTREE_PATH=${shellQuote(worktreePath)}`,
    `export ORCA_WORKSPACE_NAME=${shellQuote(basename(worktreePath))}`,
    'export CONDUCTOR_ROOT_PATH="$ORCA_ROOT_PATH" GHOSTX_ROOT_PATH="$ORCA_ROOT_PATH"',
    'cd -- "$ORCA_WORKTREE_PATH"',
    script,
    ''
  ].join('\n')
}

/** Writes the runner to a private temp file and answers the command that starts it. */
export async function prepareRun(input: RunnerInput): Promise<string> {
  const file = join(tmpdir(), `orca-script-${randomUUID()}.sh`)
  await writeFile(file, runnerScript(input), { mode: 0o600 })
  return `bash ${shellQuote(file)}`
}
