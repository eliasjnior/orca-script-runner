import { assert, test } from 'orca/testing'
import type { Workspace } from './protocol'
import { matchFocused } from './workspace'

const ws = (id: string, name: string, branch: string | null): Workspace => ({
  id,
  name,
  branch,
  path: `/repos/${id}`
})

test('matches the focused workspace on name and branch', () => {
  const list = [ws('a', 'api', 'main'), ws('b', 'api', 'feat/x'), ws('c', 'web', 'main')]
  assert.equal(matchFocused({ displayName: 'api', branch: 'feat/x' }, list)?.id, 'b')
  assert.equal(matchFocused({ displayName: 'api', branch: 'refs/heads/main' }, list)?.id, 'a')
})

test('falls back to a unique name, and gives up when ambiguous', () => {
  const list = [ws('a', 'api', 'main'), ws('b', 'docs', null)]
  assert.equal(matchFocused({ displayName: 'docs', branch: '' }, list)?.id, 'b')
  assert.equal(matchFocused({ displayName: 'api', branch: 'other' }, list)?.id, 'a')
  assert.equal(matchFocused({ displayName: 'nope', branch: 'main' }, list), null)
  const twins = [ws('a', 'api', 'main'), ws('b', 'api', 'main')]
  assert.equal(matchFocused({ displayName: 'api', branch: 'main' }, twins), null)
})
