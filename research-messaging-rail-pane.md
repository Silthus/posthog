# Can the new rail switch to a Messaging pane?

**Verdict: feasible with a Surfaces change.** The existing `today-rail-nav` shell can select a Messaging sidebar when someone enters Messaging, using the same route-to-pane mechanism as Analytics. Product manifests cannot register a pane today. The smallest implementation adds one explicit pane to the shared shell and renders a product-owned sidebar inside it. A general manifest extension system, the Warehouse PR, and a navigation redesign are unnecessary prerequisites. The remaining decisions are the entry point, its landing page, and which routes belong to Messaging, especially routes shared with automations. Sources: [shell routing][shell-routing], [shell rendering][shell-rendering], [manifest contract][manifest-contract].

Researched on 2026-10-28 against public `master` at `d4515d38b543ae5ac2e3a4b49dffe94fcc82014f`. Warehouse PR [#113361](https://github.com/PostHog/posthog/pull/113361) is **open**, inspected at head `fa3ed18427a99b286ad80155bd9a974d97340e12`. Recommendations below are proposals, not an agreed design or a shipped implementation. This branch changes only this note.

The research branch starts at the fork's `master`, `9c16efd0029a771f25ce6d0d599d94c1c9a2f235`; its source citations intentionally point to the newer upstream snapshot inspected above.

## What the shell supports today

| Concern          | Current implementation                                                                           | Consequence for Messaging                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Pane identity    | `TodayRailPane` is the closed union `home`, `spaces`, `analytics`, `products`, `settings`.       | Add `messaging` in shared code.                                              |
| Pane selection   | `railPaneForPath` removes the project prefix and chooses a pane before falling back to Products. | Match Messaging routes before the Products fallback, so deep links work too. |
| Pane content     | `TodayShell` explicitly lazy-loads and selects each sidebar component.                           | Add an explicit branch that loads the product's sidebar.                     |
| Rail metadata    | `TODAY_PANES` and `TODAY_RAIL_PANES` define labels, icons, actions, and visible tiles.           | A dedicated Messaging rail tile requires a shared registration.              |
| Product metadata | `ProductManifest` defines scenes, routes, URLs, filesystem types, and tree items.                | None of these declares a pane component or route-to-pane association.        |

Sources: [pane union, destination map, and route selection][shell-routing], [shell imports and rendering][shell-rendering], [rail metadata][rail-items], [manifest contract][manifest-contract].

`TodayProductsPane` wraps `TodayProductsSidebar` in a preview provider. The sidebar renders individual product rows under pinned, starred, and category sections. `todayProductsLogic` obtains them from `getNavProductItems`; a category heading is not a nested product pane. `searchTabs` creates search results rather than sidebar children. Renaming a category to Messaging or adding `searchTabs` therefore cannot switch the sidebar. Sources: [pane wrapper][products-pane], [sidebar rows][products-sidebar], [Products selectors][products-logic], [navigation item collection][nav-items], [search result generation][search-tabs].

Analytics is also explicitly wired into the shell. Its component contains Browse, Recents, By PostHog, and Monitor sections. Its By PostHog entries use a central list of icon types plus a special Product analytics destination, enriched from product manifests. This reuses product metadata, but does not provide a product-defined pane API. Sources: [Analytics sidebar][analytics-sidebar], [Analytics product selection][analytics-products].

## What the referenced PRs establish

| PR                                                        | State at research time | Relevant change                                                                                                                                                      | Limit of the precedent                                                                        |
| --------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [#111958](https://github.com/PostHog/posthog/pull/111958) | Merged, 2026-10-07     | Merged Library and Tools into a Products rail item and sidebar; updated shell routing and the phone tab bar.                                                         | Central shell wiring remains necessary. Its original sidebar layout has evolved since the PR. |
| [#112199](https://github.com/PostHog/posthog/pull/112199) | Merged, 2026-10-06     | Added `FileSystemType.listHref`, allowing a manifest to choose its own list page inside the Library shell, with `/library/<type>` redirects.                         | The product owns the destination and list UI, not the shell pane.                             |
| [#113361](https://github.com/PostHog/posthog/pull/113361) | Open                   | Adds a Warehouse rail tile, `/warehouse` landing page, route membership, header menu, and scene-tab sidebar behind both `today-rail-nav` and `today-rail-warehouse`. | It adds another hard-coded area; it does not make panes manifest-defined.                     |

The Warehouse PR's current UI differs from Analytics: a header menu selects the warehouse tool, and the sidebar shows that tool's mounted scene tabs. `SceneTabs` portals tabs into the sidebar and restores in-page tabs when the sidebar is unavailable. Its activation still explicitly checks `routePane === 'warehouse'`. Sources: [Warehouse shell changes][warehouse-shell], [header menu][warehouse-header], [scene-tab adapter][warehouse-tabs].

The useful pattern to borrow is a single item list that drives route membership and active-item selection, including extra route prefixes and feature/access filtering. Keep the Messaging equivalent in its product directory. A persistent list of Messaging sections can use the existing sidebar frame without the Warehouse header, layout wrapper, mounted-tab counter, or portal machinery. Sources: [Warehouse item registry and matching][warehouse-items], [existing shell frame][shell-rendering].

**Integration caveat:** the Warehouse PR filters warehouse destinations from `scenes/tools/toolsLogic.ts`, but its head's `todayProductsLogic.ts` still builds the current Products sidebar from `getNavProductItems`, without that exclusion. Do not assume the PR's claimed Products exclusion already covers today's sidebar. A Messaging implementation must check both the visible Products rows and any catalog it intends to change. Sources: [Warehouse Tools filter][warehouse-tools], [Products selector at the same PR head][warehouse-products]. This is a source finding, not a reproduced browser defect.

## Rail clicks and keeping the page aligned

The current implementation distinguishes a rail pick from entering a route:

- `railPaneHref` supplies landing URLs for Home, Chats, Analytics, and Settings. Products has no URL, so picking it changes the sidebar while retaining the page.
- `pickPane` navigates to the landing URL when one exists, then opens the sidebar or narrow-layout drawer. Analytics currently lands on `/analytics/product-analytics`.
- Clicking the already active rail item while its sidebar is visible toggles that sidebar instead of navigating again.
- On route changes, a recognized route normally selects its pane. Unknown routes retain the existing pane. An explicit exception keeps Products open for Analytics routes that Products also lists.

Sources: [destination map and route reconciliation][shell-routing], [click and pick listeners][shell-clicks], [existing behavior tests][shell-tests]. These are implementation facts at the pinned commit. They do not establish that every rail click changes the page, or that narrow-layout picks are navigation-free.

**Recommendation:** a Messaging rail pick should have a real landing URL and select the Messaging pane together, so the content corresponds to the selected area. Preserve the existing repeated-click toggle and let ordinary route changes handle direct links, search entries, and history. Narrow/collapsed navigation behavior and the landing page need an explicit product decision before implementation.

Discussion pointers, links only:

- [Analytics pane discussion](https://posthog.slack.com/archives/C0368RPHLQH/p1792503147401569)
- [Rail click behavior discussion](https://posthog.slack.com/archives/C09G8Q32R6F/p1793109310858179)
- [Initial route and sidebar discussion](https://posthog.slack.com/archives/C09G8Q32R6F/p1790761686918659)

For the initial-route history, public PR [#109014](https://github.com/PostHog/posthog/pull/109014) was closed without merging. Related [#108963](https://github.com/PostHog/posthog/pull/108963) merged. Treat the current route logic as authoritative rather than assuming #109014 shipped.

## Smallest implementation to discuss with Surfaces

1. Add `messaging` to `TodayRailPane`, give it a landing destination in `RAIL_PANE_HOMES`, and match its route family before Products. Keep selection behind `today-rail-nav`; any additional rollout flag must also gate entry visibility and route ownership.
2. Add its label/icon metadata in `todayRailItems.tsx`. Add it to `TODAY_RAIL_PANES` if the chosen entry is a dedicated rail tile. `TodayRail` and `TodayTabBar` already consume that array. A Products entry that opens a Messaging pane is a separate placement choice; route-driven pane selection does not itself require another top-level tile. Sources: [rail metadata][rail-items], [rail renderer][rail-renderer], [tab bar][tab-bar].
3. Add one lazy-loaded Messaging branch to `TodayShell`; put the sidebar component and its section/active-row logic under the product's `frontend/`. Reuse the shell's existing sizing, pinning, drawer, and collapse controls. Sources: [shell frame][shell-rendering], [layout selectors and listeners][shell-clicks].
4. Keep routes and URL helpers in the product manifest. Use a small product-owned list of section destinations and route aliases for the pane. The present Messaging manifest is a scaffold; current messaging routes and rows live in the Workflows manifest. Sources: [Messaging manifest][messaging-manifest], [Workflows manifest][workflows-manifest].
5. Decide whether Products keeps a Messaging gateway, retains existing shortcuts, or removes the displaced entries. Apply any new-navigation-only filter where `todayProductsLogic` builds its rows, preserving the flag-off navigation and existing feature/access gates. Source: [Products selector][products-logic].

This is a shell extension plus product UI. Making pane registration fully manifest-driven would additionally require a typed pane descriptor, generated aggregation, component loading, route precedence, visibility rules, and shared click behavior. None of that exists in the [manifest contract][manifest-contract], and it is unnecessary for one additional area.

## Boundaries and decisions still needed

**Route membership is the main functional constraint.** Current master has `/broadcasts`, `/transactional`, their template-detail aliases, and `/workflows` pages including the shared workflow editor and email-domain setup. A blanket `/workflows` match would also move automation pages into Messaging. Prefer unambiguous Messaging URLs or an explicit classification of shared routes; `railPaneForPath(pathname)` cannot distinguish two workflow types represented by the same path shape without another input. Sources: [current route definitions][workflows-manifest], [pane matcher signature][shell-routing]. This note does not settle those routes or the information architecture.

**Shared shell coordination is required; formal ownership is unrecorded.** Running `hogli owners:resolve --json` on current master reports `owners: []` and `source: null` for `todayShellLogic.ts`, `todayRailItems.tsx`, `TodayShell.tsx`, `TodayProductsPane.tsx`, `todayProductsLogic.ts`, and `frontend/src/types.ts`. The repository therefore does not substantiate a formal claim that Surfaces owns each file. These are the shared-navigation files to take to Surfaces for coordination. The resolver identifies `team-workflows` for both product manifests through their product metadata. Sources: [ownership registry][owners], [Workflows product metadata][workflows-ownership], [Messaging product metadata][messaging-ownership].

**Warehouse is a precedent, not a dependency.** Its open status and layout-specific behavior mean Messaging can use the existing shell independently. Coordinate overlapping shell edits if both changes proceed. Source: [#113361](https://github.com/PostHog/posthog/pull/113361).

## Verification and limits

The findings come from source inspection, the three public PRs and their current states, the Warehouse head's actual files, and the ownership resolver. Slack pointers were read for context; their contents are omitted from this public note. No product code, routes, manifests, or tests changed. Markdown formatting, the diff, source links, and the repository's scoped pre-push checks are the applicable checks for this research artifact. No browser behavior or new implementation is claimed as tested.

## References

[shell-routing]: https://github.com/PostHog/posthog/blob/d4515d38b543ae5ac2e3a4b49dffe94fcc82014f/frontend/src/layout/today/todayShellLogic.ts#L21-L137
[shell-rendering]: https://github.com/PostHog/posthog/blob/d4515d38b543ae5ac2e3a4b49dffe94fcc82014f/frontend/src/layout/today/TodayShell.tsx#L32-L143
[rail-items]: https://github.com/PostHog/posthog/blob/d4515d38b543ae5ac2e3a4b49dffe94fcc82014f/frontend/src/layout/today/todayRailItems.tsx
[manifest-contract]: https://github.com/PostHog/posthog/blob/d4515d38b543ae5ac2e3a4b49dffe94fcc82014f/frontend/src/types.ts#L7899-L7959
[products-pane]: https://github.com/PostHog/posthog/blob/d4515d38b543ae5ac2e3a4b49dffe94fcc82014f/frontend/src/layout/today/TodayProductsPane.tsx
[products-sidebar]: https://github.com/PostHog/posthog/blob/d4515d38b543ae5ac2e3a4b49dffe94fcc82014f/frontend/src/layout/today/TodayProductsSidebar.tsx#L21-L127
[products-logic]: https://github.com/PostHog/posthog/blob/d4515d38b543ae5ac2e3a4b49dffe94fcc82014f/frontend/src/layout/today/todayProductsLogic.ts#L146-L181
[nav-items]: https://github.com/PostHog/posthog/blob/d4515d38b543ae5ac2e3a4b49dffe94fcc82014f/frontend/src/layout/panel-layout/navbar/tabs/navProductItems.ts
[search-tabs]: https://github.com/PostHog/posthog/blob/d4515d38b543ae5ac2e3a4b49dffe94fcc82014f/frontend/src/lib/components/Search/searchListsLogic.tsx#L53-L75
[analytics-sidebar]: https://github.com/PostHog/posthog/blob/d4515d38b543ae5ac2e3a4b49dffe94fcc82014f/frontend/src/layout/today/TodayAnalyticsSidebar.tsx
[analytics-products]: https://github.com/PostHog/posthog/blob/d4515d38b543ae5ac2e3a4b49dffe94fcc82014f/frontend/src/scenes/analytics/analyticsUtils.ts#L179-L222
[warehouse-shell]: https://github.com/PostHog/posthog/blob/fa3ed18427a99b286ad80155bd9a974d97340e12/frontend/src/layout/today/todayShellLogic.ts
[warehouse-header]: https://github.com/PostHog/posthog/blob/fa3ed18427a99b286ad80155bd9a974d97340e12/frontend/src/layout/today/TodayWarehouseHeader.tsx
[warehouse-tabs]: https://github.com/PostHog/posthog/blob/fa3ed18427a99b286ad80155bd9a974d97340e12/frontend/src/layout/scenes/components/SceneTabs.tsx#L12-L45
[warehouse-items]: https://github.com/PostHog/posthog/blob/fa3ed18427a99b286ad80155bd9a974d97340e12/frontend/src/layout/today/todayWarehouseItems.ts
[warehouse-tools]: https://github.com/PostHog/posthog/blob/fa3ed18427a99b286ad80155bd9a974d97340e12/frontend/src/scenes/tools/toolsLogic.ts
[warehouse-products]: https://github.com/PostHog/posthog/blob/fa3ed18427a99b286ad80155bd9a974d97340e12/frontend/src/layout/today/todayProductsLogic.ts#L146-L153
[shell-clicks]: https://github.com/PostHog/posthog/blob/d4515d38b543ae5ac2e3a4b49dffe94fcc82014f/frontend/src/layout/today/todayShellLogic.ts#L309-L511
[shell-tests]: https://github.com/PostHog/posthog/blob/d4515d38b543ae5ac2e3a4b49dffe94fcc82014f/frontend/src/layout/today/todayShellLogic.test.ts#L95-L200
[rail-renderer]: https://github.com/PostHog/posthog/blob/d4515d38b543ae5ac2e3a4b49dffe94fcc82014f/frontend/src/layout/today/TodayRail.tsx
[tab-bar]: https://github.com/PostHog/posthog/blob/d4515d38b543ae5ac2e3a4b49dffe94fcc82014f/frontend/src/layout/today/TodayTabBar.tsx
[messaging-manifest]: https://github.com/PostHog/posthog/blob/d4515d38b543ae5ac2e3a4b49dffe94fcc82014f/products/messaging/manifest.tsx
[workflows-manifest]: https://github.com/PostHog/posthog/blob/d4515d38b543ae5ac2e3a4b49dffe94fcc82014f/products/workflows/manifest.tsx#L61-L166
[owners]: https://github.com/PostHog/posthog/blob/d4515d38b543ae5ac2e3a4b49dffe94fcc82014f/owners.yaml
[workflows-ownership]: https://github.com/PostHog/posthog/blob/d4515d38b543ae5ac2e3a4b49dffe94fcc82014f/products/workflows/product.yaml
[messaging-ownership]: https://github.com/PostHog/posthog/blob/d4515d38b543ae5ac2e3a4b49dffe94fcc82014f/products/messaging/product.yaml
