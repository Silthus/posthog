# Measured numbers (ticket 142)

Headless Chromium 1600x1000, Playwright, warm caches, own stack. "Content" = click (or reload) to the scene's first content with no spinner or skeleton in the frame.

## Single window, before (base 2feb63913ef)

| App | Vite dev | Production build | Flag off dev | Flag off prod |
| Workflows | 2.6 s, 2389 req, 96 MB | 1.9 s, 451 req, 4.3 MB | 3.5 s | 2.0 s |
| Dashboards | 2.8 s, 2131 req, 80 MB | 2.2 s, 418 req | 3.1 s | 2.4 s |
| Feature flags | 2.8 s, 1781 req | 2.1 s, 358 req | 3.4 s | 2.8 s |

## After (this branch), single window

dev: workflows 2.7, dashboards 2.7, flags 3.1 s. prod: workflows 1.8, dashboards 2.0, flags 2.2 s.

## Four apps opened 300 ms apart (store, flags, dashboards, workflows; workflows on top)

- dev before: 4.2 / 6.4 / 7.1 / 6.6 s; after: 3.4 / 4.9 / 7.5 / 6.3 s
- prod, 1 web worker, median of 3 untraced: before top 5.18 s; after top 5.05 s
- prod, 4 web workers, median of 3: before top 2.99 s; after top 2.62 s

## Reload with four saved windows (restore), prod, median of 3

- 1 web worker: before top 6.93 s, all 6.93 s; after top 5.65 s, all 9.30 s (one run 19.5 s: single worker queues API calls)
- 4 web workers: before top 4.75 s, all 4.95 s; after top 2.95 s, all 4.99 s

## Drag and resize with four frames: 0 long tasks during the gesture, 0 frame reloads, before and after.

## Slow state proof: a frame whose entry script is blocked shows the bar after 20.3 s; Reload after unblocking renders in 5.5 s (dev).
