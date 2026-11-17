#!/usr/bin/env node
// Release helper for .github/workflows/release.yml (and by hand).
//
//   node scripts/release.mjs plan <patch|minor|major>
//     Prints `version=X.Y.Z` and `mode=bump|publish` lines (for $GITHUB_OUTPUT).
//     bump: the version in orca-plugin.json is tagged, so it raises it and turns the changelog's
//       Unreleased section into the new version's, dated today (UTC). Fails when it is empty.
//     publish: the version in orca-plugin.json has no tag yet (a release pull request merged by
//       hand, or a run that stopped after merging), so that version is released as it is and
//       nothing is edited.
//   node scripts/release.mjs notes <X.Y.Z>
//     Prints that version's changelog section, for the GitHub release.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const MANIFEST = 'orca-plugin.json'
const CHANGELOG = 'CHANGELOG.md'
const REPO = 'https://github.com/eliasjnior/orca-script-runner'

function fail(message) {
  console.error(message)
  process.exit(1)
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/

function bumped(version, part) {
  const match = SEMVER.exec(version)
  if (!match) fail(`${MANIFEST} has version "${version}", which is not X.Y.Z`)
  const [major, minor, patch] = match.slice(1).map(Number)
  if (part === 'major') return `${major + 1}.0.0`
  if (part === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

const tagExists = (version) =>
  execFileSync('git', ['tag', '--list', `v${version}`], { encoding: 'utf8' }).trim() !== ''

/** The lines of the section under `## [name]`, up to the next `## ` heading; null when absent. */
function section(lines, name) {
  const start = lines.findIndex((line) => line.startsWith(`## [${name}]`))
  if (start === -1) return null
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => line.startsWith('## '))
  return { start, body: end === -1 ? rest : rest.slice(0, end) }
}

/** A section's text without its leading and trailing blank lines, nor the link definitions. */
function sectionText(body) {
  return body
    .filter((line) => !/^\[[^\]]+\]: /.test(line))
    .join('\n')
    .trim()
}

function plan(part) {
  if (!['patch', 'minor', 'major'].includes(part)) {
    fail(`Unknown bump "${part}": use patch, minor or major`)
  }
  const manifestText = readFileSync(MANIFEST, 'utf8')
  const current = JSON.parse(manifestText).version
  const changelog = readFileSync(CHANGELOG, 'utf8')
  const lines = changelog.split('\n')

  if (!tagExists(current)) {
    if (!section(lines, current)) fail(`${CHANGELOG} has no "## [${current}]" section to release`)
    return { version: current, mode: 'publish' }
  }

  const unreleased = section(lines, 'Unreleased')
  if (!unreleased || sectionText(unreleased.body) === '') {
    fail(`Nothing to release: ${CHANGELOG} has no entries under "## [Unreleased]"`)
  }
  const next = bumped(current, part)
  if (tagExists(next)) fail(`v${next} is already tagged`)

  const today = new Date().toISOString().slice(0, 10)
  lines.splice(unreleased.start + 1, 0, '', `## [${next}] - ${today}`)
  let updated = lines.join('\n')
  const unreleasedLink = /^\[Unreleased\]: .*$/m
  const links = `[Unreleased]: ${REPO}/compare/v${next}...HEAD\n[${next}]: ${REPO}/compare/v${current}...v${next}`
  updated = unreleasedLink.test(updated)
    ? updated.replace(unreleasedLink, links)
    : `${updated.trimEnd()}\n${links}\n`
  writeFileSync(CHANGELOG, updated)

  const versionField = `"version": "${current}"`
  if (!manifestText.includes(versionField)) fail(`${MANIFEST} has no ${versionField}`)
  writeFileSync(MANIFEST, manifestText.replace(versionField, `"version": "${next}"`))
  return { version: next, mode: 'bump' }
}

function notes(version) {
  const found = section(readFileSync(CHANGELOG, 'utf8').split('\n'), version)
  if (!found) fail(`${CHANGELOG} has no "## [${version}]" section`)
  const text = sectionText(found.body)
  if (text === '') fail(`The "## [${version}]" section of ${CHANGELOG} is empty`)
  return text
}

const [command, argument] = process.argv.slice(2)
if (command === 'plan') {
  const { version, mode } = plan(argument)
  console.log(`version=${version}\nmode=${mode}`)
} else if (command === 'notes') {
  console.log(notes(argument))
} else {
  fail('Usage: node scripts/release.mjs plan <patch|minor|major> | notes <X.Y.Z>')
}
