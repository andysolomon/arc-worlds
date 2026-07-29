import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : process.argv[index + 1]
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      ...options,
    })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`${command} exited with ${code ?? signal}`))
    })
  })
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Preview server exited with code ${child.exitCode}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // The preview server is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250))
  }
  throw new Error(`Preview server did not become ready at ${url}`)
}

const root = resolve(import.meta.dirname, '..')
const projectDir = resolve(root, option('project-dir', '.'))
const port = Number(option('port', '4174'))
const runs = option('runs', process.env.PERF_RUNS ?? '3')
const output = option('output', '.artifacts/performance/results.json')
const cpuThrottle = option('cpu-throttle', process.env.PERF_CPU_THROTTLE ?? '1')
const url = `http://127.0.0.1:${port}`
const viteCli = resolve(projectDir, 'node_modules/vite/bin/vite.js')

const preview = spawn(
  'bun',
  [viteCli, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  {
    cwd: projectDir,
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  },
)

try {
  await waitForServer(url, preview)
  await run(
    'bun',
    [
      resolve(root, 'scripts/performance-benchmark.mjs'),
      '--url',
      url,
      '--runs',
      runs,
      '--output',
      output,
      '--cpu-throttle',
      cpuThrottle,
    ],
    { cwd: root },
  )
} finally {
  if (preview.exitCode === null) {
    if (process.platform === 'win32') preview.kill('SIGTERM')
    else process.kill(-preview.pid, 'SIGTERM')
  }
}
