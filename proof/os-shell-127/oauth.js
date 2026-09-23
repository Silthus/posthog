// A page that refuses framing, reached from inside a window, must load in the whole tab.
// Usage: BROWSER=chromium|firefox|webkit node oauth.js
const fs = require('fs')
const c = require('./common')
const BROWSER = process.env.BROWSER || 'chromium'
const DIR = `${c.OUT}/oauth-${BROWSER}`
fs.mkdirSync(DIR, { recursive: true })

;(async () => {
    const browser = await c.launch(BROWSER)
    const ctx = await c.newContext(browser)
    // A stand-in for an OAuth provider: refuses framing like the real ones do.
    await ctx.route('https://oauth.example.com/**', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'text/html',
            headers: { 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'" },
            body: '<html><body><h1>Example sign-in</h1></body></html>',
        })
    )
    const page = await ctx.newPage()
    const results = []
    const hasNavigationApi = await page.evaluate(() => 'navigation' in window).catch(() => null)

    const scenarios = [
        ['link to a sign-in page', (f) => f.evaluate(() => {
            const a = document.createElement('a')
            a.href = '/login?next=/'
            a.textContent = 'sign in'
            a.id = 'os127-link'
            document.body.prepend(a)
        }).then(() => f.locator('#os127-link').click())],
        ['redirect in code to an OAuth provider', (f) => f.evaluate(() => {
            window.location.assign('https://oauth.example.com/authorize?client_id=x')
        })],
        ['redirect in code to a server sign-in path', (f) => f.evaluate(() => {
            window.location.assign('/login?next=/')
        })],
    ]

    for (const [name, act] of scenarios) {
        await page.goto(`${c.BASE}/project/${c.T}/insights`)
        await c.waitDesktop(page)
        const el = page.locator('[data-attr="os-window"] iframe').first()
        await el.waitFor({ timeout: 120000 })
        const frame = await (await el.elementHandle()).contentFrame()
        await frame.waitForSelector('.scene, main, [data-attr]', { timeout: 120000 }).catch(() => {})
        await page.waitForTimeout(2000)
        const topBefore = page.url()
        await act(frame).catch((e) => c.log('act error', e.message.slice(0, 120)))
        await page.waitForTimeout(5000)
        const topAfter = page.url()
        const frameUrl = await (async () => {
            try {
                const f2 = await (await page.locator('[data-attr="os-window"] iframe').first().elementHandle()).contentFrame()
                return f2.url()
            } catch {
                return '(no window)'
            }
        })()
        const leftToTop = topAfter !== topBefore && !topAfter.includes('/project/' + c.T + '/insights')
        const osGone = (await page.locator('[data-attr="os-desktop"]').count()) === 0
        const ok = leftToTop || (osGone && !topAfter.startsWith(c.BASE + '/project'))
        const shot = `${name.replace(/[^a-z0-9]+/gi, '-')}.png`
        await page.screenshot({ path: `${DIR}/${shot}` })
        results.push({ name, ok, topBefore, topAfter, frameUrl, shot: `oauth-${BROWSER}/${shot}` })
        c.log(BROWSER, ok ? 'PASS' : 'FAIL', name, 'top:', topAfter, 'frame:', frameUrl)
    }
    fs.writeFileSync(`${DIR}/report.json`, JSON.stringify({ browser: BROWSER, hasNavigationApi, results }, null, 2))
    c.log(BROWSER, 'navigation API', hasNavigationApi)
    await browser.close()
})().catch((e) => {
    console.error(e)
    process.exit(1)
})
