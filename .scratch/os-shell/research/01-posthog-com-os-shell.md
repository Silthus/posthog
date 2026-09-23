# Research 01: how posthog.com builds its OS shell, and what we can lift

Question: how does posthog.com implement its desktop, windows, menu bar, wallpapers and theming, which files can be ported into the PostHog app for a prototype, what do they depend on, and what does the license allow?

Primary source: `PostHog/posthog.com` at commit `b92e7cae3983fe0a6a3a60652007f745ce766e20` (2026-09-23), cloned sparse and blobless to `/home/coder/dev/posthog.com` (code files only, no images, no `static/`).
Older revisions were read through the GitHub contents API and cached in `/tmp/phcom-old/` (not durable).
All paths below are relative to the posthog.com repo root unless they start with `frontend/` or `common/`, which are this repo.

## TL;DR

- The shell is one big React context (`src/context/App.tsx`, 3163 lines) plus a per-window context (`src/context/Window.tsx`, 231 lines), mounted around every Gatsby page by `wrapPageElement` in `gatsby-browser.tsx`.
  Every route change hands the new page element to the provider, which turns it into a window object.
- **Current HEAD no longer has draggable or resizable windows.**
  PR #18236 ("couple small changes", merged 2026-07-16) removed the `motion.div` drag wrapper and the resize handles from `src/components/AppWindow/index.tsx`.
  Today a window is a flex-centered `div` that is either "windowed" (80% × 95%), expanded (full size), or snapped left/right (50/50), with CSS keyframe pop-in/out.
  The drag, resize and snap-indicator code is still in the file but is dead.
- The last free-floating, draggable version is at commit `ad4eafb7a8` (2026-03-10): `src/components/AppWindow/index.tsx` at 1033 lines, `src/context/App.tsx` at 2496 lines.
  That revision is the right donor if the prototype wants real window management.
- Stack: React 18, Gatsby 4.25.9, Tailwind 3.4 (JS config), `framer-motion` ^10.18, the umbrella `radix-ui` ^1.1.3 package, `@posthog/icons`, `@posthog/brand` fonts, `qs`.
  No `react-rnd`, `react-draggable`, `re-resizable`, hotkey library, or window-manager library.
  Window drag and resize were hand-built on framer-motion `drag`, and shortcuts are one hand-written `keydown` listener.
- Gatsby coupling is thin and mechanical: `navigate` from `gatsby`, `Link` from `gatsby`, `useLocation` from `@reach/router`, and the `wrapPageElement` entry.
  Heavier coupling is to posthog.com's own product code (Squeak community auth, `navs/index.js` at 8755 lines, Cloudinary images, the marketing templates).
- **License: posthog.com's source code is not open source.**
  `LICENSE` says, for everything outside `/contents/`: "Please do not duplicate, copy, or use our website for commercial or non-commercial use."
  Only `/contents/` (the Markdown docs) is MIT.
  PostHog Inc. holds the copyright on both repos, but copying the shell into this public MIT repo would republish it under MIT, so it needs an explicit sign-off from the website owners first.
  A throwaway local prototype that is never pushed does not have that problem.

## 1. Component tree

```text
gatsby-browser.tsx / gatsby-ssr.js
  wrapRootElement: ToastProvider > UserProvider > kea wrapElement          (gatsby-browser.tsx:16-20)
  wrapPageElement: <AppProvider element={page} location>                    (gatsby-browser.tsx:51-60)
                     <Wrapper/> (or <KoreanWrapper/> for /ko)
Wrapper                                   src/components/Wrapper/index.tsx (47)
  AppContainer  #app-container, data-scheme=primary,
                data-window-expanded / -snapped-left / -snapped-right       src/components/AppContainer/index.tsx (27)
    TaskBarMenu  (top menu bar, #taskbar)                                   src/components/TaskBarMenu/index.tsx (432)
      MenuBar menus={useMenuData()}                                         src/components/RadixUI/MenuBar.tsx (490), TaskBarMenu/menuData.tsx (900)
      "Open PostHog" / "Get started" OSButton, search, Ask Max, account MenuBar
      ActiveWindowsPanel (side panel listing windows, share-desktop URL)   src/components/ActiveWindowsPanel/index.tsx (152)
    div[data-app=DesktopViewport] ref=constraintsRef
      Desktop                                                               src/components/Desktop/index.tsx (341)
        ContextMenu (right-click desktop: About, Display options)          src/components/RadixUI/ContextMenu.tsx (78)
        Wallpapers                                                          src/components/Desktop/Wallpapers.tsx (190)
        icon columns: DesktopIcon > ZoomHover > AppLink > GlassIcon        Desktop/DesktopIcon.tsx (17), OSIcons/AppIcon.tsx (491), OSIcons/GlassIcon.tsx (274), OSIcons/glyphs.ts (181)
        Screensaver, HedgehogMode, NotificationsPanel, ReactConfetti
      WindowList (memoized, maps windows -> AppWindow)                     Wrapper/index.tsx:15-25
        AppWindow  (chrome + WindowProvider + Router)                       src/components/AppWindow/index.tsx (843)
          Router: picks template (Inbox, Handbook, BlogPost, Legal) or renders the page element
    SearchOverlay, ChatOverlay, WebMCP, CookieBannerToast
```

- There is no bottom taskbar or dock.
  `Wrapper/index.tsx:39-41` keeps a commented-out `<Dock />`.
  The top bar is called "taskbar" in code (`id="taskbar"`, `TaskBarMenu/index.tsx:308`).
- The Korean site (`/ko`) has its own shell copy under `src/components/Korean/` (KoreanWrapper 103, KoreanDesktop 532, KoreanTaskBarMenu 467 lines).
  It still has **draggable desktop icons** with positions saved to `localStorage` (`Korean/KoreanDesktop/DraggableDesktopIcon.tsx`, 107 lines, framer-motion `drag`; `KoreanDesktop/index.tsx:199-318`) and a `data-active-windows` taskbar button.
  It is a useful donor for icon dragging.

## 2. Window state store (`src/context/App.tsx`)

- `AppWindow` type (`src/context/Window.tsx:6-70`): `element`, `key`, `path`, `zIndex`, `minimized`, `size`, `previousSize`, `position`, `previousPosition`, `sizeConstraints {min,max}`, `fixedSize`, `fromOrigin` (for the zoom-from-click animation), `appSettings`, `location`, `modal`, `expanded`, `snapped: 'left'|'right'|false`, `windowed`, `meta.title`, `ref`.
- State is a single `useState<AppWindow[]>` (`App.tsx:1735-1745`).
  Focus is derived, not stored: the focused window is the one with the highest `zIndex` (`App.tsx:1754-1759`).
- The provider value is split into five contexts so consumers re-render less (`App.tsx:161-228`, hooks at 3127-3161):
  `useApp` (everything), `useAppActions` (stable callbacks through a `latestActionsRef`, 2939-3018), `useAppSettings` (siteSettings, compact, isMobile, menu), `useAppUIState` (panels, search, chat, screensaver), `useAppWindows` (the list).
- Actions (all in `App.tsx`):
  - `bringToFront` (1902-1925): sets the target's `zIndex` to `windows.length` and shifts higher ones down by one; also un-minimizes.
  - `closeWindow` (1881-1900): filters the window out, then `navigate()`s to the next-highest window's path, or to `/` with `skipPageUpdate`.
  - `minimizeWindow` (1967-1969): sets `minimized: true`.
  - `expandWindow` (2430-2461), `handleSnapToSide` (2395-2428, uses `getSnapDimensions` 2381-2393), `updateWindow` (2288-2328, shallow merges position/size/flags).
  - `createNewWindow` (2118-2212): computes size from the per-route registry, position from `getPositionDefaults` (cascade +10px from the previous window, recentre when more than 2/3 lands right of the midpoint, 1991-2040), and `fromOrigin` from the last clicked element's rect (captured by a global `click` listener, 2525-2542).
- Persistence and sharing: `desktopParams` (1798-1829) serialises all open windows (path, position and size in viewport percentages, zIndex) into a `?windows[...]` query string with `qs`.
  Loading such a URL replays the windows one by one through `navigate` state `savedWindows` (2838-2901).
  `Shift+C` copies that link.
  Window layout is not saved to `localStorage`; only `siteSettings` is.

## 3. App/window registry and route-to-window mapping

- The registry is `const appSettings: AppSettings` in `App.tsx:510-1663`, keyed mostly by route path (67 entries, 47 of them paths starting with `/`, the rest keys such as `ask-max`; for example `'/'` at 511, `'/display-options'` at 1015).
  Each entry (`AppSetting`, 478-504) can set `size {min,max,fixed,autoHeight}`, `position {center, topCenter, getPositionDefaults}`, `modal {type}`, `closeOnEscape`, `toolbar`, `hideTitle`, and an `experiment {flag, variant}` that swaps the key by feature flag (`getKey`, 2105-2116).
- Mapping: Gatsby renders the page for the URL; `wrapPageElement` passes that element to the provider; an effect on `[element]` calls `updatePages(element)` (2506-2514).
  `updatePages` (2214-2278, HEAD):
  - If a window with the same `path` exists, bring it to front.
  - If `location.state.sideBySide` is set, snap the focused window to one side and open the new one on the other.
  - `appSettings[path].size.fixed` windows are modal-like and stack on top.
  - Otherwise **replace the focused window's content in place** (`replaceFocusedWindow`, 1927-1961).
- In the March 2026 draggable version, `updatePages` also honoured `location.state.newWindow` / `element.props.newWindow` by appending a new window instead of replacing (`/tmp/phcom-old/App.mar.tsx:1692-1712`).
  In HEAD `newWindow` is still passed by links (`src/components/Link/index.tsx:40,139`) but no longer creates a window.
- Non-route windows are created by passing a synthetic element with a fake `location.pathname` and `key` to `addWindow`, for example `openSignIn` → `<SignIn location={{ pathname: 'community-auth-signin' }} key="community-auth-signin" newWindow />` (2335-2344).
- Per-window browser history: each `AppWindow` keeps its own `history[]` and index; back and forward call `navigate(path, { state: { fromHistory: true } })` (`AppWindow/index.tsx:440-471`).
- Window title comes from the page's `<SEO>` component, which calls `setWindowTitle(appWindow, seo.title)` (`src/components/seo.tsx:47-75`).

## 4. Window chrome and behaviours (`src/components/AppWindow/index.tsx`)

### HEAD (843 lines): website-style windows

- Renders a plain `div[data-app=AppWindow]` with `data-path`, `data-expanded`, `data-windowed`, `data-snapped`, `data-focused`, `data-scheme="tertiary"` (681-750).
- Sizing is CSS, not coordinates: `h-[95%] w-[80%]` when windowed, `size-full` otherwise, inside `WindowList`'s `flex justify-center items-center` (`Wrapper/index.tsx:21`; `AppWindow/index.tsx:705-730`).
  `global.css:2981-3037` handles mobile (always full screen), expanded, snapped corner rounding, and a 1200px max width for `/` and `/pricing`.
- Chrome is only two buttons at the top right, at 40% opacity: expand/restore (`Shift+↑`) and close (`Shift+W`) (755-810).
  This matches the reference screenshot.
- `fixed` windows render as centred modals with a `bg-black/50` backdrop and slide-down/up animations (671-679, 705-716).
- Open and close are CSS keyframes `animate-window-pop-in` / `-pop-out` (`src/styles/global.css:2338-2400`); `onAnimationEnd` calls `closeWindow` (682-690).
- Dead code still present: `handleDrag`, `handleDragEnd`, `handleDragResize`, `SnapIndicator`, `handleMinimize` (107-133, 258-425; none are attached to any element).
  `minimized` has no visual effect in HEAD.

### `ad4eafb7a8` (1033 lines, 2026-03-10): real window manager

- The window is a `motion.div` positioned `absolute` with `style={{ zIndex }}`.
  `initial` / `animate` / `exit` drive x, y, width, height and scale (`/tmp/phcom-old/AppWindow.mar.tsx:607-721`).
  - Open: scale 0.08 → 1 from `fromOrigin` (the clicked icon), 0.2s, ease `[0.2, 0.2, 0.8, 1]`.
  - Minimize and close: exit to scale 0.005 towards the taskbar's active-windows button (`getActiveWindowsButtonPosition`).
- Drag: `drag`, `dragControls={controls}`, `dragListener={false}`, `dragMomentum={false}`, `dragConstraints={constraintsRef}` (714-721).
  Only the title bar starts a drag, through `onPointerDown={(e) => controls.start(e)}` (733).
- Snap: while dragging, if `x < -50` or past the right edge by 50px, a translucent blue `SnapIndicator` shows; on drag end `handleSnapToSide` sets half-screen size and position (`AppWindow/index.tsx:380-400` in HEAD, same logic in March).
- Resize: five invisible `motion.div` handles with `drag="x"`, `drag="y"` or `drag`, all `dragConstraints={0}` and `!transform-none`, so the handle stays put and only `info.delta` is read: right, left (also moves x), bottom, bottom-right, bottom-left (955-1023).
  `handleDragResize` clamps to `sizeConstraints.min`.
- Title bar (728-955): a document-icon `MenuBar` (file menu with Close), back/forward, a title `Popover` with a `FileMenu` column browser of the section nav, minimize, a maximize button whose tooltip menu offers snap left/right/maximize, and close.
  Double-click on the bar resizes to max size (`handleDoubleClick`).
- A `siteSettings.experience: 'posthog' | 'boring'` switch (`App.mar.tsx:1227-1277`) turned all of this off ("website mode", PR #13055).
  HEAD is the result of making "boring" the only mode.

## 5. Keyboard shortcuts

A single `document` `keydown` listener in `App.tsx:2544-2745`, skipped when focus is in an `INPUT`, a `TEXTAREA`, a shadow root, or `.mdxeditor`:

| Key                   | Action                                                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `/`, `Cmd/Ctrl+K`     | open search                                                                                                                  |
| `?`                   | open the AI chat                                                                                                             |
| `,`                   | open `/display-options`                                                                                                      |
| `m`                   | cycle color mode system → light → dark                                                                                       |
| `\`                   | cycle wallpaper                                                                                                              |
| `Shift+←` / `Shift+→` | snap focused window left/right                                                                                               |
| `Shift+↑`             | expand / restore                                                                                                             |
| `Shift+↓`             | minimize                                                                                                                     |
| `Shift+W`             | close focused (dispatches a `windowClose` CustomEvent so the window runs its close animation, `AppWindow/index.tsx:515-524`) |
| `Shift+X`             | close all (animated)                                                                                                         |
| `Shift+Z`             | screensaver                                                                                                                  |
| `Shift+<`             | active windows panel                                                                                                         |
| `Shift+>`             | cycle to next window                                                                                                         |
| `Shift+C`             | copy shareable desktop URL                                                                                                   |

Plus per-window `Escape` for windows with `closeOnEscape` (`AppWindow/index.tsx:526-536`).
Bare single-letter shortcuts (`m`, `,`, `\`) would clash with PostHog app shortcuts and need rethinking.

## 6. Theming

- **Color tokens are CSS variables scoped by two axes**: the `light`/`dark` class on `<body>` and a `[data-scheme='primary'|'secondary'|'tertiary']` attribute on any container (`src/styles/global.css:177-458`, inside `@layer utilities`).
  Variables: `--bg --accent --border --input-bg --input-bg-hover --input-border --input-border-hover --text-primary --text-secondary --text-muted`, as space-separated RGB triplets.
  Sample: `.light [data-scheme='primary'] { --bg: 253 253 248; --accent: 229 231 224; --border: 191 193 183; --text-primary: 17 17 17 }` (line 178); `.dark [data-scheme='primary'] { --bg: 30 31 35; --accent: 45 46 55; --border: 62 66 79; --text-primary: 250 250 250 }` (line 353).
  The desktop is `primary`, windows are `tertiary`, the taskbar right side is `secondary`.
- `tailwind.config.js` (536 lines, Tailwind 3.4, `darkMode: 'class'`) maps these to utilities as `rgb(var(--x) / <alpha-value>)`: `bg-primary`, `bg-accent`, `bg-input`, `border-primary`, `border-secondary`, `text-primary|secondary|muted`, `fill-*`, `stroke-*` (lines 50-229).
  About 60 static brand colors (`red #F54E00`, `yellow #F7A501`, `blue #2F80FA`, …, lines 137-197), a `light-1…12` scale (124-135), and screens `2xs 425px` … `2xl 1536px` plus `reasonable: (min-height: 640px)` (10-35).
- Custom variants plugin (`tailwind.config.js:522-534`): `skin-modern`, `skin-classic`, `wallpaper-keyboard-garden|hogzilla|office-party|startup-monopoly` (all `body[data-…="…"] &`), and `reduce-transparency` (`body[data-reduce-transparency="true"] &` or `prefers-reduced-transparency`).
  Plugins: forms, typography, container-queries, `tailwindcss-animated`, `@headlessui/tailwindcss`.
- Frosted glass surfaces are string constants in `src/constants/frostedSurfaces.ts`: `WINDOW_BG = 'bg-primary/75 backdrop-blur-3xl transform-gpu reduce-transparency:!bg-primary …'`, `TASKBAR_BG = 'bg-primary/50 backdrop-blur-3xl transform-gpu'`, `MOTION_LAYER` for `will-change`.
- Light/dark boot: `gatsby-ssr.js:36-43` injects `/scripts/theme-init.js` (in `static/`, 50 lines) before the body renders.
  It sets `document.body.className` to the theme, reads `localStorage.theme` and `localStorage.siteSettings`, sets `data-skin`, `data-wallpaper`, `data-reduce-transparency`, and defines `window.__setPreferredTheme(mode)`, which resolves `system` through `matchMedia`.
  After hydration `App.tsx:2747-2758` keeps those body attributes in sync with `siteSettings`.
- `SiteSettings` (`App.tsx:1665-1676`): `colorMode`, `theme`, `skinMode` (classic retired, forced to modern), `cursor` (`default|xl|james`, custom cursors injected as a `<style>`, 248-329), `wallpaper`, `screensaverDisabled`, `reduceTransparency`, `clickBehavior`, `performanceBoost`, `scrollbars`.
  Persisted as JSON in `localStorage.siteSettings` (2463-2470).
- Wallpapers (`src/components/Desktop/Wallpapers.tsx`, 190 lines): four React scene components (`Hogzilla`, `StartupMonopoly`, `OfficeParty`, `KeyboardGarden`) built from Cloudinary image URLs and CSS gradients.
  Each renders a light and a dark layer crossfaded by `dark:opacity-0 transition-opacity duration-700`.
  All four are always mounted and shown or hidden by the `wallpaper-*:block` variants (156-189).
  `WALLPAPER_GLOW` sets the per-wallpaper icon hover glow (163-178).
  The picker metadata and thumbnails are in `src/hooks/useTheme.tsx:15-60`; the picker UI is the "Display options" page `src/pages/display-options.tsx` (348 lines).
  The reference screenshot shows `keyboard-garden`.
- Fonts: body uses `font-rounded` = `RoundHog`, loaded with `@font-face` from `@posthog/brand/fonts/RoundHog*.woff2` (`src/components/Layout/Fonts.css:23-89`).
  Menus and buttons use IBM Plex Sans Variable from `@fontsource-variable/ibm-plex-sans` (`gatsby-browser.tsx:3-4`).
  Squeak, Fairytale and Charter are decorative extras.
  `@posthog/brand` is already a dependency of this repo (`frontend/package.json:77`, catalog `0.11.0` in `pnpm-workspace.yaml:153`).

## 7. Animations

- HEAD: window open/close are CSS keyframes in `global.css` (`windowPopIn` scale 0.92 → 1 over 0.2s with overshoot, `windowPopOut` 0.15s, slide-down/up for fixed windows, overlay fades; lines 2301-2400).
- March 2026: framer-motion `initial/animate/exit` on the window itself (section 4), `AnimatePresence` around each window (`WindowContainer`, `onExitComplete` → `closeWindow`).
- The taskbar has a 3D-box rotation effect (`TaskBarMenu/index.tsx:310-338`, `transformStyle: preserve-3d`, pseudo top and bottom faces).
- Desktop icons: `ZoomHover` (34 lines) moves the icon by half a pixel on hover and press; `GlassIcon` does a frosted glass SVG with a hover glow.
- `siteSettings.performanceBoost` zeroes animation durations; windows measure their open animation and log `animation_performance_reduced` when it takes more than 700ms (`AppWindow/index.tsx:604-620`).
- Gap: `RadixUI/Popover.tsx:64` and `RadixUI/Tooltip.tsx:42` use `animate-slideUpAndFade` and similar classes that are defined nowhere, so they do nothing.

## 8. How content renders inside a window

- A window renders `<Router {...item.props}>{item.element}</Router>` inside `div[data-app=AppWindowContent]` (`AppWindow/index.tsx:813-838`).
  `item.element` is the Gatsby page element itself, so any React tree can be a window.
- `Router` (62-89) special-cases `/questions`, handbook/docs, blog posts and legal pages into templates, and wraps `modal` windows in a Radix `Dialog` or a `FloatingModal`.
- Pages then use one of the in-window layout components, which is where the "app" look comes from:
  - `ReaderView` (1919 lines; docs-style reader with sidebar and TOC; heavy Gatsby, MDX, `@reach/router`)
  - `Explorer` (253; product explorer)
  - `Editor` (630; document-editor look with toolbar, no Gatsby imports)
  - `OSChrome/HeaderBar.tsx` (431; back/forward, search, TOC toggle; uses `useApp` and `useWindow`)
  - `RadixUI/ScrollArea.tsx` (129)
  - `WindowTabs` (5)
- The window provides `useWindow()` with `appWindow`, history (`goBack`, `goForward`), `menu`, `internalMenu`, `activeInternalMenu`, `parent` (the top-level nav section this path belongs to, resolved from `navs/index.js`), `dragControls`, `pageOptions` (`AppWindow/index.tsx:213-235, 650-672`).
- Containers use Tailwind container queries (`@container` on the window, `AppWindow/index.tsx:705`), so content responds to window width rather than viewport width.
  This lines up with this repo's "break on container queries" rule.

## 9. Liftable pieces: size, dependencies, coupling

Gatsby = imports from `gatsby`, `@reach/router`, `gatsby-plugin-*`, or `graphql`.
"Internal" = other posthog.com modules the file pulls in.

| File                                                                                    | Lines                                                | npm deps                                      | Gatsby                           | Internal coupling                                                                                | Port effort                                                                                                                                                   |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/context/Window.tsx`                                                                | 231                                                  | react                                         | none                             | types from App, MenuBar, PostLayout                                                              | trivial                                                                                                                                                       |
| `src/context/Toast.tsx`                                                                 | 56                                                   | react                                         | none                             | none                                                                                             | trivial                                                                                                                                                       |
| `src/components/Wrapper/index.tsx`                                                      | 47                                                   | react                                         | none                             | Search, Chat, WebMCP, CookieBanner (drop)                                                        | trivial                                                                                                                                                       |
| `src/components/AppContainer/index.tsx`                                                 | 27                                                   | react                                         | none                             | `useWindowLayoutAttributes` (15)                                                                 | trivial                                                                                                                                                       |
| `src/context/App.tsx`                                                                   | 3163 (2496 in `ad4eafb7a8`)                          | react, `qs`, `@posthog/icons`                 | `navigate` (about 15 call sites) | Squeak auth, Start, ContactSales, `navs/*`, `useUser`, `usePostHog`, `useTheme`                  | **rewrite**: keep window reducer, positioning, snapping, shortcuts (about 900 lines); drop the 1150-line `appSettings` registry contents, auth, chat, cursors |
| `src/components/AppWindow/index.tsx`                                                    | 843 (1033 in `ad4eafb7a8`)                           | `framer-motion`, `radix-ui`, `@posthog/icons` | `Link`, `navigate`               | Inbox, Handbook, BlogPost, Legal, Squeak, FileMenu, MenuBar, OSButton, Tooltip, KeyboardShortcut | medium: copy the `ad4eafb7a8` version, strip `Router` templates and the page-options AI menu                                                                  |
| `src/components/Desktop/index.tsx`                                                      | 341                                                  | react, `react-confetti`                       | `navigate` (unused)              | OSIcons, Screensaver, HedgehogMode, NotificationsPanel, ContextMenu                              | easy: keep icons, wallpaper, context menu                                                                                                                     |
| `src/components/Desktop/Wallpapers.tsx`                                                 | 190                                                  | react                                         | none                             | CloudinaryImage                                                                                  | easy, but the images are hosted on posthog.com's Cloudinary                                                                                                   |
| `src/components/Desktop/DesktopIcon.tsx`, `ZoomHover`                                   | 17 + 34                                              | react                                         | none                             | AppLink                                                                                          | trivial                                                                                                                                                       |
| `src/components/OSIcons/GlassIcon.tsx`, `glyphs.ts`                                     | 274 + 181                                            | react                                         | none                             | none                                                                                             | trivial, self-contained SVG                                                                                                                                   |
| `src/components/OSIcons/AppIcon.tsx`                                                    | 491                                                  | react                                         | through `Link`                   | `useTheme`, `useAppSettings`, `usePostHog`                                                       | easy: swap `Link`                                                                                                                                             |
| `src/components/TaskBarMenu/index.tsx`                                                  | 432                                                  | `@posthog/icons`                              | none directly                    | `useUser`, Squeak avatar, MediaUploadModal, `menuData`                                           | medium: keep the bar, write our own menus                                                                                                                     |
| `src/components/TaskBarMenu/menuData.tsx`                                               | 900                                                  | `@posthog/icons`, `@posthog/brand`            | `navigate`                       | products and docs data hooks                                                                     | **do not port**: replace with PostHog app nav data                                                                                                            |
| `src/components/RadixUI/MenuBar.tsx`                                                    | 490                                                  | `radix-ui`, `@posthog/icons`                  | through `Link`                   | ScrollArea, KeyboardShortcut, `useAppSettings`                                                   | easy                                                                                                                                                          |
| `src/components/RadixUI/{ContextMenu,Tooltip,Popover,ScrollArea,ToggleGroup,Modal}.tsx` | 78 / 61 / 95 / 129 / 71 / 68                         | `radix-ui`, `clsx`, `tailwind-merge`          | none                             | ScrollArea reads `useAppSettings`                                                                | trivial                                                                                                                                                       |
| `src/components/OSButton/index.tsx`                                                     | 303                                                  | `@posthog/icons`                              | through `Link`                   | none else                                                                                        | easy                                                                                                                                                          |
| `src/components/KeyboardShortcut/index.tsx`                                             | 27                                                   | none                                          | none                             | none                                                                                             | trivial                                                                                                                                                       |
| `src/components/ActiveWindowsPanel/index.tsx`                                           | 152                                                  | `@posthog/icons`                              | `navigate`                       | SidePanel, ScrollArea, OSButton                                                                  | easy                                                                                                                                                          |
| `src/components/Link/index.tsx`                                                         | 307                                                  | `@posthog/icons`                              | `GatsbyLink`                     | `useWindow`, `useAppSettings`, ContextMenu                                                       | replace with a kea-router link that adds the "open side by side" context menu                                                                                 |
| `src/constants/frostedSurfaces.ts`                                                      | 17                                                   | none                                          | none                             | none                                                                                             | trivial                                                                                                                                                       |
| `src/styles/global.css` (theme and window parts)                                        | lines 177-494, 603-720, 2301-2400, 2975-3037 of 3279 | Tailwind 3 `@apply`, nesting                  | none                             | none                                                                                             | medium: translate to Tailwind 4                                                                                                                               |
| `tailwind.config.js` (tokens, variants)                                                 | 536                                                  | Tailwind 3 plugins                            | none                             | none                                                                                             | medium: translate to Tailwind 4 `@theme` and `@custom-variant`                                                                                                |
| `src/components/ReaderView`, `Explorer`, `seo.tsx`, `navs/index.js`                     | 1919 / 253 / 222 / 8755                              | MDX, `@reach/router`, `react-helmet`          | heavy                            | heavy                                                                                            | **do not port**: marketing-content specific                                                                                                                   |

## 10. License

- `LICENSE` in posthog.com, verbatim for the code part:
  "# For all content except the /contents/ folder — Copyright (c) 2020-2025 PostHog Inc. Please do not duplicate, copy, or use our website for commercial or non-commercial use. We put have put a lot of effort into a unique design, so we'd be sad if it became non-unique!"
  Logo use is allowed only for referencing PostHog.
- `/contents/` (Markdown docs and handbook) is MIT.
- This repo (`PostHog/posthog`) is MIT outside `ee/` (`LICENSE`, `package.json:9`).
- What this means:
  - No permissive grant covers the shell code, design, icons or wallpapers.
  - Both repos belong to PostHog Inc., so the company can reuse its own code, but a copy pushed here becomes publicly available under MIT.
  - Before any posthog.com file lands in a pushed branch, get an explicit OK from the posthog.com owners, and record it in the PR.
  - Wallpaper and icon images are fetched from `res.cloudinary.com/dmukukwp6/...`.
    Hot-linking them from the app ties the product to the website's asset host; copying them has the same license question as the code.
  - `@posthog/icons` is MIT on npm.
    `@posthog/brand` (RoundHog fonts) declares "SEE LICENSE IN LICENSE"; it is already a dependency of this repo.

## 11. Port plan: minimal look-alike shell in the PostHog app

Target: this repo's frontend, which is React 18.3, Vite, **Tailwind 4.3** (CSS-first, entry at `common/tailwind/tailwind.css`), `motion` ^12 (the renamed framer-motion, same `drag` API from `motion/react`), kea and kea-router, and individual `@radix-ui/*` packages but not the umbrella `radix-ui` (`frontend/package.json:83,163-173,236,241,263,271,362`).

### Files to copy (about 2,700 lines before trimming)

1. `src/context/Window.tsx` → trim to `appWindow`, `goBack`, `goForward`, `dragControls`.
2. `src/context/App.tsx` at `ad4eafb7a8` → cut down to about 900 lines:
   - window reducer (`bringToFront`, `closeWindow`, `minimizeWindow`, `updateWindow`, `expandWindow`, `handleSnapToSide`, `createNewWindow`, `getPositionDefaults`, `getSnapDimensions`)
   - `siteSettings` and `localStorage`
   - the `keydown` shortcuts
   - `desktopParams`
   - replace `navigate` with kea-router `router.actions.push`
   - replace the `appSettings` registry with a small per-scene map
3. `src/components/AppWindow/index.tsx` at `ad4eafb7a8` → drop `Router` templates, AI page options, `FileMenu`; keep the `motion.div` drag, 5 resize handles, snap indicator, title bar (back, forward, title, minimize, maximize, close).
4. `src/components/Wrapper/index.tsx` and `src/components/AppContainer/index.tsx`, as the shell root.
5. `src/components/Desktop/index.tsx`, `Desktop/DesktopIcon.tsx`, `Desktop/Wallpapers.tsx` (one wallpaper to start), `ZoomHover`, `OSIcons/GlassIcon.tsx`, `OSIcons/glyphs.ts`, `OSIcons/AppIcon.tsx` (only `AppLink`).
6. `src/components/TaskBarMenu/index.tsx` with our own menu data, plus `src/components/RadixUI/MenuBar.tsx`, `ContextMenu.tsx`, `Tooltip.tsx`, `ScrollArea.tsx`, `OSButton/index.tsx`, `KeyboardShortcut/index.tsx`, `ActiveWindowsPanel/index.tsx`.
7. `src/constants/frostedSurfaces.ts`.
8. CSS: the scheme variable blocks (`global.css:177-494`), window keyframes (2301-2400), window layout rules (2975-3037), scrollbar styling (603-720), rewritten for Tailwind 4:
   - color tokens → `@theme` entries that read the RGB variables
   - `skin-*`, `wallpaper-*`, `reduce-transparency` → `@custom-variant`
   - container queries are native in Tailwind 4, so drop the plugin
9. Fonts: `@font-face` for RoundHog from `@posthog/brand` (already installed) and IBM Plex Sans (`@fontsource-variable/ibm-plex-sans`, new dependency).

### New dependencies

`radix-ui` (or `@radix-ui/react-menubar`, `-tooltip`, `-scroll-area`, `-context-menu`), `qs` (not in `frontend/package.json` today; `URLSearchParams` would also do), `@fontsource-variable/ibm-plex-sans`.
Change `framer-motion` imports to `motion/react`.

### Gaps and risks

- **Routing seam.** posthog.com gets one page element per URL from Gatsby.
  This app renders exactly one active scene: `frontend/src/scenes/App.tsx:137-204` reads `activeSceneId`, `activeExportedScene`, `activeSceneComponentParams`, `activeSceneLogicProps` from `sceneLogic` and wraps the component in `BindLogic`.
  Scene tabs already exist as `SceneTab` in `frontend/src/scenes/sceneLogic.tsx`.
  A window per scene means mounting several scenes at once, each with its own `BindLogic` props.
  Scene logics that use `urlToAction` or read the global URL will fight each other.
  The prototype should start with "one live window plus snapshots" or "windows = scene tabs, only the focused one live".
- **Drag and resize are gone from upstream HEAD.** The donor is `ad4eafb7a8`, so any later upstream fixes do not apply; no tests cover the shell.
- **Tailwind 3 → 4.** `@apply` inside nested selectors, the JS plugin variants, and `rgb(var(--x) / <alpha-value>)` tokens all need rewriting.
  The class names `bg-primary`, `text-primary`, `border-primary` may collide with existing tokens in `common/tailwind/tailwind.css`, so namespace them (for example `os-bg-primary`) or scope them under `#app-container`.
- **Component library rules.** This repo's frontend rules prefer LemonUI and call Radix `DropdownMenu` legacy.
  Copying the Radix MenuBar is fine for a throwaway prototype, but a production version would need to be rebuilt on LemonUI or quill.
- **Shortcut clashes.** Bare `m`, `,`, `\`, `/` and `?` shortcuts would collide with app shortcuts and text inputs inside scenes; gate them behind a modifier.
- **Assets.** Wallpapers and icons are Cloudinary-hosted posthog.com assets.
  The app's Content Security Policy must allow the host (or the images must be bundled), and the license question in section 10 applies.
- **License sign-off** is required before any of this is pushed to this public repo.

## Sources

- posthog.com HEAD `b92e7cae398`: `gatsby-browser.tsx`, `gatsby-ssr.js`, `LICENSE`, `package.json`, `tailwind.config.js`, `src/context/{App,Window,Toast}.tsx`, `src/components/{Wrapper,AppContainer,AppWindow,Desktop,TaskBarMenu,ActiveWindowsPanel,OSIcons,RadixUI,OSButton,Link,ZoomHover,Korean}/…`, `src/constants/frostedSurfaces.ts`, `src/styles/global.css`, `src/hooks/{useTheme.tsx,useWindowLayoutAttributes.ts}`, `src/pages/display-options.tsx`, `src/components/seo.tsx`, `src/components/Layout/Fonts.css`, `static/scripts/theme-init.js` (read through `git show`).
- posthog.com history (GitHub API):
  - `src/components/AppWindow/index.tsx` at `ad4eafb7a8` (draggable), `23e48fb953` (drag removed)
  - `src/context/App.tsx` at `ad4eafb7a8`
  - PR #18236 (merged 2026-07-16, removed drag)
  - PR #13055 ("Website mode")
- This repo: `frontend/package.json`, `pnpm-workspace.yaml`, `LICENSE`, `package.json`, `frontend/src/scenes/App.tsx`, `frontend/src/scenes/sceneLogic.tsx`, `common/tailwind/tailwind.css`.
- npm registry: `@posthog/icons` license MIT; `@posthog/brand` license "SEE LICENSE IN LICENSE".
