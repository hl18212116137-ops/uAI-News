import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const nextCli = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next')
const args = process.argv.slice(2)

dotenv.config({ path: path.join(root, '.env.local') })

if (!args.includes('-p') && !args.includes('--port')) {
  args.push('-p', process.env.PORT || '3001')
}

function argValue(shortName, longName) {
  const shortIndex = args.indexOf(shortName)
  if (shortIndex >= 0) return args[shortIndex + 1]
  const longIndex = args.indexOf(longName)
  if (longIndex >= 0) return args[longIndex + 1]
  const inline = args.find((arg) => arg.startsWith(`${longName}=`))
  return inline ? inline.slice(longName.length + 1) : undefined
}

const port = argValue('-p', '--port') || process.env.PORT || '3001'
const localAuthUrl = /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/i
if (!process.env.NEXTAUTH_URL || localAuthUrl.test(process.env.NEXTAUTH_URL)) {
  process.env.NEXTAUTH_URL = `http://localhost:${port}`
}

const child = spawn(process.execPath, [nextCli, 'dev', ...args], {
  cwd: root,
  env: {
    ...process.env,
    NEXT_DIST_DIR: process.env.NEXT_DIST_DIR || '.next-dev',
  },
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
