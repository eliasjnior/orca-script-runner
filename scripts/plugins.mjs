import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

/** Every folder under plugins/ that holds an orca-plugin.json, relative to the repository root. */
export async function pluginDirs() {
  const entries = await readdir('plugins', { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join('plugins', entry.name))
    .filter((dir) => existsSync(join(dir, 'orca-plugin.json')))
    .sort()
}
