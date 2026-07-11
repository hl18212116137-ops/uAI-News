import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const standaloneDir = path.join(root, '.next', 'standalone')
const standaloneServer = path.join(standaloneDir, 'server.js')
const runtimeDir = path.join(root, '.next-standalone-runtime')
const runtimeServer = path.join(runtimeDir, 'server.js')

function assertPathInsideRoot(targetPath) {
  const relative = path.relative(root, path.resolve(targetPath))
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to operate outside project root: ${targetPath}`)
  }
}

if (!fs.existsSync(standaloneServer)) {
  throw new Error('Missing .next/standalone/server.js. Run npm.cmd run build first.')
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
  throw new Error('Missing .next/static. Run npm.cmd run build first.')
}

assertPathInsideRoot(runtimeDir)
fs.rmSync(runtimeDir, { recursive: true, force: true })
fs.cpSync(standaloneDir, runtimeDir, { recursive: true, force: true })
fs.cpSync(staticSource, path.join(runtimeDir, '.next', 'static'), { recursive: true, force: true })

const publicSource = path.join(root, 'public')
if (fs.existsSync(publicSource)) {
  fs.cpSync(publicSource, path.join(runtimeDir, 'public'), { recursive: true, force: true })
}

const child = spawn(process.execPath, [runtimeServer], {
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
