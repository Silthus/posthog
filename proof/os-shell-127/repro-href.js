// Reproduce: a desktop icon opens an unscoped href, which reloads the page or opens a second window.
const c = require('./common')

;(async () => {
    const browser = await c.launch()
    const ctx = await c.newContext(browser)
    const page = await ctx.newPage()
    const ev = c.watchPage(page, 'host')
    await page.goto(`${c.BASE}/project/${c.T}`)
    await c.waitDesktop(page)
    await page.evaluate(() => localStorage.clear())
    await page.goto(`${c.BASE}/project/${c.T}`)
    await c.waitDesktop(page)
    await page.waitForTimeout(3000)
    const icons = await page
        .locator('[data-attr^="os-desktop-icon-"]')
        .evaluateAll((els) => els.map((e) => `${e.getAttribute('data-attr')} ${e.getAttribute('href')}`))
    c.log('icons', JSON.stringify(icons))
    const navBefore = ev.loads
    const target = process.argv[2] || 'os-desktop-icon-tool-Product analytics'
    await page.locator(`[data-attr="${target}"]`).first().click()
    for (let i = 0; i < 8; i++) {
        await page.waitForTimeout(3000)
        c.log('t+' + (i + 1) * 3, 'url', page.url(), 'windows', JSON.stringify(await c.windows(page)))
    }
    c.log('clicking the same icon again')
    await page.locator(`[data-attr="${target}"]`).first().click({ force: true })
    await page.waitForTimeout(5000)
    c.log('after second click', JSON.stringify(await c.windows(page)))
    c.log('storage', await page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith('posthog-os')).map(([k, v]) => k + '=' + v.slice(0, 400)).join(' | ')))
    c.log('full page loads after click', ev.loads - navBefore)
    c.log('errors', JSON.stringify(ev.errors))
    await page.screenshot({ path: c.OUT + '/repro-href.png' })
    await browser.close()
})().catch((e) => {
    console.error(e)
    process.exit(1)
})
