// Headless Chrome step runner for the Coupette frontend, logged in as the seeded admin.
// Called by driver.sh browse: node browse.mjs <path> [--fill <label>=<text>] [--click <text>]
//   [--wait <text>] [--goto <path>] [--shot <name>] …  (steps run in order)
import { createRequire } from 'node:module'

const require = createRequire(`${process.env.PW_PREFIX}/noop.js`)
const { chromium } = require('playwright-core')

const BASE = 'http://localhost:5173'
const [path, ...rest] = process.argv.slice(2)
const steps = []
for (let i = 0; i < rest.length; i += 2) steps.push([rest[i], rest[i + 1]])

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 1324, height: 900 }, locale: 'en-US' })
// Same keys AuthContext and ProtectedRoute read: skips OAuth and the onboarding redirect.
await context.addInitScript((token) => {
  localStorage.setItem('auth_token', token)
  localStorage.setItem('onboarded', '1')
}, process.env.TOKEN)

const page = await context.newPage()
const problems = []
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`))
page.on('response', (r) => {
  if (r.url().includes('/api/') && r.status() >= 400) problems.push(`api ${r.status()}: ${r.url()}`)
})

let shots = 0
const shoot = async (name) => {
  const file = `${process.env.SHOTS}/${name}.png`
  await page.screenshot({ path: file })
  console.log(`screenshot: ${file}`)
  shots += 1
}

try {
  await page.goto(BASE + path, { waitUntil: 'networkidle' })
  for (const [op, arg] of steps) {
    if (op === '--fill') {
      const [label, ...text] = arg.split('=')
      // Placeholder first (search boxes have no label), then accessible label
      const byPlaceholder = page.getByPlaceholder(label)
      const field = (await byPlaceholder.count()) ? byPlaceholder : page.getByLabel(label)
      await field.first().fill(text.join('='))
    } else if (op === '--click') {
      // exact: each WineCard is itself a role=button whose name contains its inner buttons' text
      await page.getByRole('button', { name: arg, exact: true }).first().click()
    } else if (op === '--wait') {
      await page.getByText(arg).first().waitFor({ timeout: 15000 })
    } else if (op === '--goto') {
      await page.goto(BASE + arg, { waitUntil: 'networkidle' })
    } else if (op === '--shot') {
      await shoot(arg)
    } else {
      throw new Error(`unknown step ${op}`)
    }
  }
  if (!shots) await shoot('page')
} catch (err) {
  await shoot('failure').catch(() => {})
  console.error(`step failed: ${err.message}`)
  process.exitCode = 1
} finally {
  for (const p of problems) console.log(p)
  await browser.close()
}
