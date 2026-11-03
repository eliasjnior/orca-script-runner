/// <reference types="node" />
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, assert, mockHost, mountWorker, test } from 'orca/testing'
import * as main from './worker'

const temp = (prefix: string) => realpathSync(mkdtempSync(join(tmpdir(), prefix)))

function hostFor(path: string, extra: Record<string, unknown> = {}) {
  return mockHost({
    results: {
      'workspace.readContext': { branch: 'feat/x', displayName: 'api', terminals: [] },
      'workspace.list': {
        workspaces: [
          {
            id: 'other',
            kind: 'worktree',
            name: 'web',
            path: '/nowhere',
            branch: 'main',
            hostId: null
          },
          { id: 'wt-1', kind: 'worktree', name: 'api', path, branch: 'feat/x', hostId: null }
        ],
        truncated: false
      },
      ...extra
    }
  })
}

test('lists the focused worktree scripts', async () => {
  const dir = temp('orca-scripts-')
  writeFileSync(join(dir, 'orca.yaml'), 'scripts:\n  setup: pnpm install\n  dev: pnpm dev\n')
  const worker = await mountWorker(main, { host: hostFor(dir) })
  const view = await worker.request('scripts.list')
  assert.deepEqual(view, {
    workspace: { id: 'wt-1', name: 'api', path: dir, branch: 'feat/x' },
    configPath: join(dir, 'orca.yaml'),
    fromPrimaryCheckout: false,
    scripts: [
      { name: 'setup', command: 'pnpm install' },
      { name: 'dev', command: 'pnpm dev' }
    ],
    error: null
  })
  assert.deepEqual(worker.refusals, [])
  await worker.deactivate()
})

test('falls back to the primary checkout orca.yaml for a linked worktree', async () => {
  const root = temp('orca-primary-')
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe' })
  git('init', '-q')
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init')
  const worktree = join(temp('orca-linked-'), 'wt')
  git('worktree', 'add', '-q', '-b', 'feat/x', worktree)
  writeFileSync(join(root, 'orca.yaml'), 'scripts:\n  archive: echo bye\n')

  const worker = await mountWorker(main, { host: hostFor(worktree) })
  const view = await worker.request('scripts.list')
  assert.equal(view.fromPrimaryCheckout, true)
  assert.equal(view.configPath, join(root, 'orca.yaml'))
  assert.deepEqual(view.scripts, [{ name: 'archive', command: 'echo bye' }])
  await worker.deactivate()
})

test('reports a broken orca.yaml and a workspace it cannot find', async () => {
  const dir = temp('orca-broken-')
  writeFileSync(join(dir, 'orca.yaml'), 'scripts:\n  a: x\n  a: y\n')
  const worker = await mountWorker(main, { host: hostFor(dir) })
  const view = await worker.request('scripts.list')
  assert.equal(view.workspace?.id, 'wt-1')
  assert.deepEqual(view.scripts, [])
  assert.ok(view.error)
  await worker.deactivate()

  const lost = await mountWorker(main, {
    host: hostFor(dir, {
      'workspace.readContext': { branch: 'main', displayName: 'gone', terminals: [] }
    })
  })
  const missing = await lost.request('scripts.list')
  assert.equal(missing.workspace, null)
  assert.match(missing.error ?? '', /gone/)
  await lost.deactivate()
})

/** Stands in for Orca's CLI: records each call and answers like `orca terminal create`. */
function fakeCli(
  answer: object = { ok: true, result: { terminal: { handle: 'term-cli', surface: 'visible' } } }
) {
  const calls: string[][] = []
  main.cli.find = () => '/Applications/Orca.app/Contents/Resources/bin/orca'
  main.cli.run = async (_cli, args) => {
    calls.push(args)
    return JSON.stringify(answer)
  }
  return calls
}

const realCli = { ...main.cli }
afterEach(() => Object.assign(main.cli, realCli))

const runnerFile = (command: string | undefined) => command?.match(/^bash '(.+)'$/)?.[1] ?? ''

test('runs a script in a new, focused terminal tab through the Orca CLI', async () => {
  const dir = temp('orca-run-')
  writeFileSync(join(dir, 'orca.yaml'), 'scripts:\n  setup: |\n    echo one\n    echo two\n')
  const calls = fakeCli()
  const host = hostFor(dir)
  const worker = await mountWorker(main, { host })

  assert.deepEqual(await worker.request('scripts.run', { workspaceId: 'wt-1', name: 'setup' }), {
    terminalId: 'term-cli',
    visible: true,
    title: 'setup'
  })
  const [args] = calls
  assert.deepEqual(args?.slice(0, 6), [
    'terminal',
    'create',
    '--worktree',
    `path:${dir}`,
    '--title',
    'setup'
  ])
  assert.ok(args?.includes('--focus'))
  const file = runnerFile(args?.[args.indexOf('--command') + 1])
  assert.match(readFileSync(file, 'utf8'), /\necho one\necho two\n$/)
  rmSync(file)
  assert.deepEqual(host.callsOf('terminal.create'), [])

  await assert.rejects(
    worker.request('scripts.run', { workspaceId: 'wt-1', name: 'nope' }),
    /no longer defines/
  )
  await assert.rejects(
    worker.request('scripts.run', { workspaceId: 'gone', name: 'setup' }),
    /no longer exists/
  )
  assert.deepEqual(worker.refusals, [])
  await worker.deactivate()
})

test('reports a CLI refusal instead of starting the script another way', async () => {
  const dir = temp('orca-refused-')
  writeFileSync(join(dir, 'orca.yaml'), 'scripts:\n  setup: echo hi\n')
  fakeCli({ ok: false, error: { message: 'worktree not found' } })
  const host = hostFor(dir)
  const worker = await mountWorker(main, { host })
  await assert.rejects(
    worker.request('scripts.run', { workspaceId: 'wt-1', name: 'setup' }),
    /worktree not found/
  )
  assert.deepEqual(host.callsOf('terminal.create'), [])
  await worker.deactivate()
})

test('without the CLI, starts the script in the background and says there is no tab', async () => {
  const dir = temp('orca-nocli-')
  writeFileSync(join(dir, 'orca.yaml'), 'scripts:\n  setup: echo hi\n')
  main.cli.find = () => null
  const host = hostFor(dir, { 'terminal.create': { terminalId: 'term-9' } })
  const worker = await mountWorker(main, { host })
  assert.deepEqual(await worker.request('scripts.run', { workspaceId: 'wt-1', name: 'setup' }), {
    terminalId: 'term-9',
    title: 'setup',
    visible: false
  })
  const [call] = host.callsOf('terminal.create') as { workspaceId: string; command: string }[]
  assert.equal(call?.workspaceId, 'wt-1')
  rmSync(runnerFile(call?.command))
  await worker.deactivate()
})
