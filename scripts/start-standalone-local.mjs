import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const standaloneDir = path.join(root, '.next', 'standalone')
const standaloneServer = path.join(standaloneDir, 'server.js')

function assertPathInsideRoot(targetPath) {
  const relative = path.relative(root, path.resolve(targetPath))
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to operate outside project root: ${targetPath}`)
  }
}

if (!fs.existsSync(standaloneServer)) {
  throw new Error('Missing .next/standalone/server.js. Run npm run build first.')
}

dotenv.config({ path: path.join(root, '.env.local') })

process.env.PORT ||= '3001'
process.env.HOSTNAME ||= '127.0.0.1'

const localAuthUrl = /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/i
if (!process.env.NEXTAUTH_URL || localAuthUrl.test(process.env.NEXTAUTH_URL)) {
  process.env.NEXTAUTH_URL = `http://localhost:${process.env.PORT}`
}

const staticSource = path.join(root, '.next', 'static')
if (!fs.existsSync(staticSource)) {
  throw new Error('Missing .next/static. Run npm run build first.')
}

// Standalone already contains the traced dependencies. Copy assets only;
// duplicating its node_modules on every start doubles disk and startup work.
assertPathInsideRoot(standaloneDir)
fs.cpSync(staticSource, path.join(standaloneDir, '.next', 'static'), { recursive: true, force: true })
const publicSource = path.join(root, 'public')
if (fs.existsSync(publicSource)) {
  fs.cpSync(publicSource, path.join(standaloneDir, 'public'), { recursive: true, force: true })
}

const child = spawn(process.execPath, [standaloneServer], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
