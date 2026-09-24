// Proof of the slow state and Reload: node shot-slow.mjs <baseUrl> <outDir>
// Blocks the app entry script for window frames, so the app in the frame never boots, then lifts the block
// and presses Reload.
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'

const require = createRequire(import.meta.url)
const { chromium } = require('/home/coder/posthog/.claude/worktrees/agent-a2ebcac554c28c48a/node_modules/playwright')
const [, , baseUrl, outDir] = process.argv
fs.mkdirSync(outDir, { recursive: true })
const creds = JSON.parse(fs.readFileSync('/home/coder/dev/os-shell-stack/credentials.json', 'utf8'))
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
const page = await context.newPage()
await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
const csrf = (await context.cookies()).find((c) => c.name.includes('csrftoken'))?.value
await context.request.post(`${baseUrl}/api/login/`, {
    data: { email: creds.email, password: creds.password },
    headers: { 'X-CSRFToken': csrf ?? '', Referer: `${baseUrl}/login` },
})
await page.goto(`${baseUrl}/os`, { waitUntil: 'load' })
await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('posthog-os-')) localStorage.removeItem(k)
    for (const k of Object.keys(sessionStorage)) if (k.startsWith('posthog-os-')) sessionStorage.removeItem(k)
})
await page.goto(`${baseUrl}/os`, { waitUntil: 'load' })
await page.waitForSelector('[data-attr="os-window-layer"]', { timeout: 120000 })
await page.waitForTimeout(3000)

let blocking = true
await page.route(/\/(src\/index\.tsx|static\/index(-[A-Z0-9]+)?\.js)/, (route) => {
    const frame = route.request().frame()
    if (blocking && frame.name().startsWith('posthog-os-window:')) {
        return route.abort()
    }
    return route.continue()
})
const t0 = Date.now()
await page.locator('.OsShell__icon-label', { hasText: /^Workflows$/ }).first().evaluate((el) => el.click())
await page.waitForSelector('[data-attr="os-window-frame-loading"]', { timeout: 10000 })
await page.screenshot({ path: path.join(outDir, 'slow-1-loading.png') })
await page.waitForSelector('[data-attr="os-window-frame-slow"]', { timeout: 40000 })
const slowAfter = Date.now() - t0
await page.screenshot({ path: path.join(outDir, 'slow-2-slow-bar.png') })
blocking = false
const t1 = Date.now()
await page.click('[data-attr="os-window-frame-reload"]')
await page.waitForSelector('[data-attr="os-window-frame-slow"]', { state: 'detached', timeout: 60000 })
await page.waitForSelector('[data-attr="os-window-frame-loading"]', { state: 'detached', timeout: 60000 })
await page.waitForTimeout(2000)
const reloadMs = Date.now() - t1
await page.screenshot({ path: path.join(outDir, 'slow-3-after-reload.png') })
const result = { slowBarAfterMs: slowAfter, readyAfterReloadMs: reloadMs }
fs.writeFileSync(path.join(outDir, 'slow.json'), JSON.stringify(result, null, 2))
console.log(result)
await browser.close()
