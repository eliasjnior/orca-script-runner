#!/usr/bin/env node
// Adds each plugin's committed version to orca-catalog.json, the catalog Orca reads from this
// repository's `main` branch. Run it after committing a version bump, then commit the catalog.
// Usage: node scripts/catalog.mjs [plugin-dir...]
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pluginDirs } from './plugins.mjs'

const CATALOG = 'orca-catalog.json'
const MAX_RELEASES = 32

const pkg = JSON.parse(await readFile('package.json', 'utf8'))
const repository = String(pkg.repository ?? '').replace(/\.git$/, '')
const owner = repository.match(/^https:\/\/github\.com\/([^/]+)\/[^/]+$/)?.[1]
if (!owner) {
  console.error('Set "repository" in package.json to https://github.com/<owner>/<repo>.')
  process.exit(1)
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function releaseEntry(dir) {
  let stdout
  try {
    stdout = execFileSync('orca', ['plugin', 'release-entry', dir, '--json'], { encoding: 'utf8' })
  } catch (error) {
    stdout = error.stdout ?? ''
  }
  const answer = JSON.parse(stdout || '{}')
  if (!answer.ok) throw new Error(`${dir}: ${answer.error?.message ?? 'release-entry failed'}`)
  return answer.result
}

const catalog = existsSync(CATALOG)
  ? JSON.parse(await readFile(CATALOG, 'utf8'))
  : {
      $schema:
        'https://raw.githubusercontent.com/stablyai/orca/main/docs/schemas/plugins/orca-catalog.v2.schema.json',
      catalogVersion: 2,
      name: `${owner}'s Orca plugins`,
      owner,
      plugins: []
    }

// Releases pin HEAD, which must stay reachable: a squash-merged pull request's own commits do not.
git('fetch', '--quiet', 'origin', 'main')
try {
  git('merge-base', '--is-ancestor', 'HEAD', 'origin/main')
} catch {
  console.error('HEAD is not on origin/main: merge the version bump first, then run this on main.')
  process.exit(1)
}

const only = process.argv.slice(2)
const dirs = only.length > 0 ? only : await pluginDirs()
const today = new Date().toISOString().slice(0, 10)
let changed = false

for (const dir of dirs) {
  if (git('status', '--porcelain', '--', dir)) {
    throw new Error(`${dir} has uncommitted changes: commit them first, the catalog pins commits.`)
  }
  const manifest = JSON.parse(await readFile(join(dir, 'orca-plugin.json'), 'utf8'))
  const { entry, sourcePath } = releaseEntry(dir)
  const id = `${owner.toLowerCase()}.${manifest.id}`

  let plugin = catalog.plugins.find((candidate) => candidate.id === id)
  if (!plugin) {
    plugin = {
      id,
      source: { kind: 'git', url: `${repository}.git`, ref: 'main', path: sourcePath },
      releases: []
    }
    catalog.plugins.push(plugin)
  }
  if (manifest.description) plugin.description = manifest.description

  const listed = plugin.releases.find((release) => release.version === entry.version)
  if (listed) {
    if (listed.contentHash !== entry.contentHash) {
      throw new Error(
        `${dir}: version ${entry.version} is already listed with other files. Listed versions are permanent: bump "version" in orca-plugin.json.`
      )
    }
    console.log(`${id} ${entry.version}: already listed`)
    continue
  }
  const release = {
    ...entry,
    ...(manifest.license ? { license: manifest.license } : {}),
    repository,
    updatedAt: today
  }
  plugin.releases = [release, ...plugin.releases].slice(0, MAX_RELEASES)
  changed = true
  console.log(`${id} ${entry.version}: added (commit ${entry.commit.slice(0, 7)})`)
}

if (changed) {
  await writeFile(CATALOG, `${JSON.stringify(catalog, null, 2)}\n`)
  execFileSync('orca', ['plugin', 'validate', CATALOG], { stdio: 'inherit' })
  console.log(`Updated ${CATALOG}: commit and push it to publish.`)
} else {
  console.log(`${CATALOG} is up to date.`)
}
