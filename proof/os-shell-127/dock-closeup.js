// Close-up of dock tiles in warm and cyan product colors, plus the measured glyph contrast.
const c = require('./common')
const THEME = process.env.THEME || 'light'

;(async () => {
    const browser = await c.launch()
    const ctx = await c.newContext(browser, { width: 1440, height: 900 })
    await c.setTheme(ctx, THEME)
    const page = await ctx.newPage()
    await page.goto(`${c.BASE}/project/${c.T}/os`)
    await c.waitDesktop(page)
    await page.evaluate(() => {
        for (const k of Object.keys(localStorage)) {
            if (k.startsWith('posthog-os')) {
                localStorage.removeItem(k)
            }
        }
        sessionStorage.clear()
    })
    await page.reload()
    await c.waitDesktop(page)
    for (const path of ['dashboard', 'replay/home', 'feature_flags', 'error_tracking', 'web', 'heatmaps', 'surveys']) {
        await page.evaluate((p) => {
            // Open through the OS the way a link in a window would, so no app is installed.
            window.history.pushState({}, '', p)
            window.dispatchEvent(new PopStateEvent('popstate'))
        }, `/project/${c.T}/${path}`)
        await page.waitForTimeout(700)
    }
    await page.waitForTimeout(2000)
    const dock = page.locator('[data-attr="os-dock"]')
    await dock.screenshot({ path: `${c.OUT}/dock-closeup-${THEME}.png` })
    const colors = await page.locator('[data-attr="os-dock"] .OsAppIcon').evaluateAll((els) =>
        els.map((e) => ({ label: e.closest('[aria-label]')?.getAttribute('aria-label'), bg: getComputedStyle(e).backgroundColor, img: getComputedStyle(e).backgroundImage.slice(0, 40) }))
    )
    c.log(THEME, JSON.stringify(colors))
    await c.setTheme(ctx, 'light')
    await browser.close()
})().catch((e) => {
    console.error(e)
    process.exit(1)
})
