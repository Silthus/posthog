// Records the preview and install flow as a fresh user, and checks each step.
const fs = require('fs')
const { chromium } = require('/home/coder/posthog/.claude/worktrees/agent-a1ec5127a42e7be25/node_modules/playwright')
const creds = require('/home/coder/dev/os-shell-stack/rec137/fresh_user.json')
const BASE = 'http://localhost:8107'
const OUT = __dirname + '/proof'
const APP = process.argv[2] || 'Surveys'
const SLUG = APP.toLowerCase().replace(/[^a-z0-9]+/g, '-')
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const report = { app: APP, steps: {} }
const HIDE_CSS = `.DebugNotice, [class*="DebugNotice"], .debug-notice { display: none !important; }`

;(async () => {
    fs.mkdirSync(OUT, { recursive: true })
    const browser = await chromium.launch()
    const ctx = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        recordVideo: { dir: OUT + '/video', size: { width: 1440, height: 900 } },
    })
    const res = await ctx.request.post(BASE + '/api/login/', { data: { email: creds.email, password: creds.password } })
    log('login', res.status())
    const list = async () =>
        (await (await ctx.request.get(BASE + `/api/environments/${creds.team_id}/user_product_list/`)).json()).results.map(
            (r) => r.product_path
        )
    const icon = () => page.locator(`[data-attr="os-desktop-icon-tool-${APP}"]`)
    const bar = () => page.locator('[data-attr="os-app-preview-bar"]')
    const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` })
    report.steps.initialList = await list()

    const page = await ctx.newPage()
    await page.addInitScript((css) => {
        document.addEventListener('DOMContentLoaded', () => {
            const style = document.createElement('style')
            style.textContent = css
            document.head.appendChild(style)
        })
    }, HIDE_CSS)
    page.on('pageerror', (e) => log('pageerror', e.message.slice(0, 200)))

    await page.goto(BASE + `/project/${creds.team_id}/os`)
    await page.locator('[data-attr="os-desktop-icon-app-store"]').waitFor({ timeout: 120000 })
    await page.waitForTimeout(1500)
    report.steps.iconBefore = await icon().count()
    await shot('01-desktop')

    await page.locator('[data-attr="os-desktop-icon-app-store"]').click()
    const store = page.frameLocator('[data-attr="os-window"] iframe').first()
    await store.locator('[data-attr="os-app-store-tile"]').first().waitFor({ timeout: 120000 })
    await page.waitForTimeout(1500)
    await shot('02-store')

    await store.locator(`[data-attr="os-app-store-tile-${SLUG}"]`).click()
    const listing = store.locator('[data-attr="os-app-store-listing"]')
    await listing.waitFor()
    await page.waitForTimeout(1500)
    await shot('03-listing')

    await listing.locator('[data-attr="os-app-store-preview"]').click()
    await bar().waitFor({ timeout: 30000 })
    // Give the previewed app time to load and send its product intent.
    await page.waitForTimeout(12000)
    report.steps.preview = {
        windows: await page.locator('[data-attr="os-window"]').count(),
        barText: await bar().innerText(),
        iconOnDesktop: await icon().count(),
        list: await list(),
    }
    await shot('04-preview-window')

    await bar().locator('[data-attr="os-app-preview-install"]').click()
    await icon().waitFor({ timeout: 15000 })
    await page.waitForTimeout(2500)
    report.steps.afterInstall = {
        barCount: await bar().count(),
        iconOnDesktop: await icon().count(),
        list: await list(),
    }
    await shot('05-installed-from-bar')

    await page.reload()
    await icon().waitFor({ timeout: 120000 })
    await page.waitForTimeout(6000)
    report.steps.afterReload = {
        barCount: await bar().count(),
        iconOnDesktop: await icon().count(),
        windows: await page.locator('[data-attr="os-window"]').count(),
        list: await list(),
    }
    await shot('06-after-reload')

    // The store window restores on its listing. Bring it to the front and remove the app.
    const storeWindow = page.locator('[data-attr="os-window"]', { hasText: 'App Store' }).first()
    await storeWindow.locator('header').click({ position: { x: 40, y: 12 } })
    const storeFrame = storeWindow.frameLocator('iframe')
    const remove = storeFrame.locator('[data-attr="os-app-store-listing"] [data-attr="os-app-store-remove"]')
    await remove.waitFor({ timeout: 120000 })
    await page.waitForTimeout(1500)
    await remove.click()
    await icon().waitFor({ state: 'detached', timeout: 15000 })
    await page.waitForTimeout(2500)
    report.steps.afterRemove = {
        iconOnDesktop: await icon().count(),
        barCount: await bar().count(),
        list: await list(),
    }
    await shot('07-removed')

    await ctx.close()
    await browser.close()
    fs.writeFileSync(OUT + '/report.json', JSON.stringify(report, null, 2))
    log(JSON.stringify(report, null, 2))
})().catch((e) => {
    console.error(e)
    fs.writeFileSync(OUT + '/report.json', JSON.stringify({ ...report, error: String(e) }, null, 2))
    process.exit(1)
})
