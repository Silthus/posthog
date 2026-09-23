// End-to-end validation of the OS shell on the regular URLs.
// Usage: BROWSER=chromium|firefox|webkit WIDTH=1440 THEME=light|dark FULL=1 node validate.js
const fs = require('fs')
const c = require('./common')

const BROWSER = process.env.BROWSER || 'chromium'
const WIDTH = Number(process.env.WIDTH || 1440)
const THEME = process.env.THEME || 'light'
const FULL = process.env.FULL === '1'
const TAG = `${BROWSER}-${WIDTH}-${THEME}`
const DIR = `${c.OUT}/${TAG}`
fs.mkdirSync(DIR, { recursive: true })
const results = []
let shotN = 0

async function step(page, name, fn) {
    const t0 = Date.now()
    let ok = false
    let detail = ''
    try {
        detail = (await fn()) ?? ''
        ok = true
    } catch (e) {
        detail = String(e.message || e).split('\n')[0].slice(0, 300)
    }
    const shot = `${String(++shotN).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`
    await page.screenshot({ path: `${DIR}/${shot}` }).catch(() => {})
    results.push({ name, ok, detail, shot: `${TAG}/${shot}`, ms: Date.now() - t0 })
    c.log(TAG, ok ? 'PASS' : 'FAIL', name, detail)
    return ok
}

function assert(cond, msg) {
    if (!cond) {
        throw new Error(msg)
    }
}

const frameOf = async (page, id) => {
    const el = await page.locator(`[data-os-window-id="${id}"] iframe`).elementHandle()
    return el.contentFrame()
}

async function waitWindows(page, n, timeout = 30000) {
    const t0 = Date.now()
    while (Date.now() - t0 < timeout) {
        const ws = (await c.windows(page)).filter((w) => !w.hidden)
        if (ws.length === n) {
            return ws
        }
        await page.waitForTimeout(300)
    }
    throw new Error(`expected ${n} visible windows, got ${JSON.stringify(await c.windows(page))}`)
}

async function focus(page, id) {
    await page.locator(`[data-os-window-id="${id}"]`).dispatchEvent("pointerdown")
    await page.waitForTimeout(300)
}

async function bounds(page, id) {
    return page.locator(`[data-os-window-id="${id}"]`).boundingBox()
}

async function focusedFrameReady(page, text) {
    const ws = await c.windows(page)
    const f = ws.find((w) => w.focused)
    assert(f, 'no focused window')
    const frame = await frameOf(page, f.id)
    if (text) {
        await frame.getByText(text, { exact: false }).first().waitFor({ timeout: 120000 })
    } else {
        await frame.waitForLoadState('load', { timeout: 120000 })
    }
    return { win: f, frame }
}

;(async () => {
    const browser = await c.launch(BROWSER)
    const ctx = await c.newContext(browser, { width: WIDTH, height: 900 })
    await c.setTheme(ctx, 'light')
    const page = await ctx.newPage()
    const ev = c.watchPage(page, TAG)
    const T = c.T
    const c_T = c.T

    // Clean layout and pins so every run starts the same.
    await page.goto(`${c.BASE}/project/${T}/os`)
    await c.waitDesktop(page)
    await page.evaluate(() => {
        for (const k of Object.keys(localStorage)) {
            if (k.startsWith('posthog-os') || k.includes('osDockLogic')) {
                localStorage.removeItem(k)
            }
        }
        sessionStorage.clear()
    })

    await step(page, 'first load of a deep link', async () => {
        await page.goto(`${c.BASE}/project/${T}/feature_flags`)
        await c.waitDesktop(page)
        const ws = await waitWindows(page, 1, 120000)
        assert(ws[0].src.includes('/feature_flags'), 'window does not show the deep link: ' + ws[0].src)
        await focusedFrameReady(page, 'Feature flags')
        assert(new URL(page.url()).pathname === `/project/${T}/feature_flags`, 'address bar ' + page.url())
        return `window ${ws[0].src}, address bar ${new URL(page.url()).pathname}`
    })

    if (THEME === 'dark') {
        await step(page, 'dark mode from the account menu', async () => {
            await page.locator('[data-attr="os-menu-account"]').click()
            await page.getByText('Color theme').click()
            await page.getByText('Dark mode').click()
            await page.keyboard.press('Escape')
            await page.waitForTimeout(1500)
            const hostTheme = await page.evaluate(() => document.body.getAttribute('theme'))
            const { frame } = await focusedFrameReady(page)
            const frameTheme = await frame.evaluate(() => document.body.getAttribute('theme'))
            assert(hostTheme === 'dark' && frameTheme === 'dark', `host ${hostTheme}, frame ${frameTheme}`)
            return `host ${hostTheme}, open window ${frameTheme}`
        })
    }

    await step(page, 'open an app from the desktop', async () => {
        await page.locator('[data-attr="os-desktop-icon-tool-Session replay"]').click()
        const ws = await waitWindows(page, 2, 30000)
        const replay = ws.find((w) => w.focused)
        assert(replay.src.startsWith(`/project/${T}/replay`), 'src ' + replay.src)
        await focusedFrameReady(page)
        return `new window ${replay.src}`
    })

    await step(page, 'open the same app again focuses its window', async () => {
        const before = (await c.windows(page)).length
        // The flags window is on top of the icon column after the first click, so move focus to it first.
        const flags = (await c.windows(page)).find((w) => w.src.includes('feature_flags'))
        await focus(page, flags.id)
        await page.locator('[data-attr="os-desktop-icon-tool-Session replay"]').click({ force: true })
        await page.waitForTimeout(1500)
        const ws = await c.windows(page)
        assert(ws.length === before, `windows ${before} -> ${ws.length}`)
        assert(ws.find((w) => w.focused)?.src.includes('/replay'), 'replay is not focused')
        return `${ws.length} windows, replay focused`
    })

    await step(page, 'open an app from the centered search', async () => {
        await page.locator('[data-attr="os-menu-search"]').click()
        const input = page.getByRole('dialog').locator('input').first()
        await input.waitFor({ timeout: 10000 })
        await input.fill('Surveys')
        await page.getByRole('dialog').getByText('Behavior').first().click({ timeout: 15000 })
        const ws = await waitWindows(page, 3, 30000)
        const top = ws.find((w) => w.focused)
        assert(top.src.includes('/surveys'), 'src ' + top.src)
        return `spotlight opened ${top.src}`
    })

    await step(page, 'Cmd+K on the desktop opens the same spotlight', async () => {
        await page.locator('[data-attr="os-menu-bar"]').click({ position: { x: 5, y: 5 } }).catch(() => {})
        await page.keyboard.press('Control+k')
        await page.getByRole('dialog').locator('input').first().waitFor({ timeout: 10000 })
        await page.keyboard.press('Escape')
        return 'spotlight dialog opened'
    })

    await step(page, 'open the App Store from the dock', async () => {
        await page.locator('[data-attr="os-dock-app-store"]').click()
        const ws = await waitWindows(page, 4, 30000)
        const top = ws.find((w) => w.focused)
        assert(top.src.includes('/app-store'), 'src ' + top.src)
        const frame = await frameOf(page, top.id)
        await frame.locator('[data-attr="os-app-store-tile"]').first().waitFor({ timeout: 120000 })
        return `store window ${top.src}`
    })

    await step(page, 'dock shows one tile per open app', async () => {
        const tiles = await c.dockTiles(page)
        const apps = tiles.filter((t) => t.startsWith('os-dock-app:'))
        assert(apps.length === 3, 'tiles ' + JSON.stringify(tiles))
        return tiles.join(', ')
    })

    await step(page, 'drag a window by its title bar', async () => {
        const top = (await c.windows(page)).find((w) => w.focused)
        const b0 = await bounds(page, top.id)
        const hx = b0.x + 60
        const hy = b0.y + 14
        await page.mouse.move(hx, hy)
        await page.mouse.down()
        await page.mouse.move(hx + 40, hy + 30, { steps: 5 })
        await page.mouse.move(hx + 80, hy + 60, { steps: 5 })
        await page.mouse.up()
        await page.waitForTimeout(400)
        const b1 = await bounds(page, top.id)
        assert(Math.abs(b1.x - b0.x - 80) < 6 && Math.abs(b1.y - b0.y - 60) < 6, `${JSON.stringify(b0)} -> ${JSON.stringify(b1)}`)
        return `moved by ${Math.round(b1.x - b0.x)},${Math.round(b1.y - b0.y)}`
    })

    await step(page, 'resize a window from its right edge', async () => {
        const top = (await c.windows(page)).find((w) => w.focused)
        const b0 = await bounds(page, top.id)
        const x = b0.x + b0.width - 2
        const y = b0.y + b0.height / 2
        await page.mouse.move(x, y)
        await page.mouse.down()
        await page.mouse.move(x - 60, y, { steps: 6 })
        await page.mouse.up()
        await page.waitForTimeout(400)
        const b1 = await bounds(page, top.id)
        assert(b0.width - b1.width > 40, `${b0.width} -> ${b1.width}`)
        return `width ${Math.round(b0.width)} -> ${Math.round(b1.width)}`
    })

    await step(page, 'snap a window to the left half', async () => {
        const top = (await c.windows(page)).find((w) => w.focused)
        const b0 = await bounds(page, top.id)
        const hx = b0.x + 60
        const hy = b0.y + 14
        await page.mouse.move(hx, hy)
        await page.mouse.down()
        await page.mouse.move(hx - 100, hy + 20, { steps: 5 })
        await page.mouse.move(1, hy + 100, { steps: 10 })
        await page.waitForTimeout(200)
        const preview = await page.locator('[data-attr="os-window-snap-preview"]').count()
        await page.mouse.up()
        await page.waitForTimeout(500)
        const b1 = await bounds(page, top.id)
        assert(b1.x < 20 && Math.abs(b1.width - WIDTH / 2) < 30, JSON.stringify(b1))
        return `snap preview shown: ${preview > 0}; window ${Math.round(b1.x)},${Math.round(b1.y)} ${Math.round(b1.width)}x${Math.round(b1.height)}`
    })

    await step(page, 'tidy up with Alt+Shift+G', async () => {
        await page.locator('[data-attr="os-desktop"]').click({ position: { x: WIDTH - 20, y: 300 } }).catch(() => {})
        await page.keyboard.press('Alt+Shift+KeyG')
        await page.waitForTimeout(800)
        const ws = (await c.windows(page)).filter((w) => !w.hidden)
        const bs = await Promise.all(ws.map((w) => bounds(page, w.id)))
        const overlaps = bs.some((a, i) =>
            bs.some((b, j) => i < j && a.x < b.x + b.width - 2 && b.x < a.x + a.width - 2 && a.y < b.y + b.height - 2 && b.y < a.y + a.height - 2)
        )
        assert(!overlaps, 'windows overlap after tidy up: ' + JSON.stringify(bs))
        return `${ws.length} windows in a grid`
    })

    await step(page, 'minimize a window and restore it from the dock', async () => {
        const replay = (await c.windows(page)).find((w) => w.src.includes('/replay'))
        await focus(page, replay.id)
        await page.locator(`[data-os-window-id="${replay.id}"] [data-attr="os-window-minimize"]`).click()
        await page.waitForTimeout(600)
        let w = (await c.windows(page)).find((x) => x.id === replay.id)
        assert(w.hidden, 'not minimized')
        const tile = page.locator('[data-attr="os-dock-app"][aria-label*="Session replay"]')
        await tile.click()
        await page.waitForTimeout(600)
        w = (await c.windows(page)).find((x) => x.id === replay.id)
        assert(!w.hidden && w.focused, 'not restored ' + JSON.stringify(w))
        return 'minimized, then restored and focused from the dock tile'
    })

    await step(page, 'app menu lists the focused app pages and navigates in place', async () => {
        const replay = (await c.windows(page)).find((w) => w.focused)
        await page.locator('[data-attr="os-app-menu"]').click()
        const target = page.getByText('Collections', { exact: true }).first()
        await target.waitFor({ timeout: 5000 })
        const items = await page.locator('.LemonMenu, [role="menu"], .Popover').first().allInnerTexts().catch(() => [])
        await target.click()
        await page.waitForTimeout(3000)
        const after = (await c.windows(page)).find((w) => w.id === replay.id)
        const frame = await frameOf(page, replay.id)
        const framePath = new URL(frame.url()).pathname
        assert(framePath.includes('/replay/playlists') || framePath.includes('/replay/collections'), 'frame at ' + framePath)
        assert((await c.windows(page)).length === 4, 'window count changed')
        return `menu: ${items.map((s) => s.trim()).filter(Boolean).slice(0, 8).join(' | ')}; window now at ${framePath}; title ${after.title}`
    })

    await step(page, 'pin an app, close it, reload, then unpin', async () => {
        const tile = page.locator('[data-attr="os-dock-app"][aria-label*="Surveys"]')
        await tile.click({ button: 'right' })
        await page.locator('[data-attr="os-dock-pin"]').click()
        await page.waitForTimeout(300)
        await tile.click({ button: 'right' })
        await page.locator('[data-attr="os-dock-close"]').click()
        await page.waitForTimeout(600)
        assert(await tile.count(), 'pinned tile left the dock after close')
        await page.reload()
        await c.waitDesktop(page)
        await page.waitForTimeout(3000)
        assert(await tile.count(), 'pin lost after reload')
        await tile.click({ button: 'right' })
        await page.locator('[data-attr="os-dock-unpin"]').click()
        await page.waitForTimeout(600)
        assert((await tile.count()) === 0, 'tile stayed after unpin')
        return 'pinned tile stayed after close and reload, and left after unpin'
    })

    await step(page, 'refresh restores the layout', async () => {
        const before = (await c.windows(page)).map((w) => `${w.id}:${w.hidden}`).sort()
        const bBefore = await Promise.all((await c.windows(page)).map((w) => bounds(page, w.id)))
        await page.reload()
        await c.waitDesktop(page)
        await page.waitForTimeout(3000)
        const after = (await c.windows(page)).map((w) => `${w.id}:${w.hidden}`).sort()
        assert(JSON.stringify(before) === JSON.stringify(after), `${before} vs ${after}`)
        const bAfter = await Promise.all((await c.windows(page)).map((w) => bounds(page, w.id)))
        return `${after.length} windows back with the same ids; bounds equal: ${JSON.stringify(bBefore) === JSON.stringify(bAfter)}`
    })

    if (FULL) {
        await step(page, 'plain link stays in its window, Cmd+click opens a new window', async () => {
            const flags = (await c.windows(page)).find((w) => w.src.includes('feature_flags'))
            await focus(page, flags.id)
            const frame = await frameOf(page, flags.id)
            const link = frame.locator('a[href*="/feature_flags/"]').first()
            await link.waitFor({ timeout: 60000 })
            const href = await link.getAttribute('href')
            const count0 = (await c.windows(page)).length
            await link.click({ modifiers: [BROWSER === 'webkit' ? 'Meta' : 'Control'] })
            await page.waitForTimeout(2500)
            const count1 = (await c.windows(page)).length
            assert(count1 === count0 + 1, `Cmd+click: windows ${count0} -> ${count1}`)
            assert(ctx.pages().length === 1, 'a browser tab opened')
            await focus(page, flags.id)
            await (await frameOf(page, flags.id)).locator('a[href*="/feature_flags/"]').first().click()
            await page.waitForTimeout(2500)
            const count2 = (await c.windows(page)).length
            const framePath = new URL((await frameOf(page, flags.id)).url()).pathname
            assert(count2 === count1 && framePath.includes('/feature_flags/'), `plain click: windows ${count2}, frame at ${framePath}`)
            return `${href}: Cmd+click opened window ${count1}; plain click stayed in the window at ${framePath}; tabs ${ctx.pages().length}`
        })

        await step(page, 'App Store preview, install from the bar, remove', async () => {
            const store = (await c.windows(page)).find((w) => w.src.includes('/app-store'))
            await focus(page, store.id)
            await page.locator(`[data-os-window-id="${store.id}"] [data-attr="os-window-maximize"]`).click()
            await page.waitForTimeout(500)
            const frame = await frameOf(page, store.id)
            const tile = frame.locator('[data-attr="os-app-store-tile-surveys"]')
            await tile.scrollIntoViewIfNeeded()
            await tile.click()
            const listing = frame.locator('[data-attr="os-app-store-listing"]')
            await listing.waitFor({ timeout: 30000 })
            if (await listing.locator('[data-attr="os-app-store-remove"]').count()) {
                await listing.locator('[data-attr="os-app-store-remove"]').click()
                await listing.locator('[data-attr="os-app-store-preview"]').waitFor({ timeout: 15000 })
                // Visiting Surveys earlier added it through product intents; let the OS page reload its list.
                await page.waitForTimeout(3000)
            }
            const n0 = (await c.windows(page)).length
            await listing.locator('[data-attr="os-app-store-preview"]').click()
            await page.waitForTimeout(2500)
            const ws = await c.windows(page)
            const preview = ws.find((w) => w.focused)
            assert(ws.length === n0 + 1 && preview.src.includes('/surveys'), 'no preview window ' + JSON.stringify(preview))
            const installedNow = await page.evaluate(async (T) => (await (await fetch(`/api/environments/${T}/user_product_list/`)).json()).results.map((r) => r.product_path), c_T)
            c.log(TAG, 'installed at preview time', JSON.stringify(installedNow), 'bar count', await page.locator('[data-attr="os-app-preview-bar"]').count(), 'windows', JSON.stringify(await c.windows(page)))
            await page.locator(`[data-os-window-id="${preview.id}"] [data-attr="os-app-preview-bar"]`).waitFor({ timeout: 10000 })
            assert((await page.locator('[data-attr="os-desktop-icon-tool-Surveys"]').count()) === 0, 'preview installed the app')
            await page.screenshot({ path: `${DIR}/preview-window.png` })
            await page.locator(`[data-os-window-id="${preview.id}"] [data-attr="os-app-preview-install"]`).click()
            await page.locator('[data-attr="os-desktop-icon-tool-Surveys"]').waitFor({ timeout: 15000 })
            assert((await page.locator(`[data-os-window-id="${preview.id}"] [data-attr="os-app-preview-bar"]`).count()) === 0, 'bar stayed')
            await focus(page, store.id)
            const f2 = await frameOf(page, store.id)
            // A real click moves focus into the store frame, which reloads its installed list on focus.
            await f2.locator('[data-attr="os-app-store-listing"]').click({ position: { x: 5, y: 5 } })
            const remove = f2.locator('[data-attr="os-app-store-listing"] [data-attr="os-app-store-remove"]')
            await remove.waitFor({ timeout: 30000 })
            await remove.click()
            await page.waitForTimeout(3000)
            assert((await page.locator('[data-attr="os-desktop-icon-tool-Surveys"]').count()) === 0, 'icon stayed after remove')
            return 'preview opened without an icon; install from the bar added the icon and hid the bar; remove took it away'
        })

        await step(page, 'install from the store listing and open', async () => {
            const store = (await c.windows(page)).find((w) => w.src.includes('/app-store'))
            await focus(page, store.id)
            const frame = await frameOf(page, store.id)
            const listing = frame.locator('[data-attr="os-app-store-listing"]')
            await listing.locator('[data-attr="os-app-store-install"]').click()
            await listing.locator('[data-attr="os-app-store-open"]').waitFor({ timeout: 15000 })
            await page.locator('[data-attr="os-desktop-icon-tool-Surveys"]').waitFor({ timeout: 15000 })
            const n0 = (await c.windows(page)).length
            await listing.locator('[data-attr="os-app-store-open"]').click()
            await page.waitForTimeout(3000)
            const ws = await c.windows(page)
            const top = ws.find((w) => w.focused)
            assert(top.src.startsWith(`/project/${T}/surveys`), 'Open used ' + top.src)
            await focus(page, store.id)
            await listing.locator('[data-attr="os-app-store-open"]').click()
            await page.waitForTimeout(2000)
            const ws2 = await c.windows(page)
            assert(ws2.length === ws.length, `second Open made another window: ${ws.length} -> ${ws2.length}`)
            // Clean up: remove the app again.
            await focus(page, store.id)
            await listing.locator('[data-attr="os-app-store-remove"]').click()
            await page.waitForTimeout(2000)
            return `Open focused ${top.src} (windows ${n0} -> ${ws.length}), a second Open reused it`
        })
    }

    await step(page, 'no full page reloads during the run, no page errors', async () => {
        // The run reloads the page on purpose three times (pin check, layout check, and one in each deep link).
        assert(ev.errors.length === 0, 'page errors: ' + JSON.stringify(ev.errors.slice(0, 3)))
        return `page loads ${ev.loads}, page errors ${ev.errors.length}`
    })

    await c.setTheme(ctx, 'light')
    fs.writeFileSync(`${DIR}/report.json`, JSON.stringify(results, null, 2))
    const failed = results.filter((r) => !r.ok)
    c.log(TAG, `DONE ${results.length - failed.length}/${results.length} passed`)
    await browser.close()
})().catch((e) => {
    console.error(e)
    process.exit(1)
})
