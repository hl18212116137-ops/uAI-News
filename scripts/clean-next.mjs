import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dirs = ['.next', '.next-dev', '.next-standalone-runtime']

for (const dir of dirs) {
  const target = path.join(root, dir)
  const relative = path.relative(root, target)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to remove path outside project root: ${target}`)
  }
  fs.rmSync(target, { recursive: true, force: true })
}
