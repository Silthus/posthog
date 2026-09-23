// With the os-shell flag off, the regular app renders and nothing from the OS shell shows.
const fs = require('fs')
const c = require('./common')
const DIR = `${c.OUT}/flag-off`
fs.mkdirSync(DIR, { recursive: true })
const results = []

async function check(page, name, fn) {
    let ok = false
    let detail = ''
    try {
        detail = (await fn()) ?? ''
        ok = true
    } catch (e) {
        detail = String(e.message || e).split('\n')[0].slice(0, 300)
    }
    const shot = `${results.length + 1}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`
    await page.screenshot({ path: `${DIR}/${shot}` }).catch(() => {})
    results.push({ name, ok, detail, shot: `flag-off/${shot}` })
    c.log('flag-off', ok ? 'PASS' : 'FAIL', name, detail)
}

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg)
    }
}

;(async () => {
    const browser = await c.launch()
    const ctx = await c.newContext(browser)
    const page = await ctx.newPage()
    const T = c.T
    const list = async () =>
        (await (await ctx.request.get(`${c.BASE}/api/environments/${T}/user_product_list/`)).json()).results.map((r) => r.product_path)

    await check(page, 'regular layout on a deep link', async () => {
        await page.goto(`${c.BASE}/project/${T}/insights`)
        await page.locator('.Navigation3000, nav').first().waitFor({ timeout: 120000 })
        await page.waitForTimeout(4000)
        const os = await page.locator('[data-attr="os-shell"], [data-attr="os-desktop"], [data-attr="os-dock"]').count()
        const frames = await page.locator('iframe[name^="posthog-os-window:"]').count()
        assert(os === 0 && frames === 0, `os elements ${os}, os frames ${frames}`)
        return 'sidebar layout, no OS elements, no OS frames'
    })

    await check(page, '/app-store and /os show not found', async () => {
        const out = []
        for (const path of ['app-store', 'os']) {
            await page.goto(`${c.BASE}/project/${T}/${path}`)
            await page.getByText(/not found/i).first().waitFor({ timeout: 60000 })
            out.push(path)
        }
        return `not found on ${out.join(', ')}`
    })

    await check(page, 'Cmd+K opens the regular command menu', async () => {
        await page.goto(`${c.BASE}/project/${T}/insights`)
        await page.waitForTimeout(5000)
        await page.keyboard.press('Control+k')
        await page.getByRole('dialog').first().waitFor({ timeout: 10000 })
        const osSpotlight = await page.getByText('to open in a new window').count()
        assert(osSpotlight === 0, 'OS spotlight footer shown')
        await page.keyboard.press('Escape')
        return 'command menu dialog, without the OS footer'
    })

    await check(page, 'Ctrl+click on an app link opens a browser tab', async () => {
        await page.goto(`${c.BASE}/project/${T}/feature_flags`)
        const link = page.locator('main a[href*="/feature_flags/"], .main-app-content a[href*="/feature_flags/"]').first()
        await link.waitFor({ timeout: 60000 })
        const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 10000 }), link.click({ modifiers: ['Control'] })])
        const url = popup.url()
        await popup.close()
        return `new tab ${url}`
    })

    await check(page, 'visiting Surveys still sends its product intent', async () => {
        const sent = []
        page.on('request', (r) => {
            if (r.url().includes('add_product_intent')) {
                sent.push(`${r.method()} ${new URL(r.url()).pathname} ${r.postData()?.slice(0, 80)}`)
            }
        })
        await page.goto(`${c.BASE}/project/${T}/surveys`)
        await page.waitForTimeout(8000)
        assert(sent.some((s) => s.includes('surveys_viewed')), 'no intent request: ' + JSON.stringify(sent))
        return sent.join('; ')
    })

    fs.writeFileSync(`${DIR}/report.json`, JSON.stringify(results, null, 2))
    await browser.close()
})().catch((e) => {
    console.error(e)
    process.exit(1)
})
