# App catalog inventory: what apps exist today, and how are they grouped?

Research for ticket `03-app-catalog-inventory` (OS-shell exploration).
Snapshot: repo at `6a479f718c9` (2026-09-23).
All paths are relative to the repo root.
Machine-readable catalog: `03-app-catalog.json` next to this file (69 entries: id, name, url, icon, iconType, category, tree, status, tags, flag, sceneKey, folder, owners, source line).

## TL;DR

- There is already a single source of truth for "apps": each product's `manifest.tsx` declares `treeItemsProducts` (user-facing products) and `treeItemsMetadata` (data-management tools), and `frontend/build-products.mjs` compiles them into `frontend/src/products.tsx` (`getTreeItemsProducts` at line 2043, `getTreeItemsMetadata` at line 2829) and `frontend/src/products.json`.
  An app store can read that list directly; no new registry is needed to start.
- Today: **51 product entries** in 7 sidebar categories, plus **19 data-management entries** in 4 categories (Endpoints appears in both, so 69 unique).
  Of the 51 products, 10 sit in `Unreleased` behind a feature flag, 5 more are tagged `alpha` and 6 `beta`.
- A per-user "installed apps" concept already exists: the `UserProductList` model (`posthog/models/file_system/user_product_list.py:71`) stores `(team, user, product_path, enabled)` and backs the sidebar's "My Tools" section.
  New users get 5 defaults: Product analytics, Dashboards, Web analytics, Error tracking, Session replay (`DEFAULT_PRODUCT_PATHS`, line 22).
- The live sidebar already has an "apps grid" variant: `navAppsTabLogic` + `groupApps` (`frontend/src/layout/panel-layout/navbar/tabs/navAppsTabLogic.ts`, `appsCatalog.ts`) merges products, data tools and persons/cohorts into one categorized list with a `Project` group on top, behind the `SIMPLE_SIDEPANEL` flag (`NavBar.tsx:137`).
  A third variant, `FlatNavBrowse`, runs behind the `FLAT_NAV` multivariate flag (`NavBar.tsx:140`, `lib/constants.tsx:338`).

## Where the data lives

| What                                                                                                                              | Where                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-product declaration (name, scenes, routes, urls, `fileSystemTypes`, `treeItemsProducts`, `treeItemsMetadata`, `treeItemsNew`) | `products/<name>/manifest.tsx` (76 folders have one), for example `products/feature_flags/manifest.tsx`                                                                                                                                                                       |
| Owning team                                                                                                                       | `products/<name>/product.yaml` (`name`, `owners`; 83 folders)                                                                                                                                                                                                                 |
| Generator                                                                                                                         | `frontend/build-products.mjs` (collects `treeItemsProducts` / `treeItemsMetadata` at lines 80-128, writes `src/products.json` at line 30)                                                                                                                                     |
| Compiled product list                                                                                                             | `frontend/src/products.tsx` `getTreeItemsProducts` (2043), `getTreeItemsGames` (2822), `getTreeItemsMetadata` (2829); URL helpers in `productUrls` (1103); `fileSystemTypes` (1669)                                                                                           |
| Backend-readable copy                                                                                                             | `frontend/src/products.json` (`products`, `games`, `metadata`; type `ProductsData` in `frontend/src/queries/schema/schema-general.ts:8733`)                                                                                                                                   |
| Category enum                                                                                                                     | `ProductItemCategory` in `frontend/src/queries/schema/schema-general.ts:8715` (Analytics, AI engineering, Behavior, App monitoring, Features, Tools, Schema, Pipeline, Metadata, Unreleased)                                                                                  |
| Category order in the sidebar                                                                                                     | `CATEGORY_ORDER` in `frontend/src/layout/panel-layout/ProjectTree/utils.tsx:16` (Analytics, AI engineering, Behavior, App monitoring, Features, Tools, Unreleased); data panel order `DATA_MANAGEMENT_PANEL_ORDER` at line 35 (Pipeline, Schema, Tools, Metadata, Unreleased) |
| Icon resolution                                                                                                                   | `iconTypes` map and `iconForType()` in `frontend/src/layout/panel-layout/ProjectTree/defaultTree.tsx:84` and `:419` (item `iconType`, else `fileSystemTypes[type].iconType`, else `type`, else `IconBook`)                                                                    |
| Persons and Cohorts (hardcoded, category `People`)                                                                                | `getDefaultTreePersons()` in `defaultTree.tsx:494`                                                                                                                                                                                                                            |
| Sidebar sections users can hide                                                                                                   | `SIDEBAR_CUSTOMIZABLE_SECTIONS` and `SIDEBAR_CUSTOMIZABLE_FOOTER_ITEMS` in `frontend/src/layout/panel-layout/sidebarCustomization.tsx:46`                                                                                                                                     |
| Per-user pinned products ("My Tools")                                                                                             | `UserProductList` model, `posthog/api/file_system/user_product_list.py`, `frontend/src/layout/panel-layout/ProjectTree/customProductsLogic.tsx`                                                                                                                               |

Visibility rules, as the code applies them:

- `flag`: the item is hidden unless the feature flag is on (`navAppsTabLogic.ts:85` drops items whose flag is off).
- `tags: ['alpha' | 'beta']`: a badge only; the item still shows.
- `category: 'Unreleased'`: every entry in it also has a `flag`, so this is "internal / early access" in practice.
- Status in the table below is derived: `unreleased` if the category is Unreleased, else `alpha`/`beta` from tags, else `ga`.
  A flagged `ga` row (for example Tracing, Tasks, Inbox) is shipped UI that is still gated by a rollout flag.

## Inventory: user-facing app candidates

Icons are `@posthog/icons` components resolved through `defaultTree.tsx`.
"Line" is the line in `frontend/src/products.tsx`.
Rows are ordered by the current sidebar category order, then by name.

#### Products (`getTreeItemsProducts`, 51)

| Name                  | URL                               | Icon (`iconType`)                         | Category       | Status / tags      | Feature flag                 | Folder                           | Line |
| --------------------- | --------------------------------- | ----------------------------------------- | -------------- | ------------------ | ---------------------------- | -------------------------------- | ---- |
| Customer analytics    | `/customer_analytics`             | `IconPeople` (`cohort`)                   | Analytics      | beta (beta)        | `CUSTOMER_ANALYTICS`         | `products/customer_analytics`    | 2134 |
| Dashboards            | `/dashboard`                      | `IconDashboard` (`dashboard`)             | Analytics      | ga (-)             | -                            | `products/dashboards`            | 2154 |
| Data catalog          | `/data-catalog`                   | `IconDatabase` (`data_warehouse`)         | Analytics      | beta (beta)        | -                            | `products/data_catalog`          | 2165 |
| Marketing analytics   | `/marketing`                      | `IconMegaphone` (`marketing_analytics`)   | Analytics      | beta (beta)        | `WEB_ANALYTICS_MARKETING`    | `products/marketing_analytics`   | 2478 |
| Product analytics     | `/insights`                       | `IconGraph` (`product_analytics`)         | Analytics      | ga (-)             | -                            | `products/product_analytics`     | 2539 |
| SQL editor            | `/sql`                            | `IconServer` (`sql_editor`)               | Analytics      | ga (-)             | -                            | `products/data_warehouse`        | 2619 |
| Web analytics         | `/web`                            | `IconPieChart` (`web_analytics`)          | Analytics      | ga (-)             | -                            | `products/web_analytics`         | 2776 |
| AI gateway            | `/ai-gateway`                     | `IconAIGateway` (`ai_gateway`)            | AI engineering | alpha (alpha)      | `AI_GATEWAY`                 | `products/ai_gateway`            | 2044 |
| Business knowledge    | `/business-knowledge`             | `IconSupport` (`conversations`)           | AI engineering | alpha (alpha)      | `PRODUCT_BUSINESS_KNOWLEDGE` | `products/business_knowledge`    | 2083 |
| Clusters              | `/ai-observability/clusters`      | `IconScatter` (`llm_clusters`)            | AI engineering | ga (-)             | -                            | `products/ai_observability`      | 2095 |
| Datasets              | `/ai-evals/datasets`              | `IconDocument` (`llm_datasets`)           | AI engineering | beta (beta)        | `LLM_ANALYTICS_DATASETS`     | `products/ai_observability`      | 2198 |
| Evaluations           | `/ai-evals/evaluations`           | `IconListCheck` (`llm_evaluations`)       | AI engineering | ga (-)             | -                            | `products/ai_observability`      | 2290 |
| LLM analytics         | `/ai-observability/dashboard`     | `IconLlmAnalytics` (`llm_analytics`)      | AI engineering | ga (-)             | -                            | `products/ai_observability`      | 2371 |
| MCP analytics         | `/mcp-analytics`                  | `IconMCP` (`mcp_analytics`)               | AI engineering | beta (beta)        | `MCP_ANALYTICS`              | `products/mcp_analytics`         | 2450 |
| MCP servers           | `/mcp-servers`                    | `IconApps` (`tools`)                      | AI engineering | alpha (alpha)      | `MCP_GATEWAY`                | `products/mcp_store`             | 2467 |
| Playground            | `/ai-observability/playground`    | `IconPlaylist` (`llm_playground`)         | AI engineering | ga (-)             | -                            | `products/ai_observability`      | 2511 |
| Prompts               | `/prompt-management/prompts`      | `IconLlmPromptManagement` (`llm_prompts`) | AI engineering | ga (-)             | -                            | `products/ai_observability`      | 2565 |
| Taggers               | `/ai-evals/taggers`               | `IconList` (`llm_tags`)                   | AI engineering | alpha (alpha)      | `LLM_ANALYTICS_TAGS`         | `products/ai_observability`      | 2674 |
| Heatmaps              | `/heatmaps`                       | `IconApp` (`heatmap`)                     | Behavior       | beta (beta)        | -                            | `products/replay`                | 2338 |
| Product tours         | `/product_tours`                  | `IconSpotlight` (`product_tour`)          | Behavior       | ga (-)             | `PRODUCT_TOURS`              | `products/product_tours`         | 2550 |
| Replay vision         | `/replay-vision`                  | `IconEye` (`replay_vision`)               | Behavior       | ga (-)             | -                            | `products/replay_vision`         | 2605 |
| Session replay        | `/replay/home`                    | `IconRewindPlay` (`session_replay`)       | Behavior       | ga (-)             | -                            | `products/replay`                | 2630 |
| Support               | `/support/tickets`                | `IconSupport` (`conversations`)           | Behavior       | ga (-)             | -                            | `products/conversations`         | 2652 |
| Surveys               | `/surveys`                        | `IconMessage` (`survey`)                  | Behavior       | ga (-)             | -                            | `products/surveys`               | 2663 |
| Error tracking        | `/error_tracking`                 | `IconWarning` (`error_tracking`)          | App monitoring | ga (-)             | -                            | `products/error_tracking`        | 2276 |
| Logs                  | `/logs`                           | `IconLive` (`logs`)                       | App monitoring | ga (-)             | -                            | `products/logs`                  | 2432 |
| Metrics               | `/metrics`                        | `IconGraph` (`metrics`)                   | App monitoring | alpha (alpha)      | -                            | `products/metrics`               | 2490 |
| Tracing               | `/tracing`                        | `IconListTree` (`tracing`)                | App monitoring | ga (-)             | `TRACING`                    | `products/tracing`               | 2726 |
| Early access features | `/early_access_features`          | `IconRocket` (`early_access_feature`)     | Features       | ga (-)             | -                            | `products/early_access_features` | 2228 |
| Experiments           | `/experiments`                    | `IconFlask` (`experiment`)                | Features       | ga (-)             | -                            | `products/experiments`           | 2318 |
| Feature flags         | `/feature_flags`                  | `IconToggle` (`feature_flag`)             | Features       | ga (-)             | -                            | `products/feature_flags`         | 2329 |
| Broadcasts            | `/workflows/broadcasts`           | `IconSend` (`broadcasts`)                 | Tools          | ga (-)             | -                            | `products/workflows`             | 2072 |
| Endpoints             | `/endpoints`                      | `IconEndpoints` (`endpoints`)             | Tools          | ga (-)             | -                            | `products/endpoints`             | 2242 |
| Inbox                 | `/inbox`                          | `IconNotification` (`inbox`)              | Tools          | ga (-)             | `PRODUCT_AUTONOMY`           | `products/inbox`                 | 2360 |
| Notebooks             | `/notebooks`                      | `IconNotebook` (`notebook`)               | Tools          | ga (-)             | -                            | `products/product_analytics`     | 2501 |
| Skills                | `/skills`                         | `IconLlmPromptManagement` (`llm_prompts`) | Tools          | ga (-)             | -                            | `products/skills`                | 2641 |
| Tasks                 | `/tasks`                          | `IconBug` (`task`)                        | Tools          | ga (-)             | `TASKS`                      | `products/posthog_ai`            | 2704 |
| Toolbar               | `/toolbar`                        | `IconToolbar` (`toolbar`)                 | Tools          | ga (-)             | -                            | `products/toolbar`               | 2716 |
| Web scripts           | `/web-scripts`                    | `IconPlug` (`data_pipeline`)              | Tools          | ga (-)             | -                            | `products/cdp`                   | 2786 |
| Wizard                | `/wizard/runs`                    | `IconLlmPromptManagement` (`llm_prompts`) | Tools          | ga (-)             | `WIZARD_UI_ENABLED`          | `products/wizard`                | 2797 |
| Workflows             | `/workflows`                      | `IconDecisionTree` (`workflows`)          | Tools          | ga (-)             | -                            | `products/workflows`             | 2808 |
| Apps                  | `/streamlit-apps`                 | `IconApps` (`tools`)                      | Unreleased     | unreleased (-)     | `STREAMLIT_APPS`             | `products/streamlit_apps`        | 2060 |
| Code review           | `/code-review`                    | `IconPullRequest` (`code_review`)         | Unreleased     | unreleased (alpha) | `REVIEW_HOG`                 | `products/review_hog`            | 2123 |
| Data warehouse        | `/data-ops`                       | `IconDatabase` (`data_warehouse`)         | Unreleased     | unreleased (-)     | `DATA_WAREHOUSE_SCENE`       | `products/data_warehouse`        | 2175 |
| Engineering analytics | `/engineering-analytics/overview` | `IconStethoscope` (`health`)              | Unreleased     | unreleased (alpha) | `ENGINEERING_ANALYTICS`      | `products/engineering_analytics` | 2256 |
| Identity matching     | `/identity-matching`              | `IconPeople` (`persons`)                  | Unreleased     | unreleased (alpha) | `IDENTITY_MATCHING`          | `products/growth`                | 2349 |
| Links                 | `/links`                          | `IconExternal` (`link`)                   | Unreleased     | unreleased (alpha) | `LINKS`                      | `products/links`                 | 2407 |
| Live Debugger         | `/live-debugger`                  | `IconBug` (`live_debugger`)               | Unreleased     | unreleased (alpha) | `LIVE_DEBUGGER`              | `products/live_debugger`         | 2418 |
| Pulse                 | `/pulse`                          | `IconClock` (`activity`)                  | Unreleased     | unreleased (alpha) | `PULSE`                      | `products/pulse`                 | 2593 |
| User research         | `/user_research`                  | `IconApp` (`user_interview`)              | Unreleased     | unreleased (alpha) | `USER_INTERVIEWS`            | `products/user_interviews`       | 2737 |
| Visual review         | `/visual_review`                  | `IconApp` (`visual_review`)               | Unreleased     | unreleased (alpha) | `VISUAL_REVIEW`              | `products/visual_review`         | 2753 |

#### Data tools (`getTreeItemsMetadata`, 19; Endpoints is listed in both trees and appears once, under Products)

| Name                      | URL                                       | Icon (`iconType`)                              | Category   | Status / tags  | Feature flag                  | Folder                        | Line |
| ------------------------- | ----------------------------------------- | ---------------------------------------------- | ---------- | -------------- | ----------------------------- | ----------------------------- | ---- |
| Models                    | `/models`                                 | `IconServer` (`sql_editor`)                    | Tools      | ga (-)         | -                             | `products/data_warehouse`     | 2927 |
| Managed viewsets          | `/data-management/managed-viewsets`       | `IconDatabase` (`managed_viewsets`)            | Unreleased | unreleased (-) | `MANAGED_VIEWSETS`            | `products/data_warehouse`     | 2908 |
| Destinations              | `/data-management/destinations`           | `IconPlug` (`data_pipeline_metadata`)          | Pipeline   | ga (-)         | -                             | `products/cdp`                | 2854 |
| Event ingestion filtering | `/event-filtering`                        | `IconPlug` (`data_pipeline_metadata`)          | Pipeline   | ga (-)         | -                             | `products/cdp`                | 2883 |
| Event ingestion warnings  | `/data-management/ingestion-warnings`     | `IconWarning` (`ingestion_warning`)            | Pipeline   | ga (-)         | -                             | `products/cdp`                | 2892 |
| Managed migrations        | `/managed_migrations`                     | `IconPlug` (`data_pipeline_metadata`)          | Pipeline   | ga (-)         | -                             | `products/managed_migrations` | 2900 |
| Sources                   | `/data-management/sources`                | `IconPlug` (`data_pipeline_metadata`)          | Pipeline   | ga (-)         | -                             | `products/data_warehouse`     | 2962 |
| Transformations           | `/transformations`                        | `IconPlug` (`data_pipeline_metadata`)          | Pipeline   | ga (-)         | -                             | `products/cdp`                | 2971 |
| Warehouse destinations    | `/data-management/warehouse-destinations` | `IconDatabase` (`data_warehouse`)              | Pipeline   | ga (-)         | `WAREHOUSE_MULTI_DESTINATION` | `products/data_warehouse`     | 2980 |
| Actions                   | `/data-management/actions`                | `IconPlay` (`action`)                          | Schema     | ga (-)         | -                             | `products/actions`            | 2830 |
| Core events               | `/data-management/core-events`            | `IconApps` (`event_definition`)                | Schema     | ga (-)         | `NEW_TEAM_CORE_EVENTS`        | `products/core_events`        | 2846 |
| Event definitions         | `/data-management/events`                 | `IconApps` (`event_definition`)                | Schema     | ga (-)         | -                             | `products/product_analytics`  | 2875 |
| Property definitions      | `/data-management/properties`             | `IconApps` (`property_definition`)             | Schema     | ga (-)         | -                             | `products/product_analytics`  | 2937 |
| Property groups           | `/data-management/schema`                 | `IconApps` (`event_definition`)                | Schema     | ga (-)         | `SCHEMA_MANAGEMENT`           | `products/product_analytics`  | 2945 |
| Revenue definitions       | `/data-management/revenue`                | `IconPiggyBank` (`revenue_analytics_metadata`) | Schema     | ga (-)         | -                             | `products/revenue_analytics`  | 2953 |
| SQL variables             | `/data-management/variables`              | `IconBook (default)` (`None`)                  | Schema     | ga (-)         | -                             | `products/product_analytics`  | 2961 |
| Warehouse properties      | `/data-management/warehouse-properties`   | `IconDatabase` (`data_warehouse`)              | Schema     | ga (-)         | `WAREHOUSE_PERSON_PROPERTIES` | `products/customer_analytics` | 2989 |
| Annotations               | `/data-management/annotations`            | `IconNotification` (`annotation`)              | Metadata   | ga (-)         | -                             | `products/product_analytics`  | 2838 |

### Products that have a folder but no sidebar entry

These folders have a `manifest.tsx` with no `treeItemsProducts`, or no manifest at all, so they never show up in the product tree (checked by grepping every `products/*/manifest.tsx`):

- Reached only through another app: `products/revenue_analytics` (only a Schema entry, "Revenue definitions"), `products/notebooks` (the "Notebooks" tree item is declared in `products/product_analytics/manifest.tsx`), `products/actions` and `products/core_events` (data tools only), `products/managed_migrations` (data tool only).
- Games: `products/games` declares `treeItemsGames` (368 Hedgehogs, Flappy Hog, Ship It; `products.tsx:2822`), shown in a separate games list, not the product tree.
- Internal or debug: `products/analytics_platform` (one staff debug scene, `/debug/precompute`).
- No manifest (backend-only or embedded elsewhere): `approvals`, `billing`, `billing_alerts`, `canvas`, `context_layer`, `desktop`, `event_definitions`, `field_notes`, `ingestion`, `integrations`, `llm_analytics`, `reminders`, `session_replay`, `slack_app`, `support`, `warehouse_sources_queue`.

Notes that matter for an app store:

- One folder can own several apps: `products/ai_observability` owns 7 entries (LLM analytics, Playground, Clusters, Datasets, Evaluations, Taggers, Prompts), `products/data_warehouse` owns SQL editor, Data warehouse, Models, Sources, Managed viewsets and Warehouse destinations, `products/cdp` owns Web scripts and four pipeline tools, and `products/workflows` owns Workflows and Broadcasts.
  So "app" is not the same as "product folder"; the tree item is the better unit.
- Several apps share a scene family: all 7 AI observability entries list the same `sceneKeys` (for example `products.tsx:2095-2122`), and Broadcasts lists the Workflows scenes.
  A window-per-app shell needs a rule for which app "owns" a scene that several apps claim.
- Icons are not unique: `IconApp` is used by Heatmaps, User research and Visual review; `IconLlmPromptManagement` by Prompts, Skills and Wizard; `IconDatabase` by five entries; `IconPlug` by five pipeline tools.
  An app-store grid with desktop icons will need distinct icons or per-app color (each entry already carries an `iconColor` CSS variable).

## System surfaces (not apps in the store; OS-level)

| Surface                         | Where it lives today                                                                                                                            | URL / entry point                                                    | How it shows in the shell today                                                                                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home                            | `frontend/src/scenes/project-homepage/`                                                                                                         | `/home` (`urls.projectHomepage`, `scenes.ts:832`), `/`               | Sidebar "Project" section, always first                                                                                                                                     |
| Self-driving (Inbox, signals)   | `products/inbox`, `products/signals`                                                                                                            | `/inbox`                                                             | Listed as the "Inbox" product (category Tools), relabeled "Self-driving" in the Project section (`navAppsTabLogic.ts`, `sidebarCustomization.tsx`), flag `PRODUCT_AUTONOMY` |
| Activity (live events, explore) | `frontend/src/scenes/activity/`                                                                                                                 | `/activity/:tab` (`urls.ts:62`, `scenes.ts:786-788`)                 | Sidebar "Project" item that cannot be hidden                                                                                                                                |
| Activity log / audit trail      | `frontend/src/layout/navigation-3000/sidepanel/panels/activity/`, `frontend/src/scenes/team-activity/`                                          | side panel `SidePanelTab.Activity`, `/activity-logs` (`urls.ts:255`) | Side panel                                                                                                                                                                  |
| Notifications                   | `frontend/src/lib/components/NotificationsMenu/`                                                                                                | footer bell                                                          | Sidebar footer item, flag `REAL_TIME_NOTIFICATIONS` (`sidebarCustomization.tsx:113`)                                                                                        |
| Search / command palette        | `frontend/src/lib/components/Command/Command.tsx`, `frontend/src/lib/components/Search/searchLogic.tsx`                                         | keyboard shortcut                                                    | Modal dialog over any scene                                                                                                                                                 |
| PostHog AI (Max)                | `products/posthog_ai`, scene `Max` (`scenes.ts:268`)                                                                                            | `/ai`, `/ai/history` (`urls.ts:170-172`)                             | Full scene, "chat" nav tab (`NavTabChat`), and side panel `SidePanelTab.Max`                                                                                                |
| Tasks (agent tasks)             | `products/posthog_ai`                                                                                                                           | `/tasks`                                                             | Listed as a product in Tools, flag `TASKS`                                                                                                                                  |
| Notebooks                       | `products/notebooks`, `products/product_analytics` (tree item)                                                                                  | `/notebooks`                                                         | Listed as a product in Tools, also side panel `SidePanelTab.Notebooks`                                                                                                      |
| Data management                 | `frontend/src/scenes/data-management/`, scene config `scenes.ts:133`                                                                            | `/data-management/*`                                                 | Sidebar "Data" panel built from `getTreeItemsMetadata` + Persons/Cohorts (`getDefaultTreeDataAndPeople`, `defaultTree.tsx:489`)                                             |
| Persons and Cohorts             | `frontend/src/scenes/persons-management/`, `frontend/src/scenes/cohorts/`, hardcoded in `defaultTree.tsx:494`                                   | `/persons`, `/cohorts`                                               | Sidebar "Data" panel, category `People`                                                                                                                                     |
| Files (project tree)            | `frontend/src/layout/panel-layout/ProjectTree/`                                                                                                 | none                                                                 | Sidebar "Files" panel                                                                                                                                                       |
| Settings                        | `frontend/src/scenes/settings/` (`scenes.ts:474`)                                                                                               | `/settings/:section` (`urls.ts:173`)                                 | Sidebar footer, cannot be hidden                                                                                                                                            |
| Help and support                | `HelpMenu` in `frontend/src/layout/panel-layout/navbar/NavBarFooter.tsx:54`, side panel `SidePanelTab.Support`                                  | footer                                                               | Sidebar footer "Help"                                                                                                                                                       |
| Toolbar                         | `products/toolbar`, scene `ToolbarLaunch` (`scenes.ts:512`)                                                                                     | `/toolbar` (`urls.ts:181`)                                           | Listed as a product in Tools                                                                                                                                                |
| Health                          | `frontend/src/scenes/health/`                                                                                                                   | `/health` (`scenes.ts:911`)                                          | No link to `urls.health()` under `frontend/src/layout/`                                                                                                                     |
| Billing                         | `frontend/src/scenes/billing/`, organization-level (`scenes.ts:89`)                                                                             | `/organization/billing` (`urls.ts:251`)                              | Settings / organization menu                                                                                                                                                |
| Onboarding                      | `frontend/src/scenes/onboarding/` (`scenes.ts:304`, layout `plain`)                                                                             | `/onboarding/:productKey` (`urls.ts:211-245`)                        | Full-page, no chrome; this is today's "install an app" flow per product                                                                                                     |
| Side panel utilities            | `SidePanelTab` enum in `frontend/src/types.ts:7261` (Max, Notebooks, Support, Activity, Discussion, Exports, AccessControl, AccessDetail, Info) | right-hand panel                                                     | These are the closest thing to "OS utilities" today                                                                                                                         |
| Games                           | `products/games`                                                                                                                                | `/games/*`                                                           | Separate games list                                                                                                                                                         |

## Current sidebar grouping (September 2026)

The default sidebar (`NavTabBrowse.tsx`) has these sections, and each is user-hideable through `SIDEBAR_CUSTOMIZABLE_SECTIONS`:

1. **Project**: Home, Self-driving (flagged), Activity, then buttons that open panels: Data, Files, Tools, Starred.
2. **Recents**.
3. **My Tools**: the user's `UserProductList` rows.
4. **Footer**: Notifications (flagged), Help, Settings.

The "Tools" panel lists `getTreeItemsProducts()` grouped by `CATEGORY_ORDER`.
The "Data" panel lists `getTreeItemsMetadata()` plus Persons/Cohorts grouped by `DATA_MANAGEMENT_PANEL_ORDER`.

Category sizes today (from `03-app-catalog.json`):

| Tree             | Category       | Count                                  |
| ---------------- | -------------- | -------------------------------------- |
| Products         | Analytics      | 7                                      |
| Products         | AI engineering | 11                                     |
| Products         | Behavior       | 6                                      |
| Products         | App monitoring | 4                                      |
| Products         | Features       | 3                                      |
| Products         | Tools          | 10                                     |
| Products         | Unreleased     | 10                                     |
| Data             | Pipeline       | 7                                      |
| Data             | Schema         | 8                                      |
| Data             | Tools          | 1 (Models; Endpoints also listed here) |
| Data             | Metadata       | 1                                      |
| Data             | Unreleased     | 1                                      |
| Data (hardcoded) | People         | 2                                      |

Observations:

- "Tools" is a catch-all: it mixes a messaging product (Broadcasts), automation (Workflows), developer surfaces (Endpoints, Web scripts, Toolbar, Wizard), AI agents (Tasks, Skills), and a system surface (Inbox) with a document app (Notebooks).
- "AI engineering" is the largest category, but 7 of its 11 entries are sub-views of one product (`products/ai_observability`).
- "Features" has 3 entries; "App monitoring" has 4.
- "Unreleased" is a lifecycle state, not a topic, and every item in it already has a flag.

## Grouping history (March 2025 to September 2026)

Source: `git log` over `frontend/src/layout/panel-layout/`, `frontend/src/layout/navigation-3000/`, `frontend/src/layout/panel-layout/ProjectTree/utils.tsx`, `products/*/manifest.tsx` (`-G 'category:'`) and `frontend/src/lib/constants.tsx`.
Rows marked **verified** were checked against the diff.
Rows marked _subject only_ come from the commit title and were not opened; treat them as inferred.

| Date                | Commit                                                                    | Title                                                                                                                                                                                                    | What changed                                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2025-03-11          | `2312e010492`                                                             | chore(devex): introducing panel-layout (#29765)                                                                                                                                                          | **Verified.** New `frontend/src/layout/panel-layout/` next to the old navigation-3000 navbar, behind flag `tree-view-products`.                                                           |
| 2025-05-09          | `00adb2da497`                                                             | feat(project-tree): all products & shortcuts (#32055)                                                                                                                                                    | **Verified.** A "Products" panel and a Shortcuts panel; product entries start coming from `products/*/manifest.tsx`.                                                                      |
| 2025-06-02 to 06-10 | `ea621eaa3cf`, `7d41df5e27a`, `ddaee681d94`                               | second flag for org release (#32991); remove old nav (#33427); remove posthog 3000 flag (#33424)                                                                                                         | **Verified.** Flags `tree-view`, `tree-view-release`, `posthog-3000-nav` removed; the old per-product navigation-3000 sidebars are deleted and the project tree becomes the only sidebar. |
| 2025-06-06          | `243c6070351`                                                             | feat(project-tree): product category labels (#33227)                                                                                                                                                     | **Verified.** First category headers, sorted alphabetically. Products: Analytics, Behaviour, Features, Tools. Data: Definitions, People, Pipeline, Metadata.                              |
| 2025-06-06          | `249e5f3e2b9`                                                             | fix(project-tree): use US spelling (#33311)                                                                                                                                                              | **Verified.** `Behaviour` becomes `Behavior`.                                                                                                                                             |
| 2025-08-26          | `83a337ac831`                                                             | feat(nav): rename "products" to "apps" (#37153)                                                                                                                                                          | **Verified.** The navbar "Products" panel is labeled "Apps".                                                                                                                              |
| 2025-09-15          | `998f0b10784`                                                             | fix(ux): unreleased apps to the end (#38028)                                                                                                                                                             | **Verified.** New `Unreleased` category; 8 products move into it (including Logs and messaging).                                                                                          |
| 2025-11-19          | `5d7e2b4ee1e`, `63b2a39dbe0`                                              | Implement new custom sidebar (#41407); backfill `UserProductList` (#41719)                                                                                                                               | _Subject only._ Per-user custom product list in the sidebar (root `custom-products://`), which is today's "My Tools".                                                                     |
| 2026-01-15          | `62d94788e79`                                                             | chore(ux/wip): New navbar (#45127)                                                                                                                                                                       | _Subject only._ Navbar redesign.                                                                                                                                                          |
| 2026-02-04          | `3cfca9344aa`                                                             | feat: Move LLM Analytics sub items to the sidebar (#46628)                                                                                                                                               | **Verified.** Alphabetical order replaced by fixed `CATEGORY_ORDER` = Analytics, AI Analytics, Behavior, Features, Tools, Unreleased; new `AI Analytics` category with 5 items.           |
| 2026-02-04          | `3ea9759cf77`                                                             | chore: move pipeline tabs to scenes (#46272)                                                                                                                                                             | **Verified.** `DATA_MANAGEMENT_PANEL_ORDER` (Pipeline, Schema, Tools, Metadata, Unreleased); `Schema` has replaced `Definitions` by this point (exact commit not pinned).                 |
| 2026-02-24          | `5fe176fd889`                                                             | rename AI Analytics to AI engineering (#47706)                                                                                                                                                           | **Verified.** `CATEGORY_ORDER` entry renamed.                                                                                                                                             |
| 2026-03-30          | `785eaa349e2`                                                             | Update Products panel root from custom-products:// to products:// (#52809)                                                                                                                               | _Subject only._                                                                                                                                                                           |
| 2026-04-15          | `2706b5d0fef`                                                             | feat(growth): refactor cross-sell into weighted candidate selector (#53516)                                                                                                                              | **Verified (blame).** Adds the `ProductItemCategory` enum; manifests switch from strings to enum values.                                                                                  |
| 2026-05-28          | `9e1916fec48`                                                             | group logs, tracing, and error tracking under App monitoring (#60277)                                                                                                                                    | **Verified.** New `App monitoring` between Behavior and Features; Error tracking (from Behavior), Logs, Tracing (from Unreleased) move in.                                                |
| 2026-06-24          | `e09da09dbd0`                                                             | refactor(tools): Rename `apps` to `tools` throughout (#65674)                                                                                                                                            | _Subject only._ The "Apps" label from #37153 becomes "Tools".                                                                                                                             |
| 2026-07-14 to 07-29 | `45350ed376b`, `38fd1555e84`, `86fc21f3faf`, `38caef0e16e`, `69ded3864cc` | simplify tools list for small selections; hide category headers at 5 or fewer items; remove `pinnedByDefault` auto-pin; fixed default product set; per-user sidebar customization via `ui_configuration` | _Subject only._ Sidebar customization rework; matches today's `DEFAULT_PRODUCT_PATHS` and `SIDEBAR_CUSTOMIZABLE_SECTIONS`.                                                                |
| 2026-09-02 to 09-22 | `7e30c2561ea`, `c2f8f51dd97`, `aaa209dd834`                               | flat sidebar behind the flat-nav flag (#92011); product shortcut buttons in the flat sidebar (#103226); gate apps and files behind simple-sidepanel (#104714)                                            | _Subject only_, except that blame ties `aaa209dd834` to exporting `DATA_MANAGEMENT_PANEL_ORDER`, which `appsCatalog.ts` uses. Two parallel sidebar experiments running now.               |

Products that moved between categories (examples):

- Logs: Tools, then Unreleased (`998f0b10784`, verified), then Tools (`cf7f0bbfc5c`, #42263) and Behavior (`e60eee781b1`, #42366) (subject only), then App monitoring (`9e1916fec48`, verified).
- Error tracking: Behavior, then App monitoring (`9e1916fec48`, verified).
- Tracing: Unreleased, then App monitoring (`9e1916fec48`, verified).
- Workflows / messaging: Unreleased (`998f0b10784`, verified), then Tools (`05cd6e38abf`, #40963, subject only).
- Endpoints: Unreleased, then Tools (`21a7ed3acc0`, #46409, subject only).
- Support: into Behavior (`b91df3d0b59`, #46180, subject only).

What the history says:

- The category set changed 5 times in 15 months (June 2025, September 2025, February 2026 twice, May 2026), and the panel name changed twice (Products, Apps, Tools).
- The stable categories are Analytics, Behavior, Features and Tools; the new ones each came from a product area outgrowing its old home (AI, monitoring).
- Tools has been the landing spot for anything that fits nowhere else since the first version.
- Per-user selection (custom sidebar, then "My Tools" with 5 defaults) has been the direction since November 2025, which is the "installed apps" half of an app store.

Not checked: the diffs of _subject only_ rows; the commit that introduced `Schema`, and the short-lived `Activity` and `Development` categories; `navigation-3000` history before March 2025.

## Candidate app-store category schemes

No decision here; these are options for the human to pick from or mix.
Each is built from the 51 product entries plus the data tools in `03-app-catalog.json`.
All three keep system surfaces (Home, Self-driving, Activity, Search, PostHog AI, Notifications, Settings, Help, Files, Data management, Persons/Cohorts, Billing) out of the store; they are OS chrome or preinstalled system apps.
All three treat `Unreleased` / `alpha` as a store section ("Labs"), not a category, since that is a lifecycle state and every such entry already has a flag.

### Scheme A: today's categories, with the catch-all split

Smallest change; every existing `category` value maps 1:1 except `Tools`.

| Store category                             | Apps                                                                                                                                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Analytics                                  | Product analytics, Web analytics, Dashboards, Customer analytics, Marketing analytics, SQL editor, Data catalog                                                                         |
| Behavior                                   | Session replay, Heatmaps, Replay vision, Surveys, Product tours, Support                                                                                                                |
| Features                                   | Feature flags, Experiments, Early access features                                                                                                                                       |
| App monitoring                             | Error tracking, Logs, Metrics, Tracing                                                                                                                                                  |
| AI engineering                             | LLM analytics (with Playground, Clusters, Datasets, Evaluations, Taggers, Prompts), AI gateway, MCP analytics, MCP servers, Business knowledge                                          |
| Automation and messaging (new, from Tools) | Workflows, Broadcasts, Web scripts                                                                                                                                                      |
| Developer tools (new, from Tools)          | Endpoints, Toolbar, Wizard, Skills, Tasks                                                                                                                                               |
| Data (the Data panel as one category)      | Sources, Destinations, Transformations, Warehouse destinations, Models, Managed migrations, Event ingestion filtering and warnings; schema tools stay in the Data management system app |
| Labs (section)                             | the 10 Unreleased entries plus alpha-tagged ones                                                                                                                                        |

Pros: category keys already exist in `ProductItemCategory`; minimal migration; sidebar and store stay in sync.
Cons: inherits the current topic boundaries, which the history above shows keep moving.

### Scheme B: by the job the user is doing

Groups by the question a user brings, which suits a store read by people who do not know PostHog's product names yet.

| Store category           | Apps                                                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Understand usage         | Product analytics, Web analytics, Dashboards, Customer analytics, Marketing analytics, Notebooks                                  |
| Watch and ask users      | Session replay, Heatmaps, Replay vision, Surveys, User research, Support                                                          |
| Ship and test            | Feature flags, Experiments, Early access features, Product tours, Links                                                           |
| Keep production healthy  | Error tracking, Logs, Metrics, Tracing, Live debugger, Engineering analytics, Code review, Visual review                          |
| Build with AI            | LLM analytics suite, AI gateway, MCP analytics, MCP servers, Business knowledge, Skills, Tasks                                    |
| Automate and reach users | Workflows, Broadcasts, Web scripts, Destinations                                                                                  |
| Query and move data      | SQL editor, Data warehouse, Data catalog, Endpoints, Models, Sources, Transformations, Warehouse destinations, Managed migrations |

Pros: stable against product renames; each category has 5-9 apps (today's range is 3-11).
Cons: needs a new `category` field (or a store-only mapping) that diverges from the sidebar enum; some apps fit two jobs (Notebooks, Endpoints), so the store needs a primary category plus tags.

### Scheme C: suites and lifecycle, not topics

Collapse multi-entry folders into one app each (one window with its own tabs), then sort the store by lifecycle rather than topic.

- **Suites**: "AI observability" (the 7 `products/ai_observability` entries), "Data warehouse" (SQL editor, Models, Sources, Warehouse destinations, Managed viewsets), "Data pipelines" (`products/cdp`: Destinations, Transformations, Web scripts, filtering, warnings), "Workflows" (Workflows, Broadcasts), "Session replay" (Replay, Heatmaps).
  This takes the store from 51 + 19 entries down to roughly 35 apps.
- **Store sections**: Installed (the user's `UserProductList` rows), Core (the 5 `DEFAULT_PRODUCT_PATHS`), More apps (the rest of GA), Beta, Labs (alpha and Unreleased, flag-gated).
- Topic appears only as a filter chip, using today's `ProductItemCategory` values.

Pros: maps one app to one window, which the OS shell needs anyway (see the shared `sceneKeys` note above); reuses `UserProductList` as "installed" with no new model; the store never needs regrouping when a topic boundary moves.
Cons: "suite" boundaries are a new decision per folder; a suite window needs internal navigation, which today's sidebar provides.
