// A maximized and a snapped window stop above the dock.
import { createRequire } from 'module'
import fs from 'fs'

const require = createRequire('/home/coder/posthog/.claude/worktrees/agent-a8b613bccfe80d434/package.json')
const { chromium } = require('playwright')
const creds = JSON.parse(fs.readFileSync('/home/coder/dev/os-shell-stack/credentials.json', 'utf8'))
const BASE = 'http://localhost:8106'
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await context.newPage()
page.setDefaultTimeout(60000)
await context.request.post(`${BASE}/api/login/`, { data: { email: creds.email, password: creds.password } })
await page.goto(`${BASE}/project/${creds.project_id}/os`)
await page.waitForSelector('[data-attr="os-dock"]')
await page.click('[data-attr="os-dock-app-store"]')
await page.waitForTimeout(3000)
const rects = async () =>
    page.evaluate(() => ({
        window: document.querySelector('[data-attr="os-window"]').getBoundingClientRect().bottom,
        dockTop: document.querySelector('[data-attr="os-dock"]').getBoundingClientRect().top,
    }))
await page.click('[data-attr="os-window-maximize"]')
await page.waitForTimeout(800)
for (const frame of page.frames()) {
    await frame.evaluate(() => document.getElementById('bottom-notice')?.remove()).catch(() => {})
}
const maximized = await rects()
await page.screenshot({ path: '/tmp/os125/shots/15-maximized-above-dock.png' })
await page.click('[data-attr="os-window-maximize"]')
await page.waitForTimeout(500)
await page.locator('body').focus()
await page.keyboard.press('Alt+Shift+ArrowLeft')
await page.waitForTimeout(800)
const snapped = await rects()
const out = { viewport: '1280x800', maximized, snapped, maximizedClearsDock: maximized.window <= maximized.dockTop, snappedClearsDock: snapped.window <= snapped.dockTop }
fs.writeFileSync('/tmp/os125/shots/maximize-snap.json', JSON.stringify(out, null, 2))
console.log(JSON.stringify(out))
await browser.close()
