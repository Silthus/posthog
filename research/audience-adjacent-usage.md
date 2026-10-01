# Usage of features adjacent to Audience

Research for [Silthus/posthog#183](https://github.com/Silthus/posthog/issues/183), on the map [Audience in Workflows](https://github.com/Silthus/posthog/issues/181).
Code references are against `origin/master` on 2026-10-01.

## Question

How much are the features next to Audience used over the last 6 months, and does their tracking fire?
Under 100 interactions a week counts as low usage.

## Result in one paragraph

**No usage numbers.** The PostHog MCP key used for this run reaches only test and demo projects in the PostHog organization.
The project that holds PostHog's own app usage returns `404` to it.
The production database route needs an interactive staff SSO login, which a background agent cannot do.
So this file gives the signal for each feature, a verdict from the code on whether that signal can fire, and ready-to-run queries.
Running the queries in [Queries to run](#queries-to-run) fills the table.

The code tells us two things without numbers:

- **None of the adjacent features has a custom usage event.** Opt-outs, Customer.io import, opt-out preview, Suppression list, and the metrics views are measurable only through `$pageview` and autocapture in PostHog's own project.
  `eventUsageLogic` has no workflows or messaging actions, and `products/messaging/backend` calls `report_user_action` only for `message_template_created`.
- **The hosted preferences page and engagement capture are invisible in PostHog's own analytics.** Their events go to each customer's project, and only when the customer turned on `capture_workflows_engagement_events`. Measuring them needs a cross-team aggregate, not a product analytics query.

## Findings per feature

| Feature | Signal in PostHog's own project | Avg weekly interactions | 6-month trend | Tracking fires? | Low usage? |
|---|---|---|---|---|---|
| Opt-outs tab | `$pageview` on `/(workflows\|broadcasts)/opt-outs`; autocapture on `data-attr="new-optout-category"`; autocapture by text for "Search recipients", "Import CSV", "Export CSV" | Unknown | Unknown | Yes for pageviews and the new-category button. Text matches need local confirmation. | Unknown |
| Import from Customer.io, CSV opt-out import | Autocapture by text "Import from Customer.io"; autocapture on input `data-attr="customerio-api-key"`; text "Import CSV" | Unknown | Unknown | Clicks only. No event for a finished import. Text matches need local confirmation. | Unknown |
| Preview opt-out page | Autocapture by text "Preview opt-out page" | Unknown | Unknown | Click only. The opened page loads no posthog-js, so no pageview follows. Needs local confirmation. | Unknown |
| Suppression list tab | `$pageview` on `/(workflows\|broadcasts)/suppression`; autocapture by text "Add address", "Remove", placeholder "Search addresses" | Unknown | Unknown | Yes for pageviews. Add and remove have no data-attr. | Unknown |
| Broadcast performance, workflow metrics | `$pageview` on `/workflows/<id>/metrics` and `/broadcasts/<id>`; autocapture on `broadcast-summary-tab-*` and inside `data-attr="workflow-metrics"` | Unknown | Unknown | Yes. The broadcast overview tab is reducer state, not a URL, so a pageview of `/broadcasts/<id>` is the closest proxy. | Unknown |
| Hosted unsubscribe and preferences page, `$email_tracking` consent | None in PostHog's own project. `$workflows_email_unsubscribed` and `$workflows_email_tracking_consent_updated` land in the customer's project. | Unknown | Unknown | Only for teams with engagement capture on. The consent toggle shows only when `email_tracking_consent_mode` is not `off`. | Unknown |
| `capture_workflows_engagement_events` | No event on toggle (activity log only). Team count comes from the `workflows_teamworkflowsconfig` table. | n/a | n/a | n/a | Teams with it on: unknown |

### Opt-outs tab

- Routes: `/workflows/opt-outs` and `/broadcasts/opt-outs`, defined in [`products/workflows/manifest.tsx`](../products/workflows/manifest.tsx) (lines 49-65), not in `frontend/src/scenes/urls.ts`.
- The scene container has `data-attr="opt-out-scene"` ([`OptOutScene.tsx:22`](../products/workflows/frontend/OptOuts/OptOutScene.tsx)), so every autocaptured click inside the tab carries it in `elements_chain`.
- The header "New category" button has `data-attr="new-optout-category"` ([`MessagingTabActions.tsx:136`](../products/workflows/frontend/MessagingTabActions.tsx)). The empty-state "Create category" button has none.
- "Search recipients", "Add opt-out", "Import CSV", and "Export CSV" have no data-attr ([`OptOutList.tsx:145-178`](../products/workflows/frontend/OptOuts/OptOutList.tsx)).
- API actions: `messaging_categories` `list`/`create`/`partial_update`; `messaging_preferences` `opt_outs`, `add_opt_out`, `remove_opt_out`, `export_opt_outs_csv`, `bulk_add_opt_outs` ([`message_preferences.py`](../products/messaging/backend/api/message_preferences.py)). None calls `report_user_action`.

### Import from Customer.io and CSV opt-out import

- The "Import from Customer.io" buttons have no data-attr ([`OptOutScene.tsx:27`](../products/workflows/frontend/OptOuts/OptOutScene.tsx), `OptOutCategories.tsx:139`). The modal's API key input has `data-attr="customerio-api-key"` (`CustomerIOImportModal.tsx:134`).
- Endpoints: `messaging_categories/import_from_customerio/` and `messaging_categories/import_preferences_csv/` ([`message_categories.py`](../products/messaging/backend/api/message_categories.py), lines 76 and 329). Both run inside the request, with no task and no usage event.
- The sync config actions (`optout_sync_config`, `save_webhook_config`, `save_track_config`) and the inbound webhook view also emit nothing.
- An import's outcome is visible only as `MessageCategory` and `MessageRecipientPreference` rows, which a database aggregate can count.

### Preview opt-out page

- The button has no data-attr ([`OptOutScene.tsx:36-49`](../products/workflows/frontend/OptOuts/OptOutScene.tsx)). It calls `messaging_preferences/generate_link/` and opens `/messaging-preferences/<token>/` in a new tab.
- The same endpoint serves each opt-out row's menu, so API logs cannot tell the two apart.
- The preferences templates under `posthog/templates/message_preferences/` load no posthog-js, so the opened page produces no pageview in PostHog's own project.

### Suppression list tab

- Routes: `/workflows/suppression` and `/broadcasts/suppression`. Container `data-attr="suppression-scene"` ([`SuppressionScene.tsx:5`](../products/workflows/frontend/Suppression/SuppressionScene.tsx)).
- "Search addresses", "Add address", "Remove", and refresh have no data-attr ([`SuppressionList.tsx`](../products/workflows/frontend/Suppression/SuppressionList.tsx)).
- API: `messaging_suppressions` `suppressions`, `add_suppression`, `remove_suppression` ([`message_suppression.py`](../products/messaging/backend/api/message_suppression.py)). No usage event.
- `MessageSuppression.source` separates `MANUAL` rows (added on this tab) from `BOUNCE` and `COMPLAINT` rows, so a database count of manual rows measures the add action's outcome.

### Broadcast performance and workflow metrics

- Workflow metrics: route `/workflows/<id>/metrics`, container `data-attr="workflow-metrics"` (`Workflows/WorkflowMetrics.tsx:155`).
- Broadcast summary: tabs `broadcast-summary-tab-overview`, `-content`, `-runs` are reducer state under `/broadcasts/<id>`. Other data-attrs: `broadcast-performance-retry`, `broadcast-sent-search`, `broadcast-sent-load-more`, `broadcast-view-recipient-email`.
- Both views query `app_metrics` through `/api/environments/:id/query/` with the query tag `scene: 'HogFunction'` ([`appMetricsLogic.ts`](../frontend/src/lib/components/AppMetrics/appMetricsLogic.ts)), so query logs cannot attribute them to broadcasts.
- Nearby custom events exist for the launch only: `broadcast launched`, `broadcast launch blocked`, `broadcast launch failed` (`broadcastWizardLogic.ts`).

### Hosted unsubscribe and preferences page

- Views: `preferences_page` (GET/POST `/messaging-preferences/<token>/`) and `update_preferences` (POST `/messaging-preferences/update`) in [`posthog/views.py`](../posthog/views.py) (lines 607 and 706).
- `report_workflows_email_unsubscribed` ([`posthog/views.py:521`](../posthog/views.py)) captures `$workflows_email_unsubscribed` with `capture_internal(token=team.api_token)`, so the event lands in the **customer's** project.
  It returns early unless `team.workflows_config.capture_workflows_engagement_events` is on.
  It fires only on a real transition: one-click when the recipient was not already opted out of everything, the page form for newly opted-out known categories.
  `distinct_id` is the recipient's email address.
- The code path can fire. Zero events for a team means the setting is off or nobody unsubscribed, not broken tracking.
- `$email_tracking` is a per-recipient consent stored on `MessageRecipientPreference`, not a topic.
  The toggle appears only when the team's `email_tracking_consent_mode` is not `off` (`preferences.html:52-75`).
  A change emits `$workflows_email_tracking_consent_updated` under the same gate ([`posthog/views.py:577`](../posthog/views.py)).

### `capture_workflows_engagement_events`

- `TeamWorkflowsConfig.capture_workflows_engagement_events`, `BooleanField(default=False)` ([`team_workflows_config.py:14`](../products/workflows/backend/models/team_workflows_config.py)), on the team extension reached through `Team.workflows_config`. Added on 2026-06-05.
- It gates nine events: `$workflows_email_sent`, `_failed`, `_delivered`, `_opened`, `_link_clicked`, `_bounced`, `_blocked` (Node.js email and tracking services), plus `_unsubscribed` and `_tracking_consent_updated` (Python views).
- Toggling it writes the activity log only. No `report_user_action`, and the settings switch has no data-attr. Adoption is countable only from the table.

## What the numbers would change for Audience

The spec has to decide whether the MVP moves Opt-outs and Suppression list into Audience. These cut-offs make the numbers decide it:

- **Opt-outs tab pageviews at or above 100 a week:** moving it breaks a habit. Redirect the old URLs and move it whole.
- **Opt-outs tab under 100 a week:** low risk either way. Move only the marketing opt-out list into the recipient view and leave category management where it is.
- **Customer.io import and CSV import near zero:** do not carry them into the Audience setup screen. Keep them behind a menu.
- **Preview opt-out page near zero:** drop it from Audience, or replace it with a preview on the recipient detail.
- **Suppression list under 100 a week:** show suppression as a recipient state in Audience and keep the old tab as a redirect. Manual adds are the only write.
- **Few teams with engagement capture on:** the Audience engagement tab must lead with the `app_metrics` fallback and an enable step. The `$workflows_email_*` insight tiles stay empty for most teams.

## Queries to run

### PostHog's own project (product analytics)

Run in the project that receives the PostHog app's own events.
It counts weekly interactions per feature over 26 weeks.
Text matches assume `LemonButton` puts its label on the clicked element's text in `elements_chain`. Confirm locally before trusting zeros.

```sql
SELECT
    toStartOfWeek(timestamp) AS week,
    countIf(event = '$pageview' AND match(properties.$pathname, '/(workflows|broadcasts)/opt-outs$')) AS opt_outs_views,
    countIf(event = '$autocapture' AND match(elements_chain, 'attr__data-attr="opt-out-scene"')) AS opt_outs_clicks,
    countIf(event = '$autocapture' AND match(elements_chain, 'attr__data-attr="new-optout-category"')) AS new_category_clicks,
    countIf(event = '$autocapture' AND match(elements_chain, 'text="Import from Customer.io"')) AS customerio_import_clicks,
    countIf(event = '$autocapture' AND match(elements_chain, 'text="Import CSV"')) AS csv_import_clicks,
    countIf(event = '$autocapture' AND match(elements_chain, 'text="Export CSV"')) AS csv_export_clicks,
    countIf(event = '$autocapture' AND match(elements_chain, 'text="Preview opt-out page"')) AS preview_page_clicks,
    countIf(event = '$pageview' AND match(properties.$pathname, '/(workflows|broadcasts)/suppression$')) AS suppression_views,
    countIf(event = '$autocapture' AND match(elements_chain, 'attr__data-attr="suppression-scene"')) AS suppression_clicks,
    countIf(event = '$pageview' AND match(properties.$pathname, '/workflows/[^/]+/metrics$')) AS workflow_metrics_views,
    countIf(event = '$autocapture' AND match(elements_chain, 'attr__data-attr="broadcast-summary-tab-')) AS broadcast_summary_tab_clicks
FROM events
WHERE timestamp >= now() - INTERVAL 26 WEEK
    AND event IN ('$pageview', '$autocapture')
GROUP BY week
ORDER BY week
```

### Cross-team aggregates (production, staff access)

Report totals only, never per-team rows.

```sql
-- ClickHouse: hosted page events that reached customer projects, per week
SELECT
    toStartOfWeek(timestamp) AS week,
    countIf(event = '$workflows_email_unsubscribed') AS unsubscribes,
    countIf(event = '$workflows_email_tracking_consent_updated') AS consent_changes,
    uniqIf(team_id, event = '$workflows_email_unsubscribed') AS teams_with_unsubscribes
FROM events
WHERE timestamp >= now() - INTERVAL 26 WEEK
    AND event IN ('$workflows_email_unsubscribed', '$workflows_email_tracking_consent_updated')
GROUP BY week
ORDER BY week
```

```sql
-- Postgres: engagement capture and consent mode adoption
SELECT
    count(*) FILTER (WHERE capture_workflows_engagement_events) AS teams_capturing_engagement,
    count(*) FILTER (WHERE email_tracking_consent_mode <> 'off') AS teams_with_consent_mode
FROM workflows_teamworkflowsconfig;

-- Postgres: outcomes of the Opt-outs and Suppression tabs
SELECT count(DISTINCT team_id) AS teams_with_categories, count(*) AS categories
FROM posthog_messagecategory WHERE NOT deleted;

SELECT source, count(*) AS rows, count(DISTINCT team_id) AS teams
FROM posthog_messagesuppression GROUP BY source;
```

## Blocker

Filling the table needs one of these:

- A PostHog MCP connection with access to the project that holds PostHog's own app usage, to run the first query.
- Michael logging in to the internal production query route, so an agent can run the cross-team aggregates.

## Sources

- Repository code at `origin/master`, files linked above.
- PostHog MCP `projects-get` and `switch-project` results for this run's key, on 2026-10-01.
