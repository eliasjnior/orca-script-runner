#!/usr/bin/env node
// Runs one task in every plugin folder and fails if any of them fails.
// Usage: node scripts/each-plugin.mjs <typecheck|test|validate|check> [plugin-dir...]
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pluginDirs } from './plugins.mjs'

const TASKS = {
  typecheck: (dir) => [join('node_modules', '.bin', 'tsc'), ['-p', dir]],
  test: (dir) => ['orca', ['plugin', 'test', dir]],
  validate: (dir) => ['orca', ['plugin', 'validate', dir]],
  check: (dir) => ['orca', ['plugin', 'check', dir]]
}

const [task, ...only] = process.argv.slice(2)
if (!TASKS[task]) {
  console.error(`usage: each-plugin.mjs <${Object.keys(TASKS).join('|')}> [plugin-dir...]`)
  process.exit(1)
}

const dirs = only.length > 0 ? only : await pluginDirs()
if (task === 'typecheck' && dirs.some((dir) => !existsSync(join(dir, '.orca', 'types')))) {
  console.error('Missing .orca/types: run `pnpm types` first.')
  process.exit(1)
}

const failed = []
for (const dir of dirs) {
  console.log(`\n▶ ${task} ${dir}`)
  const [command, args] = TASKS[task](dir)
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.status !== 0) failed.push(dir)
}

if (failed.length > 0) {
  console.error(`\n${task} failed in: ${failed.join(', ')}`)
  process.exit(1)
}
