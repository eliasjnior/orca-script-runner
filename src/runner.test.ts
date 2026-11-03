/// <reference types="node" />
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assert, test } from 'orca/testing'
import { prepareRun, runnerScript, shellQuote } from './runner'

test('quotes values for a POSIX shell', () => {
  assert.equal(shellQuote("it's"), `'it'\\''s'`)
  assert.equal(
    execFileSync('bash', ['-c', `printf %s ${shellQuote("a 'b' $c")}`], { encoding: 'utf8' }),
    "a 'b' $c"
  )
})

test('runs the script from the worktree with Orca variables, stops on errors, removes itself', async () => {
  const worktree = realpathSync(mkdtempSync(join(tmpdir(), "wt it's ")))
  const command = await prepareRun({
    script:
      'echo "$PWD|$ORCA_ROOT_PATH|$ORCA_WORKTREE_PATH|$ORCA_WORKSPACE_NAME"\nfalse\necho unreachable',
    worktreePath: worktree,
    rootPath: '/primary'
  })
  const file = command.slice('bash '.length)
  let output = ''
  try {
    execFileSync('bash', ['-c', command], { encoding: 'utf8', stdio: 'pipe' })
  } catch (error) {
    output = String((error as { stdout?: string }).stdout)
  }
  const name = worktree.split('/').pop()
  assert.equal(output, `${worktree}|/primary|${worktree}|${name}\n`)
  assert.equal(existsSync(file.slice(1, -1)), false)
})

test('keeps the script text as written', () => {
  const text = runnerScript({ script: 'echo one\necho two', worktreePath: '/w', rootPath: '/r' })
  assert.match(text, /\ncd -- "\$ORCA_WORKTREE_PATH"\necho one\necho two\n$/)
})
