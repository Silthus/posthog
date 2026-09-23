// Flag off: the regular layout, links behave as before, no OS window, Cmd+click opens a browser tab.
import fs from 'node:fs'
import { start, BASE, creds } from './common.mjs'
const OUT = process.argv[2] || '/tmp/os126b/flagoff'
fs.mkdirSync(OUT, { recursive: true })
const { browser, context, page } = await start()
const report = {}
try {
    await page.goto(`${BASE}/project/${creds.project_id}/dashboard`)
    await page.waitForSelector('a[href$="/dashboard/2"]', { timeout: 90000 })
    await page.waitForTimeout(3000)
    report.osShell = await page.$$eval('[data-attr="os-shell"]', (e) => e.length)
    report.osFrames = await page.$$eval('iframe[name^="posthog-os-window:"]', (e) => e.length)
    await page.screenshot({ path: `${OUT}/01-flag-off-dashboards.png` })
    await page.click('a[href$="/dashboard/2"]')
    await page.waitForURL(/\/dashboard\/2/, { timeout: 30000 })
    await page.waitForTimeout(4000)
    report.afterPlainClick = page.url().replace(BASE, '')
    await page.screenshot({ path: `${OUT}/02-flag-off-plain-click.png` })
    const link = await page.$$eval('a[href*="/insights/"]', (as) => as[0]?.getAttribute('href'))
    const newTab = context.waitForEvent('page', { timeout: 15000 }).catch(() => null)
    await page.click(`a[href="${link}"]`, { modifiers: ['ControlOrMeta'] })
    const tab = await newTab
    report.cmdClickOpenedBrowserTab = !!tab
    report.browserTabs = context.pages().length
    report.urlAfterCmdClick = page.url().replace(BASE, '')
    await page.keyboard.press('Meta+KeyK')
    await page.waitForTimeout(1500)
    report.commandMenuOpen = (await page.$$('[role="dialog"] input')).length > 0
    await page.screenshot({ path: `${OUT}/03-flag-off-command-menu.png` })
} catch (error) {
    report.error = String(error)
    await page.screenshot({ path: `${OUT}/error.png` })
} finally {
    fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report, null, 2))
    await browser.close()
}
