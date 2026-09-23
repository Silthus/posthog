// Three windows open, one minimized, in light and dark.
import { createRequire } from 'module'
import fs from 'fs'

const require = createRequire('/home/coder/posthog/.claude/worktrees/agent-a8b613bccfe80d434/package.json')
const { chromium } = require('playwright')

const creds = JSON.parse(fs.readFileSync('/home/coder/dev/os-shell-stack/credentials.json', 'utf8'))
const BASE = 'http://localhost:8106'
const OUT = '/tmp/os125/shots'
const browser = await chromium.launch()
const report = {}

for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme })
    const page = await context.newPage()
    page.setDefaultTimeout(60000)
    await context.request.post(`${BASE}/api/login/`, { data: { email: creds.email, password: creds.password } })
    await page.goto(`${BASE}/project/${creds.project_id}/os`)
    await page.waitForSelector('[data-attr="os-dock"]')
    await page.waitForTimeout(1500)
    for (const app of ['Dashboards', 'Product analytics', 'Web analytics']) {
        await page.click(`[data-attr="os-desktop-icon-tool-${app}"]`)
        await page.waitForTimeout(2500)
    }
    // Product analytics is in the background: the dock focuses it, then minimizes it.
    await page.locator('[data-attr="os-dock-window"]').nth(1).click()
    await page.waitForTimeout(500)
    await page.locator('[data-attr="os-dock-window"]').nth(1).click()
    await page.waitForTimeout(6000)
    for (const frame of page.frames()) {
        // The shared test user's theme setting wins over the browser's color scheme, so pin the theme the app renders.
        await frame
            .evaluate((dark) => {
                document.getElementById('bottom-notice')?.remove()
                document.body.setAttribute('theme', dark ? 'dark' : 'light')
            }, scheme === 'dark')
            .catch(() => {})
    }
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${OUT}/12-three-windows-one-minimized-${scheme}.png` })
    const dock = page.locator('[data-attr="os-dock"]')
    await dock.screenshot({ path: `${OUT}/13-dock-closeup-${scheme}.png` })
    // Hover a tile for its tooltip.
    await page.locator('[data-attr="os-dock-window"]').nth(0).hover()
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${OUT}/14-dock-tooltip-${scheme}.png`, clip: { x: 420, y: 700, width: 600, height: 200 } })
    report[scheme] = {
        theme: await page.evaluate(() => document.body.getAttribute('theme')),
        dock: await page.$$eval('[data-attr="os-dock"] button', (bs) =>
            bs.map((b) => [b.getAttribute('aria-label'), b.getAttribute('aria-current')])
        ),
    }
    await context.close()
}
fs.writeFileSync(`${OUT}/three-windows.json`, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report))
await browser.close()
