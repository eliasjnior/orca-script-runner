import { assert, hostError, mockHost, mount, test } from 'orca/testing'
import * as panel from './panel'
import type { ScriptsView } from './protocol'

const workspace = { id: 'wt-1', name: 'api', path: '/repos/api', branch: 'feat/x' }
const listed: ScriptsView = {
  workspace,
  configPath: '/repos/api/orca.yaml',
  fromPrimaryCheckout: false,
  scripts: [
    { name: 'setup', command: 'pnpm install' },
    { name: 'dev', command: 'pnpm dev' }
  ],
  error: null
}
const context = { branch: 'feat/x', displayName: 'api', terminals: [] }

test('lists the scripts and runs the one pressed', async () => {
  const runs: unknown[] = []
  const host = mockHost({
    requests: {
      'scripts.list': listed,
      'scripts.run': (input) => {
        runs.push(input)
        return { terminalId: 't1', title: input.name, visible: true }
      }
    }
  })
  const view = await mount(panel, { host })
  await view.emit('workspace.changed', { context })
  assert.equal(view.findAll({ role: 'button', text: 'Run' }).length, 2)
  assert.ok(view.find({ text: 'api · feat/x' }))

  const [, dev] = view.findAll({ role: 'button', text: 'Run' })
  assert.ok(dev)
  await view.press(dev)
  assert.deepEqual(runs, [{ workspaceId: 'wt-1', name: 'dev' }])
  assert.ok(view.find({ text: /Opened “dev” in a new terminal tab/ }))
  assert.deepEqual(view.errors, [])
  assert.deepEqual(view.warnings, [])
  await view.unmount()
})

test('explains an empty or missing orca.yaml and no focused workspace', async () => {
  let answer: ScriptsView = { ...listed, configPath: null, scripts: [] }
  const host = mockHost({ requests: { 'scripts.list': () => answer } })
  const view = await mount(panel, { host })
  await view.emit('workspace.changed', { context })
  assert.ok(view.find({ label: 'No orca.yaml' }))

  answer = { ...answer, workspace: null }
  await view.emit('workspace.changed', { context: null })
  assert.ok(view.find({ label: 'No workspace focused' }))
  await view.unmount()
})

test('shows a failed run', async () => {
  const host = mockHost({
    requests: {
      'scripts.list': listed,
      'scripts.run': () => {
        throw hostError('action_failed', 'orca.yaml no longer defines the script "setup".')
      }
    }
  })
  const view = await mount(panel, { host })
  await view.emit('workspace.changed', { context })
  const [setup] = view.findAll({ role: 'button', text: 'Run' })
  assert.ok(setup)
  await view.press(setup)
  await view.press({ role: 'button', text: 'Run setup' })
  assert.ok(view.find({ text: /no longer defines/ }))
  await view.unmount()
})

test('shows the last list of the workspace at once, then refreshes it', async () => {
  const fresh: ScriptsView = { ...listed, scripts: [{ name: 'lint', command: 'pnpm lint' }] }
  const host = mockHost({ requests: { 'scripts.list': fresh } })
  const view = await mount(panel, {
    host,
    persisted: { workspace: { 'scripts-view': listed } }
  })
  // Drawn from the persisted answer, before the worker was asked.
  assert.equal(host.callsOf('plugin.request').length, 0)
  assert.equal(view.findAll({ role: 'button', text: 'Run' }).length, 2)

  await view.emit('workspace.changed', { context })
  assert.equal(view.findAll({ role: 'button', text: 'Run' }).length, 1)
  assert.deepEqual((view.persisted.workspace['scripts-view'] as ScriptsView).scripts, fresh.scripts)
  await view.unmount()
})

test('warns when the script could only start without a tab', async () => {
  const host = mockHost({
    requests: {
      'scripts.list': listed,
      'scripts.run': (input) => ({ terminalId: 't1', title: input.name, visible: false })
    }
  })
  const view = await mount(panel, { host })
  await view.emit('workspace.changed', { context })
  const [setup] = view.findAll({ role: 'button', text: 'Run' })
  assert.ok(setup)
  await view.press(setup)
  await view.press({ role: 'button', text: 'Run setup' })
  assert.ok(view.find({ label: '“setup” is running without a tab' }))
  assert.equal(view.find({ text: /Opened/ }), null)
  await view.unmount()
})

test('keeps the Run label while a script starts, disables every Run and shows a spinner', async () => {
  const setup = { name: 'setup', command: 'pnpm install' }
  const dev = { name: 'dev', command: 'pnpm dev' }
  const cards = (busy: string | null) => () => (
    <>
      <panel.ScriptCard script={setup} workspaceId="wt-1" busy={busy} confirming={null} />
      <panel.ScriptCard script={dev} workspaceId="wt-1" busy={busy} confirming={null} />
    </>
  )

  const starting = await mount(cards('setup'))
  const runs = starting.findAll({ role: 'button', text: 'Run' })
  assert.equal(runs.length, 2)
  assert.ok(runs.every((button) => button.disabled))
  assert.equal(starting.findAll({ type: 'Spinner' }).length, 1)
  assert.ok(starting.find({ type: 'Spinner', label: 'Starting "setup"' }))
  assert.deepEqual(starting.warnings, [])
  await starting.unmount()

  const idle = await mount(cards(null))
  assert.equal(idle.find({ type: 'Spinner' }), null)
  assert.ok(idle.findAll({ role: 'button', text: 'Run' }).every((button) => !button.disabled))
  await idle.unmount()
})

test('asks before running setup or archive, and runs other scripts right away', async () => {
  const runs: string[] = []
  const host = mockHost({
    requests: {
      'scripts.list': {
        ...listed,
        scripts: [
          { name: 'setup', command: 'pnpm install' },
          { name: 'archive', command: 'docker compose down -v' },
          { name: 'dev', command: 'pnpm dev' }
        ]
      },
      'scripts.run': (input) => {
        runs.push(input.name)
        return { terminalId: 't1', title: input.name, visible: true }
      }
    }
  })
  const view = await mount(panel, { host })
  await view.emit('workspace.changed', { context })
  const run = () => view.findAll({ role: 'button', text: 'Run' })

  // setup: the first press only asks.
  await view.press(run()[0] as NonNullable<ReturnType<typeof view.find>>)
  assert.deepEqual(runs, [])
  assert.ok(view.find({ text: /Orca runs this when it creates a worktree/ }))
  assert.equal(run()[0]?.disabled, true)

  // Cancel closes it without running anything.
  await view.press({ role: 'button', text: 'Cancel' })
  assert.equal(view.find({ role: 'button', text: 'Run setup' }), null)
  assert.deepEqual(runs, [])

  // archive: confirming runs it once and closes the question.
  await view.press(run()[1] as NonNullable<ReturnType<typeof view.find>>)
  assert.ok(view.find({ text: /before it removes a worktree/ }))
  await view.press({ role: 'button', text: 'Run archive' })
  assert.deepEqual(runs, ['archive'])
  assert.equal(view.find({ role: 'button', text: 'Run archive' }), null)

  // Any other script runs on the first press.
  await view.press(run()[2] as NonNullable<ReturnType<typeof view.find>>)
  assert.deepEqual(runs, ['archive', 'dev'])
  assert.deepEqual(view.errors, [])
  assert.deepEqual(view.warnings, [])
  await view.unmount()
})

test('drops a pending confirmation when the focused workspace changes', async () => {
  const host = mockHost({ requests: { 'scripts.list': listed } })
  const view = await mount(panel, { host })
  await view.emit('workspace.changed', { context })
  const [setup] = view.findAll({ role: 'button', text: 'Run' })
  assert.ok(setup)
  await view.press(setup)
  assert.ok(view.find({ role: 'button', text: 'Run setup' }))
  await view.emit('workspace.changed', { context: { ...context, branch: 'other' } })
  assert.equal(view.find({ role: 'button', text: 'Run setup' }), null)
  await view.unmount()
})
