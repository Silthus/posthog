const pw = require('/home/coder/posthog/.claude/worktrees/agent-ae16ea98a7f9104e9/node_modules/playwright')
const creds = require('/home/coder/dev/os-shell-stack/rec127/fresh_user.json')
const BASE = process.env.BASE || 'http://localhost:8105'
const OUT = __dirname + '/out'
const T = creds.team_id
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

async function launch(name = process.env.BROWSER || 'chromium') {
    return pw[name].launch()
}

async function newContext(browser, { width = 1440, height = 900, colorScheme = 'light' } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height }, colorScheme })
    const res = await ctx.request.post(BASE + '/api/login/', { data: { email: creds.email, password: creds.password } })
    if (!res.ok()) {
        throw new Error('login failed ' + res.status())
    }
    // The dev server's DEBUG bar covers the bottom of every frame; screenshots should show the product.
    await ctx.addInitScript(() => {
        const hide = () => document.getElementById('bottom-notice')?.style.setProperty('display', 'none', 'important')
        new MutationObserver(hide).observe(document, { childList: true, subtree: true })
    })
    return ctx
}

async function setTheme(ctx, mode) {
    const csrf = (await ctx.cookies()).find((c) => c.name === 'posthog_csrftoken')?.value
    const res = await ctx.request.patch(BASE + '/api/users/@me/', {
        data: { theme_mode: mode },
        headers: csrf ? { 'X-CSRFToken': csrf } : {},
    })
    return res.status()
}

function watchPage(page, tag = '') {
    const events = { navigations: 0, loads: 0, errors: [] }
    page.on('load', () => {
        events.loads++
        log(tag, 'page load', page.url())
    })
    page.on('framenavigated', (f) => {
        if (f === page.mainFrame()) {
            events.navigations++
        }
    })
    page.on('pageerror', (e) => events.errors.push(e.message.slice(0, 200)))
    return events
}

const windows = (page) =>
    page.locator('[data-attr="os-window"]').evaluateAll((els) =>
        els.map((e) => ({
            id: e.getAttribute('data-os-window-id'),
            title: e.getAttribute('aria-label'),
            src: e.querySelector('iframe')?.getAttribute('src'),
            focused: e.hasAttribute('data-focused'),
            hidden: e.getAttribute('aria-hidden') === 'true',
        }))
    )

const dockTiles = (page) =>
    page
        .locator('[data-attr="os-dock"] [data-attr^="os-dock-"]')
        .evaluateAll((els) => els.map((e) => `${e.getAttribute('data-attr')}:${e.getAttribute('aria-label')}`))

async function waitDesktop(page) {
    await page.waitForSelector('[data-attr="os-desktop"]', { timeout: 180000 })
}

async function waitFrameReady(page, idx = 0, timeout = 180000) {
    const frameEl = page.locator('[data-attr="os-window"] iframe').nth(idx)
    await frameEl.waitFor({ timeout })
    const frame = await (await frameEl.elementHandle()).contentFrame()
    await frame.waitForSelector('.main-app-content, [data-attr="os-app-store-tile"], .scene', { timeout }).catch(() => {})
    return frame
}

module.exports = { pw, launch, newContext, setTheme, watchPage, windows, dockTiles, waitDesktop, waitFrameReady, BASE, OUT, T, log, creds }
