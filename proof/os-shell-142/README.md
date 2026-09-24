# Proof for Silthus/posthog#142

Collected with headless Chromium through Playwright (`logs/perf.mjs`), 1600x1000, warm caches, on a local stack from the `os-shell/perf` worktree.

- `before-*`: `feat/os-shell` at `2feb63913ef`. `final-*`: this branch's fix. `after-*`: an earlier revision of the fix (results only).
- `*-dev-*`: Vite dev server (web 8105, Vite 8338). `*-prod-*`: `pnpm --filter=@posthog/frontend build`, served by Django with `JS_URL=""` (`logs/run-prod.sh`).
- `baseline-*`: flag off, the regular app loading the same pages.
- `traces/*.trace.json.gz`: Chrome performance traces with screenshots. Unzip them and load them in the Chrome DevTools Performance panel.
- `results/*.json`: per scenario, the time to first paint and to scene content per window, requests and bytes per frame, console errors per frame, Long Tasks, and frame reloads.
- `bench/`: three untraced runs per variant for "four apps" and "reload with four saved windows" (`logs/bench.sh`). `w1` and `w4` mean one or four web workers. `limitN` is `OS_FRAME_BOOT_LIMIT`.
- `screenshots/`: `*-while-loading.png` is 0.5 s after the fourth app opens (before: blank bodies, final: the loading state). `slow-*.png` shows a frame whose entry script is blocked, the slow bar after 20 s, and the app after Reload.
- `logs/`: red and green Jest output, mutation checks, the TypeScript check, lint, and react-doctor.
