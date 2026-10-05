import fs from 'node:fs'
import { chromium } from 'playwright'

import { designs } from './designs.mjs'
fs.mkdirSync('out', { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1300, height: 900 } })
await page.goto('http://localhost:8765/index.html?pid=275430')
await page.waitForFunction(() => window.editorReady, null, { timeout: 60000 })
const view = await browser.newPage({ viewport: { width: 640, height: 700 } })
for (const [name, design] of Object.entries(designs)) {
    await page.evaluate((d) => window.loadDesign(d), design)
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `out/${name}.editor.png`, clip: { x: 130, y: 70, width: 620, height: 340 } })
    const { html, design: saved } = await page.evaluate(() => window.exportHtml())
    fs.writeFileSync(`out/${name}.export.html`, html)
    fs.writeFileSync(`out/${name}.saved.json`, JSON.stringify(saved, null, 2))
    await view.setContent(html, { waitUntil: 'load' })
    await view.screenshot({ path: `out/${name}.export.png`, clip: { x: 0, y: 0, width: 640, height: 340 } })
}
await browser.close()
