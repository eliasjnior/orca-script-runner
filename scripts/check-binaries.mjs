#!/usr/bin/env node
// Fails when a tracked file is binary or a symlink. The repository root is the plugin, so Orca
// installs every tracked file, and its plugin directory refuses to list a tagged commit that bundles
// them (executables, native modules, archives, bytecode, fonts, symlinks); PNG, JPEG, WEBP and GIF
// images are allowed.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const IMAGE = /\.(png|jpe?g|webp|gif)$/i
const entries = execFileSync('git', ['ls-files', '-s', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .map((line) => {
    const [meta, path] = line.split('\t')
    return { mode: meta.split(' ')[0], path }
  })

const bad = []
for (const { mode, path } of entries) {
  if (mode === '120000') bad.push(`${path} (symlink)`)
  else if (!IMAGE.test(path) && readFileSync(path).includes(0)) bad.push(`${path} (binary)`)
}

if (bad.length > 0) {
  console.error(`Orca's directory rejects binary files in a plugin:\n  ${bad.join('\n  ')}`)
  process.exit(1)
}
console.log(`no binary files in ${entries.length} tracked files`)
