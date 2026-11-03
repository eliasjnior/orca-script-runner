#!/usr/bin/env node
// Writes the Orca plugin typings into every plugin's `.orca/types`, the way
// `orca plugin types` does. Some Orca builds ship without the typings file that command reads
// (1.4.247 fails with ENOENT), so on failure this downloads the same files from the Orca
// repository at the tag matching the installed CLI and writes the same layout.
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pluginDirs } from './plugins.mjs'

const RAW = 'https://raw.githubusercontent.com/stablyai/orca'
const pkg = JSON.parse(await readFile('package.json', 'utf8'))

// Mirrors src/cli/plugin-authoring/plugin-type-files.ts in the Orca repository.
const MODULE_TYPINGS = [
  'orca.d.ts',
  'orca-components.d.ts',
  'orca-components-layout.d.ts',
  'orca-components-data.d.ts'
]
const SURFACE_TYPINGS = ['orca-host', 'orca-frame', 'orca-worker', 'orca-services', 'orca-testing']
const TYPES_TSCONFIG = {
  compilerOptions: {
    strict: true,
    noEmit: true,
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    allowImportingTsExtensions: true,
    isolatedModules: true,
    jsx: 'react-jsx',
    jsxImportSource: 'orca',
    lib: ['ES2022', 'DOM'],
    preserveSymlinks: true,
    typeRoots: ['.'],
    types: ['orca', ...SURFACE_TYPINGS]
  }
}
const NOTE = '// Written by scripts/orca-types.mjs from the Orca repository. Do not edit.\n'

/** The installed Orca's version, else ORCA_VERSION, else `config.orcaVersion` in package.json (CI). */
function orcaVersion() {
  try {
    const out = execFileSync('orca', ['--version'], { encoding: 'utf8' }).trim()
    const version = out.match(/\d+\.\d+\.\d+/)?.[0]
    if (version) return version
  } catch {
    // No Orca on this machine, as on CI.
  }
  const fallback = process.env.ORCA_VERSION ?? pkg.config?.orcaVersion
  if (!fallback)
    throw new Error('No orca CLI: set ORCA_VERSION or config.orcaVersion in package.json')
  return fallback
}

function viaCli(dir) {
  try {
    execFileSync('orca', ['plugin', 'types', dir, '--json'], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

async function download(tag, path) {
  const response = await fetch(`${RAW}/${tag}/${path}`)
  if (!response.ok) throw new Error(`GET ${path} at ${tag}: HTTP ${response.status}`)
  return response.text()
}

async function fetchTypings(tag) {
  const modules = await Promise.all(
    MODULE_TYPINGS.map((file) => download(tag, `resources/plugins/declarative/${file}`))
  )
  const typings = { orca: modules.join('\n') }
  for (const name of SURFACE_TYPINGS) {
    typings[name] = await download(tag, `resources/plugins/types/${name}.d.ts`)
  }
  return typings
}

async function writeTypings(dir, typings) {
  await mkdir(join(dir, '.orca', 'types'), { recursive: true })
  await writeFile(join(dir, '.orca', '.gitignore'), '*\n')
  for (const [name, text] of Object.entries(typings)) {
    await mkdir(join(dir, '.orca', 'types', name), { recursive: true })
    await writeFile(join(dir, '.orca', 'types', name, 'index.d.ts'), NOTE + text)
  }
  await writeFile(
    join(dir, '.orca', 'types', 'tsconfig.json'),
    `${JSON.stringify(TYPES_TSCONFIG, null, 2)}\n`
  )
}

let typings
for (const dir of await pluginDirs()) {
  if (viaCli(dir)) {
    console.log(`${dir}: typings from orca plugin types`)
    continue
  }
  if (!typings) {
    const tag = `v${orcaVersion()}`
    console.log(`orca plugin types failed; downloading the ${tag} typings from GitHub`)
    typings = await fetchTypings(tag)
  }
  await writeTypings(dir, typings)
  console.log(`${dir}: typings written`)
}
