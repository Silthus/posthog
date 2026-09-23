// Walks the install flow on the local OS stack and saves screenshots and a video.
import { createRequire } from 'module'
import fs from 'fs'

const require = createRequire('/home/coder/posthog/.claude/worktrees/agent-a8b613bccfe80d434/package.json')
const { chromium } = require('playwright')

const creds = JSON.parse(fs.readFileSync('/home/coder/dev/os-shell-stack/credentials.json', 'utf8'))
const BASE = 'http://localhost:8106'
const OUT = process.env.OUT || '/tmp/os125/shots'
const APP = process.env.APP || 'Surveys'
const SLUG = APP.toLowerCase().replace(/[^a-z0-9]+/g, '-')
fs.mkdirSync(OUT, { recursive: true })
const report = { steps: [] }

const browser = await chromium.launch()
const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: OUT, size: { width: 1440, height: 900 } },
})
const page = await context.newPage()
page.setDefaultTimeout(60000)

const login = await context.request.post(`${BASE}/api/login/`, { data: { email: creds.email, password: creds.password } })
if (!login.ok()) throw new Error(`login ${login.status()}`)

async function dockState() {
    return page.evaluate(() => ({
        store: (() => {
            const b = document.querySelector('[data-attr="os-dock-app-store"]')
            return b && { label: b.getAttribute('aria-label'), current: b.getAttribute('aria-current') }
        })(),
        windows: [...document.querySelectorAll('[data-attr="os-dock-window"]')].map((b) => ({
            label: b.getAttribute('aria-label'),
            current: b.getAttribute('aria-current'),
        })),
        desktopIcons: [...document.querySelectorAll('[data-attr^="os-desktop-icon-"]')].map((a) =>
            a.getAttribute('data-attr')
        ),
        openWindows: [...document.querySelectorAll('[data-attr="os-window"]')].map((w) => ({
            hidden: w.getAttribute('aria-hidden') === 'true',
            src: w.querySelector('iframe')?.getAttribute('src'),
        })),
    }))
}

async function shot(name) {
    await page.waitForTimeout(600)
    // The dev-only DEBUG bar covers the bottom of the page and of every window, so the capture drops it.
    for (const frame of page.frames()) {
        await frame.evaluate(() => document.getElementById('bottom-notice')?.remove()).catch(() => {})
    }
    await page.screenshot({ path: `${OUT}/${name}.png` })
    report.steps.push({ name, ...(await dockState()) })
    console.log(name, JSON.stringify(report.steps.at(-1)))
}

function storeFrame() {
    return page.frames().find((f) => f !== page.mainFrame() && f.url().includes('/app-store'))
}

async function waitForStoreFrame() {
    for (let i = 0; i < 120; i++) {
        const f = storeFrame()
        if (f) {
            try {
                await f.waitForSelector('[data-attr="os-app-store-search"], [data-attr="os-app-store-listing"]', {
                    timeout: 1000,
                })
                return f
            } catch {}
        }
        await page.waitForTimeout(500)
    }
    throw new Error('no store frame')
}

// The dev-only DEBUG bar covers the bottom of the page, so the capture hides it.
page.on('load', () => {
    page.addStyleTag({ content: '#bottom-notice { display: none !important; }' }).catch(() => {})
})
await page.goto(`${BASE}/project/${creds.project_id}/os`)
await page.waitForSelector('[data-attr="os-dock"]')
await page.waitForTimeout(2000)
await shot('01-desktop-empty-dock')

// Open the store from the dock and browse by category.
await page.click('[data-attr="os-dock-app-store"]')
let store = await waitForStoreFrame()
await page.waitForTimeout(1500)
await shot('02-store-front')
const sectionTitles = await store.$$eval('section h2', (hs) => hs.map((h) => h.textContent))
report.sections = sectionTitles
await store.locator('section h2', { hasText: 'Watch and ask users' }).scrollIntoViewIfNeeded()
await shot('03-store-category')

// Open a listing and install.
await store.click(`[data-attr="os-app-store-tile-${SLUG}"]`)
await store.waitForSelector('[data-attr="os-app-store-listing"]')
await shot('04-listing')
await store.click('[data-attr="os-app-store-install"]')
await store.waitForSelector('[data-attr="os-app-store-remove"]:not([aria-disabled="true"])')
await page.waitForSelector(`[data-attr="os-desktop-icon-tool-${APP}"]`, { timeout: 15000 })
await shot('05-installed')

// The store is focused, so its dock tile minimizes it and the desktop shows the new icon.
await page.click('[data-attr="os-dock-app-store"]')
await shot('06-icon-on-desktop')

// Open the new app from the desktop, and it shows in the dock.
await page.click(`[data-attr="os-desktop-icon-tool-${APP}"]`)
await page.waitForTimeout(4000)
await shot('07-app-open-in-dock')

// Minimize it from the dock, then restore it.
await page.locator('[data-attr="os-dock-window"]').last().click()
await shot('08-minimized-from-dock')
await page.locator('[data-attr="os-dock-window"]').last().click()
await shot('09-restored-from-dock')

// Back to the store from the dock (it is minimized, so this restores it) and remove the app.
await page.click('[data-attr="os-dock-app-store"]')
store = await waitForStoreFrame()
await shot('10-store-restored')
await store.click('[data-attr="os-app-store-remove"]')
await store.waitForSelector('[data-attr="os-app-store-install"]')
await page.waitForSelector(`[data-attr="os-desktop-icon-tool-${APP}"]`, { state: 'detached', timeout: 15000 })
await shot('11-removed')

// The sidebar reads the same list.
const list = await context.request.get(`${BASE}/api/environments/${creds.team_id}/user_product_list/`)
report.userProductListAfterRemove = (await list.json()).results.map((r) => r.product_path)

fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2))
await context.close()
await browser.close()
