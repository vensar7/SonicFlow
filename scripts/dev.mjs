import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { resolve } from 'node:path'

const projectRoot = process.cwd()
const vite = spawn(process.execPath, [resolve(projectRoot, 'node_modules/vite/bin/vite.js'), '--host', '0.0.0.0'], {
  cwd: projectRoot,
  stdio: 'inherit',
})

let electron
let stopping = false
let viteReady = false

function stop(child) {
  if (child && child.exitCode === null && child.signalCode === null) child.kill()
}

function finish(code) {
  if (stopping) return
  stopping = true
  process.exitCode = code
  stop(electron)
  stop(vite)
}

vite.on('error', () => finish(1))
vite.on('exit', (code) => {
  if (!stopping) finish(code ?? 1)
})

for (let attempt = 0; attempt < 150 && !viteReady && !stopping; attempt += 1) {
  try {
    const response = await fetch('http://localhost:5173')
    viteReady = response.ok
  } catch {
    await delay(200)
  }
}

if (!viteReady || stopping) {
  finish(1)
  await new Promise((done) => vite.once('exit', done))
  process.exit()
}

electron = spawn(process.execPath, [resolve(projectRoot, 'node_modules/electron/cli.js'), '.'], {
  cwd: projectRoot,
  stdio: 'inherit',
})

electron.on('error', () => finish(1))
electron.on('exit', (code) => finish(code ?? 1))

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => finish(0))
}