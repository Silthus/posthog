// Many windows: dock overflow, layout, contrast, DOM order.
import { createRequire } from 'module'
import fs from 'fs'
const require = createRequire('/home/coder/posthog/.claude/worktrees/agent-a8b613bccfe80d434/package.json')
const { chromium } = require('playwright')
const creds = JSON.parse(fs.readFileSync('/home/coder/dev/os-shell-stack/credentials.json', 'utf8'))
const BASE = 'http://localhost:8106'
const OUT = '/tmp/os125/shots'
const WIDTH = Number(process.env.WIDTH || 1280)
const SCHEME = process.env.SCHEME || 'light'
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: WIDTH, height: 800 }, colorScheme: SCHEME })
const page = await context.newPage()
page.setDefaultTimeout(60000)
await context.request.post(`${BASE}/api/login/`, { data: { email: creds.email, password: creds.password } })
page.on('load', () => page.addStyleTag({ content: '#bottom-notice { display: none !important; }' }).catch(() => {}))
page.on("framenavigated", (f) => { if (f === page.mainFrame()) console.log("MAIN NAV", f.url()) })
await page.goto(`${BASE}/project/${creds.project_id}/os`)
await page.waitForSelector('[data-attr="os-dock"]')
await page.waitForTimeout(1500)
const colors = await page.evaluate(() => {
    const el = document.querySelector('.OsDock__icon--store')
    const cs = getComputedStyle(el)
    return { theme: document.body.getAttribute('theme'), bg: cs.backgroundColor, color: cs.color }
})
await page.click('[data-attr="os-dock-app-store"]')
let store
for (let i = 0; i < 120 && !store; i++) {
    const f = page.frames().find((f) => f !== page.mainFrame() && f.url().includes('/app-store'))
    if (f) {
        try {
            await f.waitForSelector('[data-attr="os-app-store-tile"]', { timeout: 1000 })
            store = f
        } catch {}
    }
    if (!store) await page.waitForTimeout(500)
}
const N = Number(process.env.N || 30)
const names = (await store.$$eval('[data-attr="os-app-store-tile"] a', (as) => as.map((a) => a.textContent))).slice(0, N)
for (const key of names) {
    await store.evaluate((key) => window.parent.postMessage({ type: 'posthog-os-store:open-app', key }, location.origin), key)
    console.log("open", key); await page.waitForTimeout(400)
}
await page.waitForTimeout(3000)
const metrics = await page.evaluate(() => {
    const shelf = document.querySelector('.OsDock__shelf')
    const nav = document.querySelector('[data-attr="os-dock"]')
    const layer = document.querySelector('[data-attr="os-window-layer"]')
    const r = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)] }
    return {
        shelf: r(shelf), nav: r(nav), layer: r(layer),
        scrollW: shelf.scrollWidth, clientW: shelf.clientWidth, clientH: shelf.clientHeight, offsetH: shelf.offsetHeight,
        items: document.querySelectorAll('[data-attr="os-dock-window"]').length,
        windows: document.querySelectorAll('[data-attr="os-window"]').length,
        dockAfterLayer: !!(layer.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING),
        labels: [...document.querySelectorAll('[data-attr="os-dock-window"]')].slice(0, 5).map((b) => b.getAttribute('aria-label')),
        iconColumnH: getComputedStyle(document.querySelector('[data-attr="os-desktop"] nav ul')).height,
    }
})
console.log("METRICS", JSON.stringify({ colors, metrics }))
await page.screenshot({ path: `${OUT}/many-${WIDTH}-${SCHEME}.png` })
await page.locator('[data-attr="os-dock"]').screenshot({ path: `${OUT}/many-dock-${WIDTH}-${SCHEME}.png` })
// Keyboard: focus the dock App Store tile and screenshot the focus ring.
await page.focus('[data-attr="os-dock-app-store"]')
await page.keyboard.press('Shift+Tab')
await page.keyboard.press('Tab')
await page.waitForTimeout(800)
const focusInfo = await page.evaluate(() => ({ active: document.activeElement?.getAttribute('data-attr'), outline: getComputedStyle(document.activeElement).outlineStyle }))
await page.locator('[data-attr="os-dock"]').screenshot({ path: `${OUT}/focus-dock-${WIDTH}-${SCHEME}.png` })
const tooltipShown = await page.evaluate(() => !!document.querySelector('[role="tooltip"], .Tooltip'))
console.log(JSON.stringify({ colors, metrics, focusInfo, tooltipShown, names: names.length }, null, 1))
await browser.close()
