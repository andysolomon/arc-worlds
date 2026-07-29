import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : process.argv[index + 1]
}

const root = resolve(import.meta.dirname, '..')
const resultsPath = resolve(root, option('results', '.artifacts/performance/results.json'))
const baselineOption = option('baseline')
const budgetPath = resolve(root, option('budget', 'performance-budget.json'))
const budget = JSON.parse(await readFile(budgetPath, 'utf8'))
const results = JSON.parse(await readFile(resultsPath, 'utf8'))
const summary = results.summary
const failures = []

// The absolute browser budgets were calibrated on developer hardware, and a
// two-core shared CI runner has never met two of them on any run it has ever
// had. On CI those rows use their own calibrated ceilings — measured on the
// runner, with headroom — while the relative regression check below stays the
// tight guard. `--profile local` forces developer budgets anywhere.
const profile = option('profile', process.env.CI ? 'ci' : 'local')
const browser = profile === 'ci'
  ? { ...budget.browser, ...(budget.browserCiOverrides ?? {}) }
  : budget.browser
console.log(`Budget profile: ${profile}`)

for (const [metric, rule] of Object.entries(browser)) {
  const value = summary[metric]
  const suffix = rule.unit ? ` ${rule.unit}` : ''

  if (value === undefined) {
    failures.push(`${metric} was not reported`)
    continue
  }
  if ('max' in rule && value > rule.max) {
    failures.push(`${metric}: ${value}${suffix} exceeds ${rule.max}${suffix}`)
  }
  if ('min' in rule && value < rule.min) {
    failures.push(`${metric}: ${value}${suffix} is below ${rule.min}${suffix}`)
  }
  if ('equals' in rule && value !== rule.equals) {
    failures.push(`${metric}: ${JSON.stringify(value)} must equal ${JSON.stringify(rule.equals)}`)
  }
}

const regressionRows = []
if (baselineOption) {
  const baselinePath = resolve(root, baselineOption)
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8')).summary
  const maxPercent = budget.regression.maxPercent

  for (const metric of budget.regression.lowerIsBetter) {
    const current = summary[metric]
    const previous = baseline[metric]
    if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) continue
    const percent = ((current - previous) / previous) * 100
    regressionRows.push({ metric, baseline: previous, current, change: `${percent.toFixed(1)}%` })
    if (percent > maxPercent) {
      failures.push(`${metric} regressed ${percent.toFixed(1)}% (limit ${maxPercent}%)`)
    }
  }

  for (const metric of budget.regression.higherIsBetter) {
    const current = summary[metric]
    const previous = baseline[metric]
    if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) continue
    const percent = ((previous - current) / previous) * 100
    regressionRows.push({ metric, baseline: previous, current, change: `${(-percent).toFixed(1)}%` })
    if (percent > maxPercent) {
      failures.push(`${metric} regressed ${percent.toFixed(1)}% (limit ${maxPercent}%)`)
    }
  }
}

console.table(Object.entries(browser).map(([metric, rule]) => ({
  metric,
  value: summary[metric],
  budget: 'equals' in rule
    ? `= ${rule.equals}`
    : `${'min' in rule ? `>= ${rule.min}` : ''}${'min' in rule && 'max' in rule ? ', ' : ''}${'max' in rule ? `<= ${rule.max}` : ''}`,
})))
if (regressionRows.length > 0) {
  console.log(`Relative regression limit: ${budget.regression.maxPercent}%`)
  console.table(regressionRows)
}

if (failures.length > 0) {
  console.error(`Performance budget failed:\n- ${failures.join('\n- ')}`)
  process.exitCode = 1
} else {
  console.log('Performance budget passed.')
}
