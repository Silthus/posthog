const { chromium } = require('/home/coder/posthog/.claude/worktrees/agent-a1975d109b8af80be/node_modules/playwright')
const creds = require('/home/coder/dev/os-shell-stack/credentials.json')
const BASE = 'http://localhost:8105'
const OUT = process.env.OUT || '/tmp/os135/shots'
const T = creds.team_id
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const report = []

async function setTheme(ctx, mode) {
    const csrf = (await ctx.cookies(BASE)).find((c) => c.name === 'posthog_csrftoken')?.value
    const r = await ctx.request.patch(BASE + '/api/users/@me/', {
        data: { theme_mode: mode },
        headers: { 'X-CSRFToken': csrf || '', Referer: BASE },
    })
    log('theme', mode, r.status())
}

async function frameReady(page) {
    const frame = page.frameLocator('[data-attr="os-window"] iframe').first()
    await frame.locator('.SceneTitleSection, [data-attr="scene-title"], h1, main').first().waitFor({ timeout: 120000 })
    await page.waitForTimeout(2500)
    return frame
}

async function run(width, mode) {
    const browser = await chromium.launch()
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: mode })
    const login = await ctx.request.post(BASE + '/api/login/', { data: { email: creds.email, password: creds.password } })
    log('login', login.status())
    await setTheme(ctx, mode)
    const page = await ctx.newPage()
    const tag = `${width}-${mode}`

    // 1. The desktop with no window focused: PostHog menu only, the highlighted App Store icon.
    await page.goto(`${BASE}/project/${T}/os`)
    await page.locator('[data-attr="os-menu-bar"]').waitFor({ timeout: 120000 })
    await page.locator('[data-attr="os-desktop-icon-app-store"]').waitFor({ timeout: 60000 })
    await page.waitForTimeout(3000)
    report.push({ tag, step: 'desktop', appMenu: await page.locator('[data-attr="os-app-menu"]').count(), apps: await page.locator('[data-attr="os-menu-apps"]').count(), help: await page.locator('[data-attr="os-menu-help"]').count() })
    await page.screenshot({ path: `${OUT}/${tag}-1-desktop-no-window.png` })
    await page.locator('[data-attr="os-menu-logo"]').click()
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${OUT}/${tag}-2-posthog-menu.png` })
    await page.keyboard.press('Escape')

    // 2. Product analytics focused, with its app menu open.
    await page.goto(`${BASE}/project/${T}/insights`)
    const frame = await frameReady(page)
    const trigger = page.locator('[data-attr="os-app-menu"]')
    await trigger.waitFor({ timeout: 30000 })
    await trigger.click()
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${OUT}/${tag}-3-product-analytics-menu.png` })
    report.push({ tag, step: 'app-menu', label: (await trigger.textContent()).trim(), items: await page.locator('[data-attr^="os-app-menu-"]:not([data-attr="os-app-menu"])').allTextContents() })

    // Picking a page navigates the focused window, without a second window.
    const windowsBefore = await page.locator('[data-attr="os-window"]').count()
    await page.locator('[data-attr="os-app-menu-page-history"]').click()
    await page.waitForTimeout(4000)
    const frameUrl = await page.evaluate(() => document.querySelector('[data-attr="os-window"] iframe')?.contentWindow?.location.href)
    await trigger.click()
    await page.waitForTimeout(600)
    const active = await page.locator('[data-attr^="os-app-menu-page-"].LemonButton--active').allTextContents()
    report.push({ tag, step: 'navigate', windowsBefore, windowsAfter: await page.locator('[data-attr="os-window"]').count(), frameUrl, pageUrl: page.url(), active })
    await page.screenshot({ path: `${OUT}/${tag}-4-after-history.png` })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    // 3. The centered search opens the Cmd+K spotlight.
    await page.locator('[data-attr="os-menu-search"]').click()
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${OUT}/${tag}-5-search-spotlight.png` })
    report.push({ tag, step: 'search', dialog: await page.locator('[role="dialog"]').count() })

    // 4. A long app name in the menu bar.
    await page.keyboard.press('Escape')
    await page.goto(`${BASE}/project/${T}/early_access_features`)
    await page.locator('[data-attr="os-app-menu"]').waitFor({ timeout: 120000 })
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${OUT}/${tag}-6-long-app-name.png`, clip: { x: 0, y: 0, width, height: 60 } })
    report.push({ tag, step: 'long-name', label: (await page.locator('[data-attr="os-app-menu"]').textContent()).trim() })

    await browser.close()
}

;(async () => {
    const widths = (process.env.WIDTHS || '1440,1280,1024').split(',').map(Number)
    const modes = (process.env.MODES || 'light,dark').split(',')
    try {
        for (const width of widths) {
            for (const mode of modes) {
                await run(width, mode)
            }
        }
    } finally {
        const browser = await chromium.launch()
        const ctx = await browser.newContext()
        await ctx.request.post(BASE + '/api/login/', { data: { email: creds.email, password: creds.password } })
        await setTheme(ctx, process.env.RESTORE_THEME || 'light')
        await browser.close()
        console.log(JSON.stringify(report, null, 1))
    }
})()
