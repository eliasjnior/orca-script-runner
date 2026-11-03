/// <reference types="node" />
// Reads the `scripts:` mapping of a workspace's orca.yaml.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from '../vendor/yaml.mjs'
import type { Script } from './protocol'

export const CONFIG_FILE = 'orca.yaml'

/** Orca rejects a whole orca.yaml past 256 KiB. */
const MAX_FILE_BYTES = 256 * 1024

/**
 * Every `scripts.<name>` whose value is a non-empty string, in file order, trimmed the way Orca
 * trims them. Throws on invalid YAML or duplicate keys, which make Orca ignore the whole file.
 */
export function parseScripts(source: string): Script[] {
  const root = parse(source, { uniqueKeys: true, maxAliasCount: 100 })
  if (root === null || root === undefined) return []
  if (!isMapping(root)) throw new Error('orca.yaml must be a mapping at the top level')
  const scripts = root.scripts
  if (scripts === undefined || scripts === null) return []
  if (!isMapping(scripts)) throw new Error('`scripts` in orca.yaml must be a mapping')
  return Object.entries(scripts).flatMap(([name, value]) => {
    const command = typeof value === 'string' ? value.trim() : ''
    return command ? [{ name, command }] : []
  })
}

function isMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The scripts of the orca.yaml in `dir`, or null when the folder has no orca.yaml. */
export async function readScripts(
  dir: string
): Promise<{ path: string; scripts: Script[] } | null> {
  const path = join(dir, CONFIG_FILE)
  let source: string
  try {
    source = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
  if (Buffer.byteLength(source, 'utf8') > MAX_FILE_BYTES) {
    throw new Error('orca.yaml is larger than the 256 KiB Orca accepts')
  }
  return { path, scripts: parseScripts(source) }
}
