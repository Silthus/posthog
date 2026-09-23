# Research 02: where is the seam to render a PostHog app inside a window?

Ticket: `.scratch/os-shell/issues/02-app-scene-window-seam.md` (conductor worktree).
Source: this repo at `6a479f718c9` (master, 2026-09-23). All paths are repo-relative; line numbers are at that commit.
Method: read the source directly. Nothing was run; the stack was not started.

## TL;DR

- The app renders exactly one scene. `sceneLogic` holds one `sceneId` / `sceneParams` pair, fed by one `urlToAction` over the global URL, and `AppScene` renders `activeExportedScene` once inside one `AuthenticatedShell`.
- Scene tabs are gone. `d590266d2ff refactor(frontend): collapse sceneLogic tabs[] to single-scene state (#62051)` (2026-06-23) removed `tabs[]`, `activeTabId`, and the `tabId` logic props. Even before that, only the active tab's scene was rendered. There is no latent multi-window model to reuse.
- Same-origin iframes of the app are blocked today: `CSPMiddleware` sends an enforced `frame-ancestors https://posthog.com https://preview.posthog.com` with no `'self'`, also in DEBUG. A one-line DEBUG change unblocks it.
- A near-chromeless mode already exists: `?zen` hides the left nav, side panel and scene title, but keeps a thin top bar and is persisted to localStorage.
- Recommendation for a throwaway prototype: **(c) iframe per window**, with a small chromeless flag and the DEBUG `frame-ancestors 'self'` tweak, hosted on a new `/os` scene inside the real app. It shows real, fully working scenes in several windows at once for roughly a day of work. Fall back to (a) if iframes are unacceptable for the demo.

## 1. How one scene is chosen and mounted

### Registration: scene ids, configs, routes, loaders

- `Scene` enum: `frontend/src/scenes/sceneTypes.ts:11`. Product scenes use plain string ids from manifests instead.
- `SceneExport` (what a scene module exports as `scene`): `component`, optional `logic`, `paramsToProps`, `productKey`, `emptyState` (`frontend/src/scenes/sceneTypes.ts:260-277`).
- `SceneConfig` (per-scene metadata): `name`, `layout` (`app | app-raw | app-container | app-raw-no-header | plain | app-full-scene-height`), `projectBased`, `activityScope`, `iconType`, `canvasBackground` (`frontend/src/scenes/sceneTypes.ts:310-349`).
- Core config map `sceneConfigurations` (`frontend/src/scenes/scenes.ts:41`), merged with manifest configs `...productConfiguration` (`scenes.ts:585`).
- Route table `routes: Record<path, [sceneId, sceneKey]>` (`frontend/src/scenes/scenes.ts:744`), merged with `...productRoutes` (`scenes.ts:934`). `redirects` at `scenes.ts:612`.
- Lazy loaders `appScenes: Record<sceneId, () => import(...)>` (`frontend/src/scenes/appScenes.ts:6-7`), spread from generated `productScenes`.
- URL builders `urls = { ...productUrls, ... }` (`frontend/src/scenes/urls.ts:36-37`).

### Product manifests

- Each `products/<name>/manifest.tsx` exports a `ProductManifest` (`frontend/src/types.ts:7900-7917`): `scenes` (SceneConfig plus `import`), `routes`, `redirects`, `urls`, `fileSystemTypes`, `treeItemsNew`, `treeItemsProducts`, `setupProbe`. There are 77 manifests.
- Example: `products/feature_flags/manifest.tsx:7-26` declares two scenes, their routes and url builders.
- `frontend/build-products.mjs` scans the manifests (`:16-20`) and writes `frontend/src/products.tsx` and `frontend/src/productScenes.tsx` (`:28-29`). `products.tsx` exports `productRoutes` (`:61`), `productRedirects` (`:300`), `productConfiguration` (`:471`), `productUrls` (`:1103`), and `getTreeItemsProducts` (`:2043`).
- For the OS: `treeItemsProducts` (with `intents` and `category`) is already a machine-readable catalog of products with names, icons and hrefs. It is the obvious source for a dock or an app store listing.

### Runtime: URL to rendered scene

1. `App` mounts `sceneLogic({ scenes: appScenes })` once (`frontend/src/scenes/App.tsx:80`).
2. `sceneLogic`'s `urlToAction` builds one mapping from every `redirects` and `routes` entry to a handler, plus `'/'` and `'/*'` (404) (`frontend/src/scenes/sceneLogic.tsx:1017-1118`). A route match calls `openScene(scene, sceneKey, { params, searchParams, hashParams }, method)` (`:1094-1110`).
3. `openScene` applies global redirects (logged-in users away from signup, org/project creation, onboarding) then calls `loadScene` (`:836-931`).
4. `loadScene` imports the scene chunk via `props.scenes[sceneId]` with `retryImport`, reads the module's `scene` export (falls back to `default`), caches it with `setExportedScene`, then calls `setScene` (`:932-1011`).
5. Reducers hold exactly one current scene: `sceneId`, `sceneKey`, `sceneParams`, `lastSetScenePayload` all reduce from `setScene` (`:460-516`). `activeSceneId` applies access-control and project-access checks against the global `router.selectors.location` (`:537-580`).
6. Selectors derive `activeExportedScene` (`:582-588`), `activeSceneComponentParams` (`:605-613`), `activeSceneLogicProps = paramsToProps(sceneParams)` (`:614-625`), `activeSceneLogic` (built instance, `:627-640`), and `titleAndIcon` from the active scene logic's `breadcrumbs` selector (`:662-697`).
7. `AppScene` reads those singletons and renders one tree: `<ErrorBoundary><BindLogic logic={activeExportedScene.logic} props={activeSceneLogicProps}><SceneComponent {...activeSceneComponentParams} /></BindLogic></ErrorBoundary>`, optionally wrapped in `ProductEmptyStateGate` (`frontend/src/scenes/App.tsx:135-208`). Authenticated scenes go inside `<AuthenticatedShell>` (`App.tsx:219-225`).

So the unit a window needs is already clean: `(sceneId, params) -> appScenes[sceneId]() -> { component, logic, paramsToProps }`. What is not clean is everything around it, which reads `sceneLogic` and `router` as singletons.

### Tabs: removed, and never multi-render

- `git show d590266d2ff` (#62051, 2026-06-23) deleted 545 lines from `sceneLogic.tsx`: the `tabs` reducer ("We store all state in "tabs". This allows us to have multiple tabs open, each with its own scene and parameters."), `activeTabId`, `newTab`, `setTabs`, `setTabScrollDepth`, and the `getRouterState` hook in `frontend/src/initKea.ts` that persisted tabs into `window.history`.
- Before that commit `AppScene` still rendered only the active tab: it keyed `SceneAnimationRoot`, `BindLogic` and `ErrorBoundary` by `activeSceneLogicPropsWithTabId.tabId` (see the `App.tsx` hunk of that commit). Tabs gave per-tab logic instances (props carried `tabId`) and per-tab URL/state, but one visible scene.
- `SceneTab` survives only as the homepage snapshot type (`frontend/src/scenes/sceneTypes.ts:286-298`, `sceneLogic.tsx:83-90`).
- Consequence: resurrecting tabs would not give simultaneous rendering, and the `tabId`-keyed logic props they relied on are no longer threaded through. See section 3 for what is left.

## 2. The app shell

- `AuthenticatedShell` (`frontend/src/scenes/AuthenticatedShell.tsx:31-77`) mounts `breadcrumbsLogic`, `apiStatusLogic` and friends, then renders `<Navigation sceneConfig>{scene}</Navigation>`, `<GlobalModals />`, `<GlobalShortcuts />`, `<Command />` (search/command palette), toasts, and a feature-flagged `TerminalDock`. All of these are page-level singletons.
- `Navigation` (`frontend/src/layout/navigation-3000/Navigation.tsx:30-277`):
  - Reads `navigation3000Logic.mode` (`:42`). Any mode but `full` renders `<main>{children}</main>` with optional `MinimalNavigation` and nothing else (`:111-131`).
  - `full` renders `PanelLayout` (left nav, project tree, `frontend/src/layout/panel-layout/PanelLayout.tsx`) (`:173`), one `<main id="main-content">` that `panelLayoutLogic` measures (`:91-97`, `:183-195`), `SceneLayout` around the scene (`:196`), one `<SidePanel />` (`:225`), one scene-takeover host (`:234-244`), and one inline scene panel slot registered into `sceneLayoutLogic` (`:246-271`).
- `navigation3000Logic.mode` (`frontend/src/layout/navigation-3000/navigationLogic.tsx:569-604`): `zen` if `zenMode`; `minimal` for an unavailable org or an authenticated `plain` scene; `none` only for unauthenticated `plain` scenes and one onboarding variant; otherwise `full`.
- `SceneLayout` / `ScenePanel` (`frontend/src/layout/scenes/SceneLayout.tsx:21-39`): a scene's right-hand info panel is `createPortal`ed into the single `scenePanelElement` registered by `Navigation`, and toggles a single `scenePanelIsPresent` flag.
- `SceneTitleSection` (used by 204 files) reads `breadcrumbsLogic` (`frontend/src/layout/scenes/components/SceneTitleSection.tsx:275`) and `sceneLogic.findMounted()?.values.activeSceneId` (`:51`).

## 3. Global singletons that assume one visible scene

Each item ends with what happens if two scenes were mounted in one page.
Counts are rough greps over non-test files in `frontend/src` and `products/*/frontend`.

1. **Router.** kea-router has one global `router.values.location`. 244 files use `urlToAction`, 128 use `actionToUrl`, 39 more use `trackedActionToUrl` (`frontend/src/lib/logic/scenes/trackedActionToUrl.ts`), 31 declare `'*'` catch-alls, 641 call `router.actions.push/replace`, and 223 read `router.values.location` / `searchParams` / `hashParams` directly. `setScene` unmounts the previous scene's root logic (`frontend/src/scenes/sceneLogic.tsx:784-808`), fires `$pageview` (`:760-768`) and scrolls `#main-content` (`:771-775`). Scene logics gate `urlToAction` only by path or props (for example `sqlEditorLogic.tsx:3323-3327`). _Two scenes:_ every mounted logic reacts to one URL; each `actionToUrl` rewrites the shared address bar, so windows overwrite each other or loop; navigating in one window unmounts the other's root logic.
2. **No tab-aware gating left.** `tabAwareScene` / `tabAwareUrlToAction` / `tabAwareActionToUrl` are gone; only a comment (`frontend/src/scenes/sceneSmoke.test.tsx:16-31`, "sceneLogic now mounts each scene with NO `tabId`") and a stale telemetry label (`frontend/src/lib/logic/scenes/urlChangeTracker.ts:186`) remain. `tabId` keys survive only in the SQL editor (`scenes/data-warehouse/editor/editorSceneLogic.tsx:252`, `sqlEditorLogic.tsx:1202`, `outputPaneLogic.ts:40`, fed by `EditorScene.tsx:17`). _Two scenes:_ most scene logics are unkeyed or keyed by entity id, so two windows of the same scene type or entity share one logic instance and its state.
3. **Keyboard shortcuts.** `useKeyboardHotkeys` listens on `window` (`frontend/src/lib/hooks/useKeyboardHotkeys.tsx:64-67`, `lib/hooks/useEventListener.ts:35`). `shortcutLogic` is one global registry on `window` in capture phase (`lib/components/Shortcuts/shortcutLogic.tsx:128-129`, `:308-316`), keyed by name (`:140-145`); its `scope` only groups menu entries (`ShortcutMenu.tsx:96-145`). `GlobalShortcuts` and the `Command` palette mount once (`frontend/src/scenes/AuthenticatedShell.tsx:47`, `:55`). _Two scenes:_ hotkeys fire in every window regardless of focus; same-named shortcuts replace each other and unmounting one removes the other's.
4. **Side panel and PostHog AI context.** `sidePanelStateLogic` is unkeyed with one `selectedTab` / `sidePanelOpen` (`frontend/src/layout/navigation-3000/sidepanel/sidePanelStateLogic.tsx:44-86`). `sidePanelContextLogic` reads `sceneLogic.activeSceneLogic` for the scene's `sidePanelContext` (`sidePanelContextLogic.ts:49-80`), which drives activity, discussion and access control panels; `sidePanelLogic` closes context tabs on every `setScene` (`sidePanelLogic.tsx:234-241`). `maxContextLogic` reads `activeSceneLogic.selectors.maxContext` (`frontend/src/scenes/max/maxContextLogic.ts:291-293`, `:685-697`). _Two scenes:_ the side panel and PostHog AI describe only the URL's scene.
5. **Modals.** `LemonModal` portals to `document.body` and sets `ariaHideApp` on `#root` unless a `FloatingContainerContext` is provided (`frontend/src/lib/lemon-ui/LemonModal/LemonModal.tsx:172`, `:212-216`); `LemonDialog` appends its own root to `document.body` (`lib/lemon-ui/LemonDialog/LemonDialog.tsx:270-281`). `GlobalModals` mounts once (`frontend/src/layout/GlobalModals.tsx:49-55`); some are URL-driven (`sessionPlayerModalLogic.ts:88-136`). _Two scenes:_ any modal covers the whole desktop, not its window. (For an OS this is arguably fine.)
6. **`document.title`.** Set only by `breadcrumbsLogic` (`frontend/src/layout/navigation/Breadcrumbs/breadcrumbsLogic.tsx:279-320`) from the active scene logic's `breadcrumbs` (`:148-175`). _Two scenes:_ the browser tab names the URL's scene only.
7. **Breadcrumbs, title section, scene panel.** `breadcrumbsLogic` connects `sceneLogic.activeSceneId` (`breadcrumbsLogic.tsx:101-106`); `SceneTitleSection` and `SceneBreadcrumbs` read it (`frontend/src/layout/scenes/components/SceneTitleSection.tsx:275-279`, `SceneBreadcrumbs.tsx:20`). `sceneLayoutLogic` is unkeyed and holds one `scenePanelElement`, `sceneTakeoverElement` and `scenePanelIsPresent` (`frontend/src/layout/scenes/sceneLayoutLogic.tsx:75`, `:95-145`); `ScenePanel` portals into that one element (`frontend/src/layout/scenes/SceneLayout.tsx:21-38`). _Two scenes:_ both window headers show the URL scene's breadcrumbs; both scene panels portal into the same slot, and the first to unmount hides it for both.
8. **Layout measurement.** `panelLayoutLogic` measures the single `<main id="main-content">` and publishes `--scene-layout-rect-*` CSS variables (`frontend/src/layout/navigation-3000/Navigation.tsx:91-97`, `:150-156`); container queries key off `@container/main-content`. _Two scenes:_ components that size from these read the main well, not their window.

None of this bites inside an iframe, because each frame has its own kea store, router and DOM.

## 4. Chromeless and iframe facts

- Server framing policy (verified in source):
  - `X_FRAME_OPTIONS = "SAMEORIGIN"` (`posthog/settings/web.py:291`) via `XFrameOptionsMiddleware` (`web.py:207`).
  - `CSPMiddleware` always adds an **enforced** `frame-ancestors https://posthog.com https://preview.posthog.com` to app HTML, including under `DEBUG` (`posthog/middleware.py:1522-1533`). The comment at `:1524-1526` notes a `frame-ancestors` directive makes browsers ignore X-Frame-Options. The list has no `'self'`, so `localhost:8010` cannot frame `localhost:8010/project/...`.
  - Only the embeddable paths (`/shared/`, `/embedded/`, `/exporter/`, ...) are exempt (`posthog/middleware.py:1305-1325`). They render the exporter bundle, not normal scenes (`frontend/src/exporter/Exporter.tsx`).
  - Side note for research 01: the directive exists because posthog.com (the OS-style website) and its dev server frame the app (`posthog/middleware.py:1527`, `:1530-1533`). The website already treats the app as something that lives in a frame.
  - Prototype fix: append `'self'` to `frame_ancestors` when `settings.DEBUG` (one line at `posthog/middleware.py:1528`). This is a backend change, so keep it on the throwaway branch.
- Zen mode (existing, near-chromeless):
  - `?zen`, `?zen=1` or `?zen=true` turns it on (`frontend/src/layout/navigation-3000/navigationLogic.tsx:561-567`, listener `:1024-1030`); the URL never turns it off.
  - `zenMode` is `persist: true` (`navigationLogic.tsx:444-450`), so it lands in localStorage, which every same-origin iframe and the host page share. Opening one zen iframe flips the host tab into zen on next load.
  - It still renders `MinimalNavigation`: logo, scene title, "Exit zen mode", project menu, account menu (`frontend/src/layout/navigation-3000/components/MinimalNavigation.tsx:34-64`). It hides `SceneTitleSection` and adds `p-4`.
- Better for a prototype: a non-persisted chromeless flag. Add a selector branch in `navigation3000Logic.mode` that returns `'none'` when `window.self !== window.top` (or `?os_window=1`). That drops the left nav, side panel, minimal bar and project notice in one place (`Navigation.tsx:111-131`), and does not touch the host tab.

## 5. The four seams

### (a) One live scene, URL follows the focused window

- How: a new `/os` shell renders the desktop and window frames. Only the focused window hosts the real `AppScene` output; unfocused windows show a static snapshot (a screenshot or a title card). Focusing a window does `router.actions.push(window.url)`; the one `sceneLogic` loads it. The shell would render `activeExportedScene` itself (reusing the body of `AppScene`, `frontend/src/scenes/App.tsx:173-208`) into the focused frame, instead of going through `Navigation`.
- Effort: about 1 to 2 days. Needs an OS host that stays mounted while the URL changes. The catch: `/os` is itself a route, so pushing `/project/1/feature_flags` swaps the scene away from the OS host. The shell must either live above the router (wrap `AppScene` when an `os` flag is set, not be a scene) or keep the URL on `/os` and carry window URLs in the hash. The first is cleaner: gate on a feature flag in `App.tsx` / `AuthenticatedShell.tsx` and replace `<Navigation>` with `<OsDesktop>`.
- What breaks: little inside scenes, because this is the app's native model. Side panel, breadcrumbs, `document.title` and shortcuts all follow the focused scene correctly. Unfocused windows are dead pictures, and switching focus reloads the scene (scroll and unsaved state are lost unless the scene persists them).
- What a viewer sees: real windows, but only one is live. Clicking another window flashes a spinner and swaps content. It reads as "tabs with window chrome", which undersells the concept.

### (b) Many mounted scenes with per-window routing

- How: per window, resolve `(url) -> [sceneId, params]` against `routes` (kea-router 3.4.1 depends on `url-pattern` ^1.0.3, so the same matcher is available), load `appScenes[sceneId]()`, and render `<BindLogic logic props={paramsToProps(params)}><Component {...params} /></BindLogic>` per window.
- Effort: the mechanism is a day; making it correct is weeks and touches shared code in many products. See section 3: `urlToAction` / `actionToUrl` are wired to the one global URL, and there is no per-window router.
- What breaks:
  - Two scenes whose logics use `urlToAction` both react to one address bar; a scene whose `actionToUrl` fires (tabs, filters, pagination) rewrites the URL and the other window's logic reacts to it. Scenes whose URL does not match their own route often reset or redirect.
  - Same scene type twice (two insights) shares keyed logic instances unless keys differ; many logics are unkeyed singletons.
  - `ScenePanel` portals into one slot; `breadcrumbsLogic`, `SceneTitleSection`, `titleAndIcon`, `document.title`, the side panel context, and the Max/PostHog AI scene context all read the one `sceneLogic`, so they describe whichever scene the URL names, not the window you are looking at.
  - `activeSceneId` access checks and `ProductEmptyStateGate` run per active scene only.
- What a viewer sees: at first glance the best demo (several live windows). In practice, clicking inside one window makes another reset, jump, or show the wrong title; bugs appear during a live demo. Workable only if the demo sticks to a handful of pre-tested read-only scenes (dashboards, a replay list, a flag list) and avoids in-scene navigation.

### (c) One iframe per window, chromeless mode

- How: `/os` renders the desktop, dock and window frames; each window is `<iframe src="/project/:id/<scene>">`. Detect the frame with `window.self !== window.top` rather than a query param, because a param is lost on the first in-frame navigation. Each iframe is a full copy of the app with its own kea store, router and `sceneLogic`, so every existing assumption holds inside the frame.
- Effort: about 1 day for a showable version.
  - Backend: `'self'` in DEBUG `frame-ancestors` (`posthog/middleware.py:1528`).
  - Frontend: chromeless `mode` branch in `navigationLogic.tsx:569-604`; a new OS scene; window manager state in a kea logic.
  - Optional polish: `postMessage` from frame to host for title and URL (so window title bars and a "deep link" per window work), and intercepting cross-app links to open a new window.
- What breaks:
  - Each window boots the whole app bundle and its boot requests (user, org, team, preflight, feature flags). On the Vite dev server (port 8234) the first load of each frame pulls the unbundled module graph, so opening 4 to 6 windows at once is slow; later loads hit the browser cache. A production build (`pnpm --filter=@posthog/frontend build`) behind Django is faster for the live demo. Memory use grows linearly.
  - Global UI is per frame: toasts, modals and the command palette appear inside the window that opened them, not over the desktop (arguably correct for an OS).
  - localStorage-persisted state (theme, zen, side panel) is shared across frames and can flip another window on reload.
  - Links inside a window navigate that window only; cross-app "open in new window" needs `postMessage` plumbing.
  - Keyboard shortcuts work only in the focused frame; the host cannot see them without forwarding.
  - Not shippable: the real product cannot run N copies of the SPA. This is a prototype-only seam.
- What a viewer sees: several real, fully interactive PostHog scenes side by side in draggable windows, each with correct titles, filters and navigation. This is the closest to posthog.com's feel with real data.

### (d) Standalone mock app

- How: a separate Vite app or Storybook story with fake content, or screenshots, in windows. The posthog.com repo already implements the window manager (`/home/coder/dev/posthog.com`), so the chrome can be copied.
- Effort: 0.5 to 2 days depending on fidelity; zero risk to the app.
- What breaks: nothing, because nothing is real. It proves the chrome, not the claim that PostHog scenes work as apps.
- What a viewer sees: polished, but static or fake content; the question "does the real product survive this?" stays open.

## 6. Recommendation

Build **(c)** for the throwaway prototype:

- It is the only seam that shows several real, working scenes at once without touching scene code in 77 products.
- Its failure modes (boot cost per window, per-frame toasts) are visible and honest; (b)'s failure modes are cross-window state corruption that shows up mid-demo.
- It isolates the OS work (window manager, dock, app store) from the scene internals, so the prototype's chrome can later be rehosted on (a) or a proper (b) if the concept survives.
- Use (a) as the fallback if the demo machine cannot afford several app instances, and (d) only for pure visual exploration.

Keep the verdict honest in the write-up: (c) proves the UX, not the architecture. A real build needs per-window routing (a window-scoped router and `sceneLogic`), which is the (b) cost.

### Files a (c) prototype touches or adds

Add:

- `frontend/src/scenes/os/OsScene.tsx` (desktop, dock, window frames), `frontend/src/scenes/os/osLogic.ts` (windows, focus, z-order, positions; persist to localStorage), `frontend/src/scenes/os/OsWindow.tsx` (drag, resize, iframe). For a product-shaped home, `hogli product:bootstrap os_shell` would put it under `products/os_shell/` with a manifest instead; for a throwaway branch the `scenes/os/` path avoids regenerating `products.tsx`.

Edit:

- `frontend/src/scenes/sceneTypes.ts:11` — add `Scene.Os`.
- `frontend/src/scenes/scenes.ts:41` — add `[Scene.Os]: { projectBased: true, name: 'PostHog OS', layout: 'plain' }`.
- `frontend/src/scenes/scenes.ts:744` — add `[urls.os()]: [Scene.Os, 'os']`.
- `frontend/src/scenes/urls.ts:36` — add `os: (): string => '/os'`.
- `frontend/src/scenes/appScenes.ts:6` — add `[Scene.Os]: () => import('./os/OsScene')`.
- `frontend/src/layout/navigation-3000/navigationLogic.tsx:569-604` — return `'none'` for `Scene.Os` (the host needs no app chrome; an authenticated `plain` scene otherwise gets `minimal`) and for framed windows (`window.self !== window.top` or `?os_window=1`).
- `posthog/middleware.py:1528` — `'self'` in `frame-ancestors` under DEBUG.

No Django route is needed: `re_path(r"^.*", home_with_region_redirect)` serves the SPA for any path (`posthog/urls.py:396`), and `/os` becomes `/project/:id/os` through `addProjectIdIfMissing` (`frontend/src/lib/utils/kea-router.ts:134-138`).

### Is a flagged `/os` route easy?

Yes, about five small edits (listed above) plus a flag check.
There is no route-level flag gate: `SceneConfig`, `SceneExport`, `urls` and `openScene` have no flag field (`frontend/src/scenes/sceneTypes.ts:260-349`, `frontend/src/scenes/sceneLogic.tsx:836-931`). Manifest `flag:` entries only hide nav items (`frontend/src/layout/panel-layout/navbar/tabs/flat-nav/flatNavLogic.ts:67`). The house pattern is to gate inside the scene: add a key to `FEATURE_FLAGS` (`frontend/src/lib/constants.tsx:160-165`) and return `<NotFound object="page" />` when it is off (as in `frontend/src/scenes/web-analytics/recap/WebAnalyticsRecapScene.tsx:212-213`), or wrap in `<FlaggedFeature>` (`frontend/src/lib/components/FlaggedFeature.tsx:17`). The shell already gates whole surfaces inline with a flag (`frontend/src/scenes/AuthenticatedShell.tsx:48`). Locally the flag must exist and be enabled in the dev project, or the check can simply be skipped on the throwaway branch.

## 7. Running the local app with demo data

Documented only; the stack was not started for this research.

Start the stack:

- `bin/hogli` wraps hogli; commands live in `hogli.yaml` at the repo root. `hogli start` runs `bin/start` under phrocs; `hogli up` is an alias; `hogli wait` runs `phrocs wait`; `hogli down` / `hogli stop` run `phrocs stop` and leave Docker services up (`hogli.yaml:341-374`).
- Recommended sequence (`.agents/skills/run-posthog/SKILL.md:24-40`): `hogli dev:setup` (first time), `hogli up -d -y`, `hogli services:ready -y`, `hogli wait -y`. Stop with `hogli down -y`. First boot takes 60 to 90 s.
- Browse `http://localhost:8010` (Caddy proxy to Django on 8000; Vite dev server on 8234 serves assets, and browsing `:8234/` directly returns 404) (`.agents/skills/run-posthog/SKILL.md:48-52`, `:133`).
- Readiness: `curl -sf localhost:8010/_health` returns 200 and `/api/projects/@current` returns `not_authenticated` (`SKILL.md:48-52`). HogQL-backed scenes (insights, dashboards, web analytics) also need the `migrate-clickhouse` unit to finish; it can crash on a cold start (`SKILL.md:56-58`).
- Only one worktree can hold ports 8000/8010/8234 at a time; Docker containers are shared (`SKILL.md:134`).
- From a non-interactive agent shell, start the stack through flox, `flox activate -- bash -c 'hogli up -d'`. Without it the detached phrocs daemon lacks `LD_AUDIT=ld-floxlib.so` and the nodejs/ingestion units fail to load native libraries.
- Another worktree's stack may already hold the ports. Check with `hogli` / `phrocs` before starting a stack, and do not stop someone else's stack without asking.

Demo data:

- Big realistic dataset: `hogli dev:demo-data` runs `python manage.py generate_demo_data` (`hogli.yaml:264-269`). Defaults: `--email test@posthog.com`, `--password 12345678`, `--product hedgebox` (or `spikegpt`), `--n-clusters 500`, `--days-past 120` (`posthog/management/commands/generate_demo_data.py:48-131`). It refuses to run with pending migrations; if the email exists it creates `test+N@posthog.com` instead; it prints a login link to `http://localhost:8010/login?email=...`. The Hedgebox matrix seeds actions, a cohort, dashboards (Key metrics, Revenue, Website), insights, flags, experiments and event schemas (`products/demo/backend/logic/products/hedgebox/matrix.py`). Takes 5 to 30 minutes at 500 clusters; pass `--n-clusters 50` for a faster, still convincing desktop.
- Fast workspace (seconds): `POST /api/setup_test/organization_with_team/` with `{"data": {"skip_onboarding": true}}` from inside the page (DEBUG only), then `POST /api/login/` with the returned email and password `12345678` (`.agents/skills/run-posthog/SKILL.md:69-104`, `posthog/api/playwright_setup.py`). Only 3 Hedgebox clusters, so charts are thin.
- Destructive reset: `hogli dev:reset` wipes volumes, migrates, and reseeds demo data (`hogli.yaml:300-316`).
- Handbook reference for the default creds: `docs/published/handbook/engineering/manual-dev-setup.md:289-291`.
- For the demo, open `/project/<team_id>/os` after login. `generate_demo_data` sets the team's project token to `phc_localposthogprojecttoken` in DEBUG (`generate_demo_data.py:41`, `:204`).
