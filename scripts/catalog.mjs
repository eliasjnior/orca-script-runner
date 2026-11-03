#!/usr/bin/env node
// Adds each plugin's committed version to orca-catalog.json, the catalog Orca reads from this
// repository's `main` branch. Run it after committing a version bump, then commit the catalog.
// Usage: node scripts/catalog.mjs [plugin-dir...]
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
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

/** Width and height of a PNG, read from its header; null for anything else. */
function pngSize(bytes) {
  const signature = '89504e470d0a1a0a'
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== signature) return null
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

/** One catalog image: a file of this repository, pinned by hash, as Orca's catalog expects. */
async function catalogImage(sourcePath, relative, alt) {
  const path = `${sourcePath}/${relative}`
  const bytes = await readFile(path)
  const size = pngSize(bytes)
  if (!size) throw new Error(`${path}: catalog images must be PNG files here`)
  return { path, alt, sha256: createHash('sha256').update(bytes).digest('hex'), ...size }
}

/** The release's `images`, built from the manifest's icon, cover and screenshots (as Orca's
 *  own catalog tooling does), so the catalog shows them before anything is installed. */
async function releaseImages(sourcePath, manifest) {
  const images = {}
  if (manifest.icon) images.icon = await catalogImage(sourcePath, manifest.icon, manifest.name)
  if (manifest.cover) {
    images.cover = await catalogImage(sourcePath, manifest.cover.path, manifest.cover.alt)
  }
  if (manifest.screenshots?.length) {
    images.screenshots = await Promise.all(
      manifest.screenshots.map((shot) => catalogImage(sourcePath, shot.path, shot.alt))
    )
  }
  return Object.keys(images).length > 0 ? images : null
}

/** Catalog filter slugs for what the plugin contributes. */
function categoriesOf(manifest) {
  const contributes = manifest.contributes ?? {}
  return [
    ...(contributes.panels?.length ? ['panels'] : []),
    ...(contributes.commands?.length ? ['commands'] : [])
  ]
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
  const categories = categoriesOf(manifest)
  if (categories.length > 0) plugin.categories = categories

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
  const images = await releaseImages(sourcePath, manifest)
  const release = {
    ...entry,
    ...(manifest.license ? { license: manifest.license } : {}),
    repository,
    updatedAt: today,
    ...(images ? { images } : {})
  }
  plugin.releases = [release, ...plugin.releases].slice(0, MAX_RELEASES)
  // Orca reads catalog images from this repository's main branch, not from each release's commit,
  // so only the newest release can vouch for the image files there now.
  for (const older of plugin.releases.slice(1)) delete older.images
  changed = true
  console.log(`${id} ${entry.version}: added (commit ${entry.commit.slice(0, 7)})`)
}

if (changed) {
  await writeFile(CATALOG, `${JSON.stringify(catalog, null, 2)}\n`)
  // Lay it out the way the repository's formatter does, so CI's lint accepts it.
  execFileSync(join('node_modules', '.bin', 'biome'), ['format', '--write', CATALOG], {
    stdio: 'ignore'
  })
  execFileSync('orca', ['plugin', 'validate', CATALOG], { stdio: 'inherit' })
  console.log(`Updated ${CATALOG}: commit and push it to publish.`)
} else {
  console.log(`${CATALOG} is up to date.`)
}
