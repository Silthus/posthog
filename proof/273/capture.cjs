const { createRequire } = require('node:module')
const { chromium } = createRequire(`${process.cwd()}/package.json`)('playwright')
const assert = require('node:assert/strict')
;(async () => {
    const mode = process.argv[2]
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 2 })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('http://localhost:6373/iframe.html?id=products-workflows-first-run-gallery--temp-arriving-from-nav-card&viewMode=story', { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.locator('[data-attr="workflows-first-run-gallery"]').waitFor({ state: 'visible', timeout: 120000 })
    if (mode === 'before') {
        await page.locator('[data-attr="product-push-welcome"]').waitFor({ state: 'visible', timeout: 30000 })
    } else {
        await page.locator('[data-attr="product-push-welcome"]').waitFor({ state: 'hidden', timeout: 30000 })
    }
    await page.getByText('Start playing', { exact: true }).waitFor({ state: 'visible', timeout: 30000 })
    await page.screenshot({ path: `/tmp/fr-273-proof/gallery-${mode}.png` })
    console.log(JSON.stringify({ mode, gallery: await page.locator('[data-attr="workflows-first-run-gallery"]').count(), welcome: await page.locator('[data-attr="product-push-welcome"]').count(), errors }))
    assert.equal(errors.length, 0)
    await browser.close()
})().catch((error) => { console.error(error); process.exit(1) })
