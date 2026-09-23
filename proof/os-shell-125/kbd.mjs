// Keyboard reachability of the dock with one window open.
import { createRequire } from 'module'
import fs from 'fs'
const require = createRequire('/home/coder/posthog/.claude/worktrees/agent-a8b613bccfe80d434/package.json')
const { chromium } = require('playwright')
const creds = JSON.parse(fs.readFileSync('/home/coder/dev/os-shell-stack/credentials.json', 'utf8'))
const BASE = 'http://localhost:8106'
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
page.setDefaultTimeout(60000)
await context.request.post(`${BASE}/api/login/`, { data: { email: creds.email, password: creds.password } })
await page.goto(`${BASE}/project/${creds.project_id}/os`)
await page.waitForSelector('[data-attr="os-dock"]')
await page.waitForTimeout(1500)
await page.click('[data-attr="os-desktop-icon-tool-Product analytics"]')
await page.waitForTimeout(8000)
// Start from the last menu bar control.
const menuButtons = page.locator('.OsShell__menu-bar button, .OsShell__menu-bar a')
await menuButtons.last().focus()
let steps = 0
let where = ''
for (; steps < 400; steps++) {
    await page.keyboard.press('Tab')
    where = await page.evaluate(() => {
        const a = document.activeElement
        return a?.tagName === 'IFRAME' ? 'IFRAME' : a?.getAttribute('data-attr') || a?.tagName
    })
    if (where?.startsWith('os-dock')) break
}
// Shift+Tab from the dock App Store tile.
await page.focus('[data-attr="os-dock-app-store"]')
const before = await page.evaluate(() => {
    const b = document.querySelector('[data-attr="os-dock-app-store"]')
    return { outline: getComputedStyle(b).outlineStyle, tooltip: document.body.innerText.includes('App Store') }
})
await page.keyboard.press('Shift+Tab')
const back = await page.evaluate(() => document.activeElement?.tagName + ' ' + (document.activeElement?.getAttribute('data-attr') || ''))
// Does a keyboard focus on a dock tile show the tooltip?
await page.keyboard.press('Tab')
await page.waitForTimeout(1000)
const tipVisible = await page.evaluate(() => [...document.querySelectorAll('[role="tooltip"], [data-floating-ui-portal] *')].map((e) => e.textContent).filter(Boolean).slice(0, 3))
console.log(JSON.stringify({ tabsFromMenuToDock: steps + 1, reached: where, shiftTabFromDock: back, before, tipVisible }))
await browser.close()
