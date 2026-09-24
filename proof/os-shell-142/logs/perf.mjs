// Perf harness for OS shell windows (ticket 142). Not committed to the product tree.
// Usage: node perf.mjs <baseUrl> <scenario> <outDir> [--flag-off] [--no-trace]
// Scenarios: workflows | dashboards | flags | four | drag | toplevel-<app>
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'

const require = createRequire(import.meta.url)
const { chromium } = require('/home/coder/posthog/.claude/worktrees/agent-a2ebcac554c28c48a/node_modules/playwright')

const [, , baseUrl, scenario, outDir, ...rest] = process.argv
const noTrace = rest.includes('--no-trace')
const creds = JSON.parse(fs.readFileSync('/home/coder/dev/os-shell-stack/credentials.json', 'utf8'))
const PROJECT = creds.project_id
fs.mkdirSync(outDir, { recursive: true })

const APPS = {
    workflows: { label: 'Workflows', path: `/project/${PROJECT}/workflows` },
    dashboards: { label: 'Dashboards', path: `/project/${PROJECT}/dashboard` },
    flags: { label: 'Feature flags', path: `/project/${PROJECT}/feature_flags` },
    store: { label: 'App Store', path: `/project/${PROJECT}/app-store` },
}
const RENDER_TIMEOUT = Number(process.env.RENDER_TIMEOUT ?? 90000)

const INIT = `(() => {
  window.__perf = { errors: [], longTasks: [] };
  const push = (kind, text) => window.__perf.errors.push({ kind, text: String(text).slice(0, 300), t: performance.now() });
  const origError = console.error;
  console.error = function (...args) { try { push('console.error', args.map(a => a && a.message ? a.message : typeof a === 'string' ? a : JSON.stringify(a)).join(' ')); } catch (e) {} return origError.apply(this, args); };
  window.addEventListener('error', (e) => push('error', e.message));
  window.addEventListener('unhandledrejection', (e) => push('unhandledrejection', e.reason && e.reason.message ? e.reason.message : e.reason));
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.longTasks.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
})();`

function frameState() {
    const main = document.querySelector('#main-content')
    const text = (main?.innerText ?? '').trim()
    const bodyText = (document.body?.innerText ?? '').trim()
    return {
        hasMain: !!main,
        textLen: text.length,
        bodyLen: bodyText.length,
        errorPage: /App assets regenerated|Something went wrong|Failed to load|error/i.test(bodyText.slice(0, 400)) && !main,
        bodyStart: bodyText.slice(0, 160),
        mainStart: text.slice(0, 120),
        rootEmpty: !document.querySelector('#root')?.children.length,
        loaders: main ? main.querySelectorAll('.Spinner, .LemonSkeleton, .SpinnerOverlay').length : -1,
        href: location.pathname,
        ready: document.readyState,
    }
}

async function login(context) {
    const loginPage = await context.newPage()
    await loginPage.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    const cookies = await context.cookies()
    const csrf = cookies.find((c) => c.name === 'posthog_csrftoken' || c.name === 'csrftoken')?.value
    const res = await context.request.post(`${baseUrl}/api/login/`, {
        data: { email: creds.email, password: creds.password },
        headers: csrf ? { 'X-CSRFToken': csrf, Referer: `${baseUrl}/login` } : { Referer: `${baseUrl}/login` },
    })
    if (res.status() !== 200) {
        throw new Error(`login failed ${res.status()} ${(await res.text()).slice(0, 200)}`)
    }
    await loginPage.close()
}

function osWindowFrames(page) {
    return page.frames().filter((f) => f.name().startsWith('posthog-os-window:'))
}

async function main() {
    const browser = await chromium.launch({ args: ['--enable-precise-memory-info'] })
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
    await context.addInitScript(INIT)
    await login(context)
    const page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Page.enable')
    const requests = new Map() // requestId -> {frameId, url, start, end, bytes, failed}
    cdp.on('Network.requestWillBeSent', (e) => {
        requests.set(e.requestId, { frameId: e.frameId, url: e.request.url, start: e.timestamp, type: e.type })
    })
    cdp.on('Network.loadingFinished', (e) => {
        const r = requests.get(e.requestId)
        if (r) {
            r.end = e.timestamp
            r.bytes = e.encodedDataLength
        }
    })
    cdp.on('Network.loadingFailed', (e) => {
        const r = requests.get(e.requestId)
        if (r) {
            r.end = e.timestamp
            r.failed = e.errorText
        }
    })
    cdp.on('Network.responseReceived', (e) => {
        const r = requests.get(e.requestId)
        if (r) {
            r.status = e.response.status
        }
    })
    const frameNavs = [] // frame reloads
    page.on('framenavigated', (f) => frameNavs.push({ name: f.name() || '(top)', url: f.url().replace(baseUrl, ''), t: Date.now() }))

    const flagOff = scenario.startsWith('toplevel-')
    // Start from an empty desktop: clear saved window layout for this project.
    const startPath = flagOff ? `/project/${PROJECT}/` : '/os'
    await page.goto(`${baseUrl}${startPath}`, { waitUntil: 'domcontentloaded', timeout: 180000 }).catch((e) => console.error('goto', String(e).slice(0, 80)))
    await page.waitForLoadState('load')
    await page.evaluate(() => {
        for (const k of Object.keys(localStorage)) {
            if (k.startsWith('posthog-os-windows') || k.startsWith('posthog-os-dock')) localStorage.removeItem(k)
        }
        for (const k of Object.keys(sessionStorage)) {
            if (k.startsWith('posthog-os-windows')) sessionStorage.removeItem(k)
        }
    })
    await page.goto(`${baseUrl}${startPath}`, { waitUntil: 'load', timeout: 180000 }).catch((e) => console.error('goto', String(e).slice(0, 80)))
    if (!flagOff) {
        await page.waitForSelector('[data-attr="os-window-layer"]', { timeout: 180000 })
        await page.getByText('Workflows', { exact: true }).first().waitFor({ timeout: 120000 })
    } else {
        await page.waitForSelector('#main-content', { timeout: 180000 })
    }
    await page.waitForTimeout(3000)

    if (scenario === 'restore') {
        for (const key of ['store', 'flags', 'dashboards', 'workflows']) {
            await page.locator('.OsShell__icon-label', { hasText: new RegExp(`^${APPS[key].label}$`) }).first().evaluate((el) => el.click())
            await page.waitForTimeout(300)
        }
        await page.waitForTimeout(15000)
    }
    const traceFile = path.join(outDir, `${scenario}.trace.json`)
    if (!noTrace) {
        await browser.startTracing(page, {
            path: traceFile,
            screenshots: true,
            categories: [
                'devtools.timeline',
                'disabled-by-default-devtools.timeline',
                'disabled-by-default-devtools.timeline.frame',
                'disabled-by-default-devtools.screenshot',
                'toplevel',
                'blink.user_timing',
                'loading',
                'latencyInfo',
            ],
        })
    }
    const reqBaseline = new Set(requests.keys())
    const t0 = Date.now()
    const results = { scenario, baseUrl: baseUrl.includes('trycloudflare') ? '<public demo>' : baseUrl, windows: [] }

    const openApps =
        scenario === 'four' || scenario === 'drag' || scenario === 'restore'
            ? ['store', 'flags', 'dashboards', 'workflows']
            : flagOff
              ? [scenario.replace('toplevel-', '')]
              : [scenario]

    if (flagOff) {
        const app = APPS[openApps[0]]
        const start = Date.now()
        await page.goto(`${baseUrl}${app.path}`, { waitUntil: 'commit' })
        let firstRender = null
        let firstPaint = null
        let state = null
        while (Date.now() - start < RENDER_TIMEOUT) {
            state = await page.mainFrame().evaluate(frameState).catch(() => null)
            if (state && firstPaint === null && state.rootEmpty === false) {
                firstPaint = Date.now() - start
            }
            if (state && state.hasMain && state.textLen > 30 && state.loaders === 0) {
                firstRender = Date.now() - start
                break
            }
            await page.waitForTimeout(100)
        }
        results.windows.push({ app: openApps[0], firstPaintMs: firstPaint, firstRenderMs: firstRender, state })
    } else {
        const clickTimes = {}
        if (scenario === 'restore') {
            // The layout was saved by a previous visit: reload and time each restored window from the reload.
            const reloadAt = Date.now()
            for (const key of openApps) clickTimes[key] = reloadAt
            await page.reload({ waitUntil: 'commit' })
        }
        for (const key of scenario === 'restore' ? [] : openApps) {
            const app = APPS[key]
            clickTimes[key] = Date.now()
            // Windows can cover desktop icons, so click the icon element directly.
            await page.locator('.OsShell__icon-label', { hasText: new RegExp(`^${app.label}$`) }).first().evaluate((el) => el.click())
            await page.waitForTimeout(300)
        }
        if (rest.includes('--shot')) {
            await page.waitForTimeout(500)
            await page.screenshot({ path: path.join(outDir, `${scenario}-while-loading.png`) })
        }
        // Poll every frame until it renders or the timeout passes.
        const pending = new Set(openApps)
        const firstRender = {}
        const firstPaint = {}
        const lastState = {}
        while (pending.size && Date.now() - t0 < RENDER_TIMEOUT) {
            for (const f of osWindowFrames(page)) {
                const state = await f.evaluate(frameState).catch((e) => ({ evalError: String(e).slice(0, 100) }))
                const key = Object.keys(APPS).find((k) => state.href && state.href.includes(APPS[k].path.split('/').pop()))
                if (!key) continue
                lastState[key] = state
                if (firstPaint[key] === undefined && state.rootEmpty === false) {
                    firstPaint[key] = Date.now() - clickTimes[key]
                }
                if (pending.has(key) && state.hasMain && state.textLen > 30 && state.loaders === 0) {
                    firstRender[key] = Date.now() - clickTimes[key]
                    pending.delete(key)
                }
            }
            await page.waitForTimeout(100)
        }
        for (const key of openApps) {
            results.windows.push({ app: key, firstPaintMs: firstPaint[key] ?? null, firstRenderMs: firstRender[key] ?? null, state: lastState[key] ?? null })
        }
        await page.screenshot({ path: path.join(outDir, `${scenario}.png`) })

        if (scenario === 'drag') {
            // Drag the top window's title bar and resize it, while four frames are open.
            const header = page.locator('[data-attr="os-window"][data-focused] header').first()
            const box = await header.boundingBox()
            const dragStart = Date.now()
            await page.evaluate(() => (window.__perf.dragMark = performance.now()))
            await page.mouse.move(box.x + 100, box.y + 10)
            await page.mouse.down()
            for (let i = 0; i < 60; i++) {
                await page.mouse.move(box.x + 100 + i * 5, box.y + 10 + i * 2)
            }
            await page.mouse.up()
            const win = page.locator('[data-attr="os-window"][data-focused]').first()
            const wb = await win.boundingBox()
            await page.mouse.move(wb.x + wb.width - 3, wb.y + wb.height / 2)
            await page.mouse.down()
            for (let i = 0; i < 60; i++) {
                await page.mouse.move(wb.x + wb.width - 3 - i * 4, wb.y + wb.height / 2)
            }
            await page.mouse.up()
            results.dragMs = Date.now() - dragStart
            results.dragLongTasks = await page.evaluate(() =>
                window.__perf.longTasks.filter(([s]) => s >= window.__perf.dragMark)
            )
            // Frame reloads during drag and resize (a reload means the frame was remounted).
            results.frameNavsDuringDrag = frameNavs.filter((n) => n.t >= dragStart && n.name !== '(top)').length
        }
    }
    await page.waitForTimeout(1500)
    if (!noTrace) {
        await browser.stopTracing()
    }

    // Per-frame network, errors, long tasks.
    const tree = await cdp.send('Page.getFrameTree')
    const frameNames = {}
    const walk = (node) => {
        frameNames[node.frame.id] = node.frame.name || '(top)'
        for (const c of node.childFrames ?? []) walk(c)
    }
    walk(tree.frameTree)
    const perFrame = {}
    for (const [id, r] of requests) {
        if (reqBaseline.has(id)) continue
        const name = frameNames[r.frameId] ?? r.frameId
        const pf = (perFrame[name] ??= { requests: 0, bytes: 0, failed: 0, slowest: [], statuses: {} })
        pf.requests++
        pf.bytes += r.bytes ?? 0
        if (r.failed || (r.status ?? 0) >= 400) pf.failed++
        pf.statuses[r.status ?? r.failed ?? 'pending'] = (pf.statuses[r.status ?? r.failed ?? 'pending'] ?? 0) + 1
        if (r.end) pf.slowest.push([Math.round((r.end - r.start) * 1000), r.url.replace(baseUrl, '').slice(0, 120)])
        if (!r.end) pf.slowest.push([-1, 'PENDING ' + r.url.replace(baseUrl, '').slice(0, 120)])
    }
    for (const pf of Object.values(perFrame)) {
        pf.slowest.sort((a, b) => (b[0] === -1 ? 1e9 : b[0]) - (a[0] === -1 ? 1e9 : a[0]))
        pf.slowest = pf.slowest.slice(0, 5)
    }
    results.network = perFrame
    results.errors = {}
    results.longTasks = {}
    for (const f of page.frames()) {
        const name = f.name() || '(top)'
        const perf = await f.evaluate(() => window.__perf).catch(() => null)
        if (!perf) continue
        results.errors[name] = perf.errors.slice(0, 20)
        results.longTasks[name] = {
            count: perf.longTasks.length,
            totalMs: Math.round(perf.longTasks.reduce((s, [, d]) => s + d, 0)),
        }
    }
    results.frameNavigations = frameNavs.filter((n) => n.name !== '(top)').length
    results.topNavigations = frameNavs.filter((n) => n.name === '(top)').map((n) => n.url)
    results.totalMs = Date.now() - t0
    fs.writeFileSync(path.join(outDir, `${scenario}.json`), JSON.stringify(results, null, 2))
    if (!noTrace) {
        results.trace = summarizeTrace(traceFile)
        fs.writeFileSync(path.join(outDir, `${scenario}.json`), JSON.stringify(results, null, 2))
    }
    console.log(JSON.stringify(summary(results), null, 1))
    await browser.close()
}

function summarizeTrace(file) {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    const events = data.traceEvents ?? data
    const threads = {}
    for (const e of events) {
        if (e.ph === 'M' && e.name === 'thread_name') threads[`${e.pid}:${e.tid}`] = e.args.name
    }
    let mainKey = null
    let best = 0
    const totals = {}
    for (const e of events) {
        if (e.name === 'RunTask' && e.ph === 'X' && threads[`${e.pid}:${e.tid}`] === 'CrRendererMain') {
            const k = `${e.pid}:${e.tid}`
            totals[k] ??= { busy: 0, long: 0, longCount: 0 }
            totals[k].busy += e.dur / 1000
            if (e.dur > 50000) {
                totals[k].long += e.dur / 1000
                totals[k].longCount++
            }
        }
    }
    for (const [k, v] of Object.entries(totals)) {
        if (v.busy > best) {
            best = v.busy
            mainKey = k
        }
    }
    const m = totals[mainKey] ?? { busy: 0, long: 0, longCount: 0 }
    return {
        mainThreadBusyMs: Math.round(m.busy),
        longTaskCount: m.longCount,
        longTaskTotalMs: Math.round(m.long),
        rendererThreads: Object.keys(totals).length,
    }
}

function summary(r) {
    return {
        scenario: r.scenario,
        windows: r.windows.map((w) => ({
            app: w.app,
            firstPaintMs: w.firstPaintMs,
            firstRenderMs: w.firstRenderMs,
            state: w.state && { hasMain: w.state.hasMain, loaders: w.state.loaders, main: w.state.mainStart?.slice(0, 80) },
        })),
        network: Object.fromEntries(
            Object.entries(r.network).map(([k, v]) => [k, { req: v.requests, kb: Math.round(v.bytes / 1024), failed: v.failed }])
        ),
        errors: Object.fromEntries(Object.entries(r.errors).map(([k, v]) => [k, v.filter((e) => !e.text.includes('PostHog.js')).length])),
        trace: r.trace,
        frameNavigations: r.frameNavigations,
        topNavigations: r.topNavigations,
        dragMs: r.dragMs,
        dragLongTasks: r.dragLongTasks?.length,
        frameNavsDuringDrag: r.frameNavsDuringDrag,
    }
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
