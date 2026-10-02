# Which brand signals can parsers read from a GitHub repo?

Research for [Silthus/posthog#199](https://github.com/Silthus/posthog/issues/199), part of map [#198](https://github.com/Silthus/posthog/issues/198) (Email brand detection for Workflows).
Date: 2026-10-02.

## Answer

**Parsers only, with a ranked candidate list the user confirms.**
A ~500-line throwaway parser read 25 public repos at 6–18 GitHub API calls each (median 12) and found a credible primary color in 20 of 25 and an own-brand logo in 21 of 25.
The misses come from three causes: colors hidden behind JS module indirection, dark-first themes, and an SVG-only logo that email can't use.
An LLM over the same files would only fix the first cause.
So skip the LLM step for v1. Show every candidate color and logo in the Email brand form, and let the user pick one with a click.

## Method

- Scanner: [`brand_signals_scan.py`](brand_signals_scan.py). Raw output for the run: [`brand_signals_results.json`](brand_signals_results.json).
- Per repo it makes one `GET /repos/{o}/{r}` call and one `GET /git/trees/{branch}?recursive=1` call. Then it makes one contents read for each selected file, capped at 25.
- It picks the app root inside a monorepo. Then it reads `package.json`, web manifests, Tailwind configs, `index.html` and layout files, up to 6 global stylesheets, theme TS files, and 2 SVG logos.
- It resolves CSS custom properties and SCSS variables through `var()` chains, skipping `.dark` blocks. It converts hex, `rgb()`, `hsl()`, bare shadcn HSL triplets (`222.2 47.4% 11.2%`) and `oklch()` to `#rrggbb`.
- I judged each pick by hand against the brand I know from the product's public site. "Plausible" means a saturated color from the repo's own logo or theme that I couldn't confirm.

Sample: 25 repos across these stacks.

- Next.js + shadcn / Tailwind v3: taxonomy, papermark, inbox-zero.
- Tailwind v4 `@theme`: unkey, openstatus, typebot, formbricks.
- Monorepos with `apps/*`: cal.com, dub, documenso, formbricks, midday, inbox-zero, openstatus, typebot.
- MUI: material-kit-react. Chakra moved to Tailwind v4 in typebot. Emotion-in-TS: twenty, saleor.
- Plain CSS variables: healthchecks, zulip. SCSS: mastodon, excalidraw, paperless-ngx (Angular).
- Vite/React: excalidraw, infisical, saleor-dashboard. Vue/Vite: hoppscotch.
- Rails: chatwoot, maybe, mastodon. Django: healthchecks, paperless-ngx, zulip. Phoenix: plausible.

## Hit rate per field

Of 25 repos, measured on the scanner's single top pick:

| Field             | Right                        | Usable with an edit                             | Wrong                    | None | Main sources                                                                                   |
| ----------------- | ---------------------------- | ----------------------------------------------- | ------------------------ | ---- | ---------------------------------------------------------------------------------------------- |
| Name              | 10                           | 10 (lowercase slug: `formbricks`, `inbox-zero`) | 5                        | 0    | manifest `name`, Next `metadata.siteName`, `<title>`, `package.json` `name`                    |
| Primary color     | 14                           | 6 plausible, unconfirmed                        | 2 (shadcn default slate) | 3    | `--color-brand`, `--primary`, Tailwind `colors.brand`/`primary`, `theme_color`, logo SVG fills |
| Accent color      | 0 meaningful                 | 3                                               | —                        | 22   | shadcn `--accent` is a gray hover surface, not a brand accent                                  |
| Text / background | 6                            | —                                               | 1 (dark-first theme)     | 18   | `--foreground`/`--background`, `$body-color`                                                   |
| Font              | 12                           | —                                               | 1                        | 12   | `next/font/google` imports, `--font-sans`, Tailwind `fontFamily`, body `font-family`           |
| Logo              | 17 own-brand (10 PNG, 7 SVG) | 6 (icon or favicon only)                        | 2 (third-party logo)     | 0    | `public/**/logo*.{png,svg}`, manifest icons, `apple-touch-icon.png`                            |

Per stack, primary color:

| Stack                          | Repos                                                                        | Primary right or plausible | Notes                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------- |
| Tailwind v3 + shadcn           | taxonomy, papermark, inbox-zero, midday                                      | 2 of 4                     | Two still ship the untouched shadcn slate `--primary: 222.2 47.4% 11.2%` (`#0f172a`)                 |
| Tailwind v4 `@theme`           | unkey, openstatus, typebot, formbricks                                       | 4 of 4                     | `--color-brand: #00e6ca` (formbricks), `--primary: var(--color-orange-500)` (typebot)                |
| Monorepo `apps/*`              | cal.com, dub, documenso, formbricks, midday, inbox-zero, openstatus, typebot | 6 of 8                     | Shared tokens live in `packages/ui` or `packages/config`, not the app                                |
| MUI / Emotion in TS            | material-kit-react, twenty, saleor                                           | 2 of 3                     | material-kit spreads a named palette (`primary: california`) from `colors.ts`; regex can't follow it |
| Plain CSS / SCSS               | healthchecks, zulip, mastodon, excalidraw, paperless-ngx                     | 5 of 5                     | `--color-primary: #6965db` (excalidraw), `--link-color: #0091EA` (healthchecks)                      |
| Rails / Django / Phoenix       | chatwoot, maybe, mastodon, healthchecks, paperless-ngx, zulip, plausible     | 7 of 7                     | Often only `<meta theme-color>` or the logo SVG; `theme/colors.js` in chatwoot                       |
| Vite + Tailwind v4, dark-first | infisical                                                                    | 0 of 1                     | Only a dark `--background: #19191c`; the yellow brand sits outside the files read                    |

Six of the 20 good primaries are near-black (cal.com, midday, unkey, openstatus, twenty, umami).
That is their real brand, so a near-black CTA is a valid result, not a failure.

## Field by field

### Name

- Formats found: manifest `"name": "Documenso"` (`apps/remix/public/site.webmanifest`), Next `metadata.siteName` / `title.default` in `app/layout.tsx`, `<title>Infisical</title>` in `frontend/index.html`, `package.json` `"name": "@typebot.io/root"`.
- Only 6 of 25 repos ship a manifest with a name. Package names are slugs (`dub-monorepo`, `hoppscotch-app`). Titles carry noise (`Sign in to the Saleor Dashboard`, `Hoppscotch Agent`).
- Rank: manifest `name` > `siteName` > `short_name` > `title.default` > `<title>` > package name with the scope and `-monorepo|-app|-root` suffix stripped > repo name. Title-case slugs.
- The GitHub repo `homepage` (for example `cal.com`) is a better display-name hint than any file. `GitHubIntegration` drops it today (see Cost).

### Colors

Where they live, in order of trust:

1. A token named `brand`: `--color-brand` (formbricks, cal.com), Tailwind `colors.brand` (papermark), `theme/colors.js` `brand` (chatwoot).
2. A token named `primary`: `--primary` / `--color-primary` / `$primary`, Tailwind `colors.primary`, MUI `palette.primary.main`. Skip it when it equals a known shadcn default.
3. `<meta name="theme-color">` / Next `viewport.themeColor` / manifest `theme_color`. **Five of the 8 manifests that set `theme_color` use `#ffffff`**, the browser chrome color, so reject near-white.
4. The dominant saturated fill in the repo's own logo SVG (mastodon `#6364ff`, plausible, hoppscotch, zulip). It was the only signal in 5 repos.

Value formats seen: `#RRGGBB`, `#RGB`, `hsl(210deg 94% 42%)`, bare HSL triplets inside `hsl(var(--primary))`, `oklch(59.5% 0.0028 228.8)` (Tailwind v4), `var()` chains two or three deep (`--color-brand: var(--cal-brand)`), Tailwind palette references (`var(--color-orange-500)`, `colors.indigo`), and SCSS `$var` with `!default`.
All convert to email-safe `#rrggbb` with about 80 lines of color math (HSL, OKLCH→sRGB with gamut clamp). Palette references need Tailwind's default palette as a lookup table.

Primary versus accent: pick primary from the trust order above, skipping near-white and, on the first pass, near-gray (max−min channel < 0.12).
Accent is the next saturated candidate with a different hue. Shadcn `--accent` and `--secondary` are near-gray surfaces in every shadcn repo sampled, so don't treat them as accents.
Text and background come from `--foreground` and `--background` in the light block. Default to `#111111` on `#ffffff` when they're missing or when the theme is dark-first, because emails render on white.

### Font

- `next/font/google` imports are the strongest signal (`import { Inter } from "next/font/google"`). Others: `--font-sans: "IBM Plex Sans"`, Tailwind `fontFamily.sans`, body `font-family`, Google Fonts `<link>`.
- Inter appeared in 8 of the 12 hits. Others: Geist, Hedvig Letters Sans, Untitled Sans, IBM Plex Sans.
- Gmail and Outlook ignore web fonts. Store the family name, but always emit a stack that ends in safe fonts: `Inter, -apple-system, Segoe UI, Helvetica, Arial, sans-serif`.

### Logo

- Candidates seen across all 25 repos: 62 PNG, 46 SVG, 6 ICO. The top pick was PNG in 15 repos, SVG in 8 and ICO in 2.
- Good own-brand files: `apps/remix/public/static/logo.png`, `apps/web/public/logo-wordmark.png`, `app/javascript/images/mailer/logo.png` (mastodon keeps an email-specific logo), `static/img/logo.png`.
- Traps: third-party logos dominate many trees (`app-store/*/logo.png`, `images/airtableLogo.svg`, `assets/logo-dropbox.png`). Excluding integration, provider and partner directories and requiring an own-brand filename (`logo.*`, `logo-*`, or the repo name plus `logo`) fixed most of them.
- Also skip variants named `white`, `dark`, `inverse` or `mono`: emails render on white.
- Email needs a raster: Gmail and Outlook block SVG.
  PostHog's `UploadedMedia` sniffs content with Pillow and accepts only PNG, JPEG, GIF, WebP, AVIF and BMP up to 4 MB. **It rejects SVG** (`posthog/models/uploaded_media.py:46-62`).
  No SVG rasterizer is installed: Pillow is present, while cairosvg, resvg, Wand and pyvips are absent from `pyproject.toml` and `uv.lock`.
  For SVG-only repos, fall back to a PNG manifest icon or `apple-touch-icon.png` (square, 180 px or more), which 15 of 25 repos ship. Adding `resvg-py` is the alternative and a separate decision.
- ICO favicons (16–48 px) are too small for an email header. Treat them as a last resort.

### Picking the app in a monorepo

The tree lists every `package.json`.
Score each root under `apps/*`, `frontend/`, `client/` or `web/` by its brand files: a manifest, a Tailwind config, logo images, and a `public/` or `static/` dir.
Add a bonus for the names `web`, `app`, `dashboard`, `frontend` or `builder`. Drop `docs`, `storybook`, `email`, `examples` and `e2e`.
This picked the right app in 8 of 9 monorepos (`apps/web`, `apps/dashboard`, `apps/remix`, `apps/builder`). Twenty uses `packages/twenty-front`, which the pattern missed, but its manifest was still found.
Shared design tokens often live in `packages/ui`, `packages/config` or `packages/tailwind-config`. Always read those too: cal.com's `--color-brand` and midday's and openstatus's `--primary` came from there.

### Suggesting the likeliest repo

The data a ranker can use:

- `Team.app_urls` (`posthog/models/team/team.py:335`).
- Top `$host` values from `$pageview`. The query pattern is at `products/web_analytics/backend/temporal/health_checks/authorized_urls.py:36-38`. `$host` can be spoofed with the public token, so treat it as a hint only.
- The project name.
- The repo list from `list_cached_repositories`: `name, full_name, language, pushed_at, archived, private` (`posthog/api/integration.py:297-316`).

The cheapest deterministic ranker: score each non-archived repo by token overlap between its name and the host's second-level domain plus the project name, then by `pushed_at`. Match `homepage` too once it is stored.
An LLM adds nothing here. The user confirms the pick in `GitHubRepositoryPicker` anyway.

## Cost per detection

- Measured: 6–18 calls per repo, median 12, mean 12.1. That is 1 repo call, 1 tree call and 4–16 file reads. No tree was truncated, even at 44k entries (zulip).
- Logo bytes add 1 call per logo.
- Budget: GitHub installation tokens get 5,000–15,000 core calls per hour.
  PostHog's egress limiter caps a token at 0.9 × the observed limit, and at most 750 per minute (`posthog/egress/github/limiter.py:97-103,252-266`).
  `Priority.BATCH` is denied once 70% of the window is used, or 90% when there was no interactive traffic in the last 15 minutes (`posthog/egress/limiter/policies.py:41`, `limiter.py:84-89`).
  So about 15 calls is about 0.3% of the smallest hourly budget. Cost is not a constraint.
- Lane choice: detection runs while a user waits in the flow. That argues for `Priority.NORMAL` rather than `BATCH`, because a denied BATCH call raises `GitHubEgressBudgetExhausted` (`posthog/egress/github/transport.py:28`) in the middle of the UI. The map says BATCH. The spec should settle this.
- Registration: `source` is a free-form metric label (`posthog/egress/github/observability.py:27`), so `source="workflows_brand"` needs no registry entry. By convention, add a line to the "Lanes and callers" section of `posthog/egress/github/README.md`.

`GitHubIntegration` gaps the build must close:

| Need                           | Today                                                                                                | Pointer                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Recursive tree with blob sizes | No public method. `GitHubRepositoryFullCache._fetch_heavy` fetches the tree but drops sizes and SHAs | `posthog/models/integration_repository_cache.py:207-236`                        |
| Read text files                | `get_file_contents(repository, file_path, ref)` works                                                | `posthog/models/integration/github.py:1003`                                     |
| Read binary logo bytes         | Every read decodes UTF-8 and raises on PNG/ICO. Needs `api_request` with the raw `Accept` header     | `github.py:937-1003`, `posthog/models/github_integration_base.py:2865`          |
| Repo `homepage`                | Not stored or serialized                                                                             | `integration_repository_cache.py:188-205`, `posthog/api/integration.py:297-316` |
| BATCH precedent                | `GitHubIntegration(integration, source="business_knowledge", priority=Priority.BATCH)`               | `products/business_knowledge/backend/github_repos.py:281`                       |

## Why not an LLM step

- The parser's misses are module indirection (material-kit's palette spread), a dark-first theme (infisical), and files outside the read set (dub's colors in a shared preset).
  An LLM fed the same ~12 files fixes the first and, partly, the second. That is about 2 of 25 repos.
  Reading more files deterministically fixes the third.
- Ranking (brand vs primary, which logo) is where parsers are weakest. But a one-click correction in the form is cheaper, faster and more trustworthy than a model call. The user reviews the Email brand anyway.
- Cost of adding one: `services/llm-gateway` is frozen (`services/llm-gateway/PARITY.md:3-9`).
  A new caller would use `build_ai_gateway_anthropic_client(ai_product=..., team_id=..., distinct_id=...)` (`posthog/llm/gateway_client.py:503`), which is Go-gateway only and raises when it isn't configured. That means self-hosted and dev setups need a parser-only path regardless.
  Precedent: `products/web_analytics/backend/content_autopilot/llm.py:29-35`.
- An existing LLM brand path already exists: `CreateMessageTemplateTool` loads a URL with `WebBaseLoader` "to match their branding" and calls `gpt-4.1` (`products/workflows/backend/max_tools.py:38-61,105`). Revisit an LLM once real detection telemetry shows which fields users correct most.

## Open risks for the spec

1. **Shadcn defaults.** Untouched shadcn themes produce slate `#0f172a` as "primary" (2 of 25). Keep a table of shadcn and Tailwind default primaries and mark matches as "default theme, pick a color".
2. **SVG-only logos.** UploadedMedia rejects SVG and no rasterizer is installed. Decide between a PNG-icon fallback and adding `resvg-py`.
3. **Binary reads and tree sizes.** Both need new `GitHubIntegration` methods (see the gaps table).
4. **Dark-first themes.** Detect a dark `--background` and fall back to `#ffffff` / `#111111` for email.
5. **Lane.** NORMAL vs BATCH for an interactive flow.
6. **Determinism.** Tie-breaking on SVG fill counts varied between runs of the scanner (plausible's pick moved between two indigo shades). The real detector needs stable ordering.
7. **Third-party logos and names.** Exclusion lists for integration directories and noisy `<title>` values need tests built from invented fixture trees.
8. **Private-repo read scope.** The GitHub App needs contents read on the chosen repo. Check that the installed permission set covers it.
