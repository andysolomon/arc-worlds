import { gzipSync } from 'node:zlib'
import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const dist = resolve(root, 'dist')
const budgetPath = resolve(root, 'performance-budget.json')
const outputPath = resolve(root, '.artifacts/performance/bundle.json')

const budget = JSON.parse(await readFile(budgetPath, 'utf8')).bundle
const html = await readFile(resolve(dist, 'index.html'), 'utf8')
const entryMatch = html.match(/<script[^>]+src="([^"]+\.js)"/)

if (!entryMatch) {
  throw new Error('Could not find the JavaScript entry point in dist/index.html')
}

const entryPath = resolve(dist, entryMatch[1].replace(/^\//, ''))
const entry = await readFile(entryPath)
const assetNames = await readdir(resolve(dist, 'assets'))
const workerNames = assetNames.filter((name) => /\.worker-[^.]+\.js$/.test(name))

if (workerNames.length === 0) {
  throw new Error('No procedural bake worker was emitted in dist/assets')
}

const workers = await Promise.all(workerNames.map(async (name) => {
  const path = resolve(dist, 'assets', name)
  return { name, rawBytes: (await stat(path)).size }
}))

const result = {
  entry: {
    name: entryMatch[1].split('/').at(-1),
    rawBytes: entry.byteLength,
    gzipBytes: gzipSync(entry).byteLength,
  },
  workers,
  budgets: budget,
}

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`)

const failures = []
if (result.entry.gzipBytes > budget.entryGzipBytes) {
  failures.push(
    `entry gzip ${result.entry.gzipBytes} B exceeds ${budget.entryGzipBytes} B`,
  )
}
for (const worker of workers) {
  if (worker.rawBytes > budget.workerRawBytes) {
    failures.push(
      `${worker.name} ${worker.rawBytes} B exceeds ${budget.workerRawBytes} B`,
    )
  }
}

console.table([
  {
    asset: result.entry.name,
    measurement: 'gzip',
    bytes: result.entry.gzipBytes,
    budget: budget.entryGzipBytes,
  },
  ...workers.map((worker) => ({
    asset: worker.name,
    measurement: 'raw',
    bytes: worker.rawBytes,
    budget: budget.workerRawBytes,
  })),
])

if (failures.length > 0) {
  console.error(`Bundle budget failed:\n- ${failures.join('\n- ')}`)
  process.exitCode = 1
} else {
  console.log(`Bundle budget passed. Details: ${outputPath}`)
}
