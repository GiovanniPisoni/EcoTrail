import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { E2E_MONGODB_URI } from './support/e2e-config.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const serverEnv = {
  ...process.env,
  PORT: '3000',
  CLIENT_ORIGIN: 'http://localhost:5173',
  MONGODB_URI: E2E_MONGODB_URI,
  JWT_SECRET: 'e2e-secret',
  GEMINI_API_KEY: ''
}

const viteBin = [
  path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
  path.join(root, 'client', 'node_modules', 'vite', 'bin', 'vite.js')
].find(existsSync)

if (!viteBin) {
  console.error('Vite not found: run "npm install" first')
  process.exit(1)
}

const children = [
  spawn(process.execPath, ['src/index.js'], {
    cwd: path.join(root, 'server'),
    env: serverEnv,
    stdio: 'inherit'
  }),
  spawn(process.execPath, [viteBin, '--port', '5173', '--strictPort'], {
    cwd: path.join(root, 'client'),
    stdio: 'inherit'
  })
]

function stop() {
  children.forEach((child) => child.kill())
}

children.forEach((child) =>
  child.on('exit', (code) => {
    if (code) {
      console.error('A process of the e2e stack exited, shutting down')
      stop()
      process.exit(code)
    }
  })
)

process.on('SIGINT', stop)
process.on('SIGTERM', stop)
process.on('exit', stop)
