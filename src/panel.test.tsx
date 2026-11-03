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
  assert.ok(view.find({ label: '“setup” is running without a tab' }))
  assert.equal(view.find({ text: /Opened/ }), null)
  await view.unmount()
})

test('keeps the Run label while a script starts, disables every Run and shows a spinner', async () => {
  const setup = { name: 'setup', command: 'pnpm install' }
  const dev = { name: 'dev', command: 'pnpm dev' }
  const cards = (busy: string | null) => () => (
    <>
      <panel.ScriptCard script={setup} workspaceId="wt-1" busy={busy} />
      <panel.ScriptCard script={dev} workspaceId="wt-1" busy={busy} />
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
