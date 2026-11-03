import { assert, test } from 'orca/testing'
import { parseScripts } from './config'

test('reads every non-empty string under scripts, in file order', () => {
  const source = [
    'scripts:',
    '  setup: |',
    '    pnpm install',
    '    pnpm build',
    '  archive: echo bye',
    '  lint: "pnpm lint"',
    '  empty: "   "',
    '  nested:',
    '    not: a string',
    'defaultTabs:',
    '  - title: Agent'
  ].join('\n')
  assert.deepEqual(parseScripts(source), [
    { name: 'setup', command: 'pnpm install\npnpm build' },
    { name: 'archive', command: 'echo bye' },
    { name: 'lint', command: 'pnpm lint' }
  ])
})

test('an empty file or one without scripts has none', () => {
  assert.deepEqual(parseScripts(''), [])
  assert.deepEqual(parseScripts('worktree:\n  sharedDirectories: [.cache]\n'), [])
})

test('refuses what Orca refuses: duplicate keys, a non-mapping root or scripts', () => {
  assert.throws(() => parseScripts('scripts:\n  setup: a\n  setup: b\n'))
  assert.throws(() => parseScripts('- a\n- b\n'), /top level/)
  assert.throws(() => parseScripts('scripts:\n  - pnpm install\n'), /must be a mapping/)
})
