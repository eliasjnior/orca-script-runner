import { assert, test } from 'orca/testing'
import { cliCandidates, findCli, openTerminalTab } from './orca-cli'

test('looks for the CLI beside the running Orca app, then on PATH, then the default install', () => {
  assert.deepEqual(cliCandidates('/Apps/Orca Beta.app/Contents/MacOS/Orca', '/usr/bin:/opt/bin'), [
    '/Apps/Orca Beta.app/Contents/Resources/bin/orca',
    '/usr/bin/orca',
    '/opt/bin/orca',
    '/Applications/Orca.app/Contents/Resources/bin/orca'
  ])
  assert.equal(
    findCli('/usr/local/bin/node', '/a:/b', (path) => path === '/b/orca'),
    '/b/orca'
  )
  assert.equal(
    findCli('/usr/local/bin/node', '', () => false),
    null
  )
})

test('opens a focused tab and reads the handle from the JSON answer', async () => {
  const seen: string[][] = []
  const tab = await openTerminalTab(
    'orca',
    { path: '/w', title: 'dev', command: "bash '/t.sh'" },
    async (_cli, args) => {
      seen.push(args)
      return JSON.stringify({
        ok: true,
        result: { terminal: { handle: 'term_1', surface: 'visible' } }
      })
    }
  )
  assert.deepEqual(tab, { terminalId: 'term_1', visible: true })
  assert.deepEqual(seen, [
    [
      'terminal',
      'create',
      '--worktree',
      'path:/w',
      '--title',
      'dev',
      '--command',
      "bash '/t.sh'",
      '--focus',
      '--json'
    ]
  ])

  const background = await openTerminalTab(
    'orca',
    { path: '/w', title: 'dev', command: 'x' },
    async () =>
      JSON.stringify({
        ok: true,
        result: { terminal: { handle: 'term_2', surface: 'background' } }
      })
  )
  assert.equal(background.visible, false)

  await assert.rejects(
    openTerminalTab('orca', { path: '/w', title: 'dev', command: 'x' }, async () =>
      JSON.stringify({ ok: false, error: { message: 'no such worktree' } })
    ),
    /no such worktree/
  )
})
