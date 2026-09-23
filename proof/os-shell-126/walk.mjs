// Walkthrough for #126 on the flag-on stack. Writes screenshots and report.json to OUT.
import fs from 'node:fs'
import { start, BASE, creds, frames } from './common.mjs'

const OUT = process.argv[2] || '/tmp/os126b/proof'
fs.mkdirSync(OUT, { recursive: true })
const report = { steps: [] }
const { browser, context, page } = await start({ video: OUT })
const mainNavs = []
page.on('framenavigated', (f) => f === page.mainFrame() && mainNavs.push(f.url().replace(BASE, '')))
page.on('load', () => mainNavs.push('LOAD ' + page.url().replace(BASE, '')))
const P = `/project/${creds.project_id}`
let n = 0
const shot = async (name) => {
    n += 1
    const file = `${String(n).padStart(2, '0')}-${name}.png`
    await page.screenshot({ path: `${OUT}/${file}` })
    return file
}
const windowsState = () =>
    page.$$eval('[data-attr="os-window"]', (els) =>
        els.map((e) => ({
            id: e.getAttribute('data-os-window-id'),
            title: e.querySelector('h2')?.textContent,
            focused: e.hasAttribute('data-focused'),
            hidden: e.getAttribute('aria-hidden') === 'true',
        }))
    )
const frameFor = async (id) => {
    for (let i = 0; i < 60; i++) {
        const f = frames(page).find((x) => x.name() === `posthog-os-window:${id}`)
        if (f) return f
        await page.waitForTimeout(500)
    }
    throw new Error('no frame ' + id)
}
const step = async (name, extra = {}) => {
    const s = { name, pageUrl: page.url().replace(BASE, ''), browserTabs: context.pages().length, windows: await windowsState(), ...extra }
    s.screenshot = await shot(name)
    report.steps.push(s)
    console.log(JSON.stringify(s))
}
const settle = (ms = 2500) => page.waitForTimeout(ms)

try {
    // 1. The URL opens as a window.
    await page.goto(`${BASE}${P}/dashboard`)
    await page.waitForSelector('[data-attr="os-window"]', { timeout: 90000 })
    let [first] = await windowsState()
    let f1 = await frameFor(first.id)
    await f1.waitForSelector('a[href$="/dashboard/2"]', { timeout: 90000 })
    await settle()
    await step('dashboards-window')

    // 2. A plain click on an in-app link stays in the same window, and the address bar follows.
    await f1.click('a[href$="/dashboard/2"]')
    await f1.waitForSelector('a[href*="/insights/"]', { timeout: 60000 })
    await settle(4000)
    await step('same-window-dashboard')

    // 3. Cmd+click on an in-app link opens a new OS window, not a browser tab.
    const insightLinks = await f1.$$eval('a[href*="/insights/"]', (as) => as.map((a) => a.getAttribute('href')))
    report.insightLinks = insightLinks.slice(0, 4)
    await f1.click(`a[href="${insightLinks[0]}"]`, { modifiers: ['Meta'] })
    await page.waitForFunction(() => document.querySelectorAll('[data-attr="os-window"]').length === 2, null, { timeout: 30000 })
    await settle(8000)
    await step('cmd-click-new-window')

    // 4. A window shortcut pressed inside the focused frame reaches the OS: Option+Shift+G tidies up.
    const w2 = (await windowsState()).find((w) => w.focused)
    const f2 = await frameFor(w2.id)
    await f2.click('body', { position: { x: 300, y: 12 } })
    await page.keyboard.press('Alt+Shift+KeyG')
    await settle()
    await step('shortcut-forwarded-tidy-up')

    // 5. Clicking into the window behind brings it to the front. Its modal opens inside the window.
    await f1.click('button:has-text("Subscribe")')
    await settle(1500)
    await step('click-raises-window-modal-inside')
    await page.keyboard.press('Escape')
    await settle(1000)

    // 6. A plain click on a link to another app still stays in the same window.
    await f1.click(`a[href="${insightLinks[1] ?? insightLinks[0]}"]`)
    await f1.waitForSelector('[data-attr="insight-ai-explain-button"]', { timeout: 60000 })
    await settle(4000)
    await step('same-window-other-app', { frame1Url: f1.url().replace(BASE, '') })

    // 6b. A side panel opener inside a window opens the matching app in an OS window.
    const beforePanel = (await windowsState()).length
    await f1.click('[data-attr="insight-ai-explain-button"]')
    await settle(6000)
    await step('side-panel-opener-routes-to-os', { windowsBefore: beforePanel })

    // 6c. The theme switch in the menu bar reaches the open windows without a reload.
    const themes = async () =>
        Promise.all(frames(page).map((f) => f.evaluate(() => document.body.getAttribute('theme')).catch(() => 'n/a')))
    const themesBefore = await themes()
    await page.click('[data-attr="os-menu-account"]')
    await page.click('text=Color theme')
    await page.click('[role="menuitem"]:has-text("Dark"), [role="menuitemradio"]:has-text("Dark")')
    await settle(5000)
    await step('theme-dark-reaches-windows', { themesBefore, themesAfter: await themes() })
    await page.keyboard.press('Escape')
    await page.click('[data-attr="os-menu-account"]')
    await page.click('text=Color theme')
    await page.click('[role="menuitem"]:has-text("Light"), [role="menuitemradio"]:has-text("Light")')
    await settle(5000)
    report.themesRestored = await themes()
    await page.keyboard.press('Escape')

    // 7. Cmd+click on a desktop icon opens a new window even when one shows that app.
    for (const w of await windowsState()) {
        if (!w.hidden) {
            await page.click(`[data-os-window-id="${w.id}"] [data-attr="os-window-minimize"]`)
        }
    }
    await settle(800)
    const before = (await windowsState()).length
    await page.click('[data-attr="os-desktop-icon-dashboards"], [data-attr^="os-desktop-icon-"]:has-text("Dashboards")', { modifiers: ['Meta'] })
    await settle(4000)
    await page.click('[data-attr="os-desktop-icon-dashboards"], [data-attr^="os-desktop-icon-"]:has-text("Dashboards")', { modifiers: ['Meta'] })
    await settle(6000)
    await step('cmd-click-icon-new-windows', { windowsBefore: before })

    // 8. The spotlight from the menu bar search icon opens an app, then an entity.
    await page.click('[data-attr="os-menu-search"]')
    await page.waitForSelector('[role="dialog"] input', { timeout: 10000 })
    await page.keyboard.type('Revenue', { delay: 40 })
    await settle(4000)
    await step('spotlight-open')
    const options = await page.$$eval('[role="dialog"] [role="option"]', (els) => els.map((e) => e.textContent.trim().slice(0, 60)))
    report.spotlightOptions = options.slice(0, 15)
    const beforeSpot = (await windowsState()).length
    await page.click('[role="dialog"] [role="option"]:has-text("Revenue")')
    await settle(6000)
    await step('spotlight-opened-entity', { windowsBefore: beforeSpot })
    await page.click('[data-attr="os-menu-search"]')
    await page.waitForSelector('[role="dialog"] input', { timeout: 10000 })
    await page.keyboard.type('Session replay', { delay: 40 })
    await settle(4000)
    const replayOptions = await page.$$eval('[role="dialog"] [role="option"]', (els) => els.map((e) => e.textContent.trim().slice(0, 60)))
    report.spotlightAppOptions = replayOptions.slice(0, 15)
    await page.click('[role="dialog"] [role="option"]:has-text("Session replay")')
    await settle(6000)
    await step('spotlight-opened-app')

    // 9. Cmd+K inside a frame opens the OS spotlight.
    const top = (await windowsState()).find((w) => w.focused)
    const ft = await frameFor(top.id)
    await ft.click('body', { position: { x: 300, y: 12 } })
    await page.keyboard.press('Meta+KeyK')
    await settle(1500)
    await step('cmd-k-in-frame', { spotlightOpen: !!(await page.$('[role="dialog"] input')) })
    await page.keyboard.press('Escape')
    await settle(800)
    report.focusAfterEscape = await page.evaluate(() => {
        const el = document.activeElement
        return el?.tagName === 'IFRAME' ? `iframe ${el.getAttribute('name')}` : `${el?.tagName} ${el?.getAttribute('data-attr')}`
    })
    report.focusedWindowAfterEscape = `posthog-os-window:${top.id}`

    // 10. "New SQL query" in the spotlight uses newInternalTab on the OS page, and opens a window.
    const beforeSql = (await windowsState()).length
    await page.click('[data-attr="os-menu-search"]')
    await page.waitForSelector('[role="dialog"] input', { timeout: 10000 })
    await page.keyboard.type('New SQL query', { delay: 40 })
    await settle(3000)
    await page.click('[role="dialog"] :text-is("New SQL query")')
    await settle(6000)
    await step('spotlight-new-sql-query-window', { windowsBefore: beforeSql })
} catch (error) {
    report.error = String(error?.stack || error)
    console.error(error)
    await shot('error')
} finally {
    report.mainFrameLoads = mainNavs.filter((n) => n.startsWith('LOAD'))
    fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2))
    await context.close()
    await browser.close()
}
