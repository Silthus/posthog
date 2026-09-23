// Picks a page from the app menu while the window's app is still loading, then checks where the window ends up.
const { chromium } = require('/home/coder/posthog/.claude/worktrees/agent-a1975d109b8af80be/node_modules/playwright')
const creds = require('/home/coder/dev/os-shell-stack/credentials.json')
const BASE = 'http://localhost:8105'
;(async () => {
    const browser = await chromium.launch()
    const results = []
    for (const [start, pick, expected] of [
        ['feature_flags', 'history', '/feature_flags?tab=history'],
        ['insights', 'alerts', '/alerts'],
        ['replay/home', 'collections', '/replay/playlists'],
    ]) {
        // A fresh context per case, so no saved layout opens other windows.
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
        await ctx.request.post(BASE + '/api/login/', { data: { email: creds.email, password: creds.password } })
        const page = await ctx.newPage()
        await page.goto(`${BASE}/project/${creds.team_id}/${start}`)
        const trigger = page.locator('[data-attr="os-app-menu"]')
        await trigger.waitFor({ timeout: 120000 })
        await trigger.click()
        await page.locator(`[data-attr="os-app-menu-page-${pick}"]`).click()
        const clickedAt = Date.now()
        let frameUrl = null
        for (let i = 0; i < 60; i++) {
            await page.waitForTimeout(1000)
            frameUrl = await page.evaluate(
                () => document.querySelector('[data-attr="os-window"] iframe')?.contentWindow?.location.href
            )
            if (frameUrl && frameUrl.endsWith(expected)) {
                break
            }
        }
        const windows = await page.locator('[data-attr="os-window"]').count()
        const historyLength = await page.evaluate(() => history.length)
        results.push({
            start,
            pick,
            frameUrl,
            ok: !!frameUrl?.endsWith(expected),
            seconds: (Date.now() - clickedAt) / 1000,
            windows,
            historyLength,
            trigger: (await trigger.textContent()).trim(),
        })
        await ctx.close()
    }
    console.log(JSON.stringify(results, null, 1))
    await browser.close()
})()
