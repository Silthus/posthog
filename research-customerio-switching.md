# What would it take to switch from Customer.io to Workflows?

Research for [Silthus/posthog#213](https://github.com/Silthus/posthog/issues/213), part of the map [#210](https://github.com/Silthus/posthog/issues/210).
Evidence: code in this repository at `cf416e95b7c` and public Customer.io docs, including the App API OpenAPI spec (`https://docs.customer.io/files/journeys-app.json`, fetched 2026-10-03).
No usage, revenue or customer data went into this file. Guesses are marked **(guess)**.

## Short answer

A Customer.io team can move to Workflows today, but almost all of the move is manual.
PostHog already imports a Customer.io team's **opt-out state** (topics, per-topic preferences, global unsubscribes) and can keep it in sync both ways during a parallel run.
It imports **nothing that sends**: no message content, no snippets, no suppressions, no people, no workflows.

Customer.io's public App API exposes most of what is missing:
message bodies and subjects for automations, broadcasts, newsletters and transactional messages, snippets, ESP suppressions, segment definitions and people exports.
The one thing it does not expose is the **shape of an automation**: delays, true/false branches and other flow control blocks are not in the API.
So workflows cannot be imported 1:1 by any tool. They are rebuilt, by a person or by an agent.

**Smallest switching path worth a map:** a "Customer.io import v2" that extends the existing four-step import modal with
(1) message content imported as Liquid `MessageTemplate`s with variables rewritten,
(2) ESP suppressions imported into the suppression list,
(3) a sender checklist from Customer.io sender identities,
and (4) an agent skill that drafts each automation as a draft workflow from its trigger, its messages and their order, through the MCP tools that already exist.
People and events are out of the importer: most target teams already send events to PostHog, and the rest need a capture-based path, not a new import product.

## Import matrix

"Export" is what Customer.io gives out. "Target" is where it lands in PostHog. "Today" is what the code does now.

| Customer.io asset                                         | Export from Customer.io                                                                                                                            | PostHog target                                                                                       | Today                                                                                            | Gap                                                                                                                                                               |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Subscription topics                                       | App API `GET /v1/subscription_topics`                                                                                                              | `MessageCategory` (key `customerio_<identifier>`)                                                    | **Imported** (API, step 1 of the modal)                                                          | None                                                                                                                                                              |
| Per-person topic preferences                              | People CSV export, column `cio_subscription_preferences` (stringified JSON)                                                                        | `MessageRecipientPreference.preferences[<category id>]`                                              | **Imported** (CSV, step 2)                                                                       | Channel preferences (`channels.email`, `channels.push`) are ignored                                                                                               |
| Global unsubscribes                                       | App API customer search on `unsubscribed = true`                                                                                                   | Preferences                                                                                          | **Imported** (API, step 1)                                                                       | Compliance note on how global unsubscribes are stored, ask Michael                                                                                                |
| Live preference changes                                   | Reporting webhook (`cio_subscription_preferences_changed`, `subscribed`, `unsubscribed`)                                                           | Preferences                                                                                          | **Synced in** (step 3)                                                                           | None for a parallel run                                                                                                                                           |
| Preference changes made in PostHog                        | n/a                                                                                                                                                | Customer.io Track API                                                                                | **Synced out** (step 4)                                                                          | None for a parallel run                                                                                                                                           |
| ESP suppressions (bounces, blocks, spam reports, invalid) | App API `GET /v1/esp/suppression/{type}`, 1000 per page, per sending domain                                                                        | `MessageSuppression`                                                                                 | **Not imported**                                                                                 | The suppression API adds one address per call; no bulk import                                                                                                     |
| People and attributes                                     | App API `POST /v1/exports/customers`, People CSV export, or the S3/GCS Parquet warehouse export (`people`, `attributes`)                           | Persons and person properties                                                                        | **Not imported**                                                                                 | Warehouse person-property sync and cohort CSV upload only match **existing** persons; nothing creates persons from an import                                      |
| Segments                                                  | App API `GET /v1/segments/{id}` returns `conditions`                                                                                               | Cohorts                                                                                              | **Not imported**                                                                                 | Condition language differs; a translation is per-attribute work (guess: agent-assisted at best)                                                                   |
| Automations (campaigns): trigger                          | `GET /v1/campaigns/{id}`: `type` (segment, event, form, date, relationship, object, webhook), `event_name`, `trigger_segment_ids`, filters         | Workflow trigger                                                                                     | **Not imported**                                                                                 | Event and webhook map directly; segment entry, date and form triggers have no 1:1 trigger (see below)                                                             |
| Automations: message steps                                | `GET /v1/campaigns/{id}/actions` returns `subject`, `body`, `from`, `preheader_text`, `layout`, `parent_action_id` per message action and language | `function_email`, `function_sms`, `function_push`, `function` steps                                  | **Not imported**                                                                                 | Content is fully exportable                                                                                                                                       |
| Automations: delays, branches, flow control               | **Not exported.** The spec says the actions endpoint returns "actions that have content ... not delays or flow control blocks like t/f branches"   | `delay`, `conditional_branch`, `wait_until_condition`, `random_cohort_branch`                        | n/a                                                                                              | Must be rebuilt by hand or inferred                                                                                                                               |
| Broadcasts and newsletters                                | `GET /v1/newsletters/{id}/contents/{content_id}`, broadcast actions                                                                                | Broadcasts (batch-triggered workflows) and templates                                                 | **Not imported**                                                                                 | Content exportable                                                                                                                                                |
| Transactional messages                                    | `GET /v1/transactional/{id}/contents`                                                                                                              | Templates; sending API is [#216](https://github.com/Silthus/posthog/issues/216)                      | **Not imported**                                                                                 | Content exportable; caller code must change                                                                                                                       |
| Snippets                                                  | `GET /v1/snippets` (name, value)                                                                                                                   | No snippet concept in templates                                                                      | **Not imported** (the warehouse source only lands them as a table)                               | Inline at import time, or add snippets                                                                                                                            |
| Layouts / Design Studio                                   | Design Studio `GET /v1/design_studio/emails/{id}`; no layouts endpoint                                                                             | Unlayer design or raw HTML                                                                           | **Not imported**                                                                                 | Raw HTML works: templates wrap it in one Unlayer HTML block                                                                                                       |
| Sender identities                                         | `GET /v1/sender_identities`                                                                                                                        | Email integration plus DNS verification                                                              | **Not imported** (warehouse table only)                                                          | Every domain must be verified again before sending ([#211](https://github.com/Silthus/posthog/issues/211), [#225](https://github.com/Silthus/posthog/issues/225)) |
| Delivery history and metrics                              | `POST /v1/exports/deliveries`, warehouse export (`deliveries`, `metrics`)                                                                          | Data warehouse                                                                                       | **Partly**: the Customer.io warehouse source captures reporting-webhook events from setup onward | No backfill of history; not needed to send                                                                                                                        |
| Event history                                             | Warehouse export `events`, 30 days only                                                                                                            | Events                                                                                               | **Not imported**                                                                                 | Matters only for teams that never sent events to PostHog                                                                                                          |
| Objects and relationships                                 | Warehouse export `objects`, `object_attributes`                                                                                                    | Groups; batch audience `accounts`                                                                    | **Not imported**                                                                                 | Model differs (guess: rare among the first target teams)                                                                                                          |
| Channels: email, SMS, push, webhook, Slack, WhatsApp      | n/a                                                                                                                                                | Email, Twilio SMS, native push, webhooks and destination functions (Slack, WhatsApp templates exist) | Supported                                                                                        | In-app messages have no Workflows step                                                                                                                            |

## What already exists in the code

**The Customer.io opt-out import is a four-step coexistence kit.**
`products/workflows/frontend/OptOuts/CustomerIOImportModal.tsx` walks four steps, each backed by `products/messaging/backend/api/message_categories.py` and stored on `OptOutSyncConfig` (`products/messaging/backend/models/optout_sync_config.py`):

1. App API import (`import_from_customerio`): topics become `MessageCategory` rows and globally unsubscribed customers become opted out (`products/messaging/backend/services/customerio_import_service.py`).
2. CSV upload (`import_preferences_csv`): reads `email` and `cio_subscription_preferences` and writes per-topic opt-outs. It only reads `topics`, not `channels`.
3. Inbound reporting webhook (`products/messaging/backend/api/customerio_webhook.py`): preference changes in Customer.io flow into PostHog, HMAC-verified.
4. Outbound Track sync (`products/messaging/backend/services/customerio_sync_service.py`): preference changes in PostHog flow back to Customer.io, marketing categories only.

Steps 3 and 4 make a parallel run safe for preferences: a person who unsubscribes on either side stays unsubscribed on both.

**The Customer.io data warehouse source** (`products/warehouse_sources/backend/temporal/data_imports/sources/customer_io/`) lands App API list endpoints as tables (`broadcasts`, `campaigns`, `collections`, `newsletters`, `object_types`, `segments`, `sender_identities`, `snippets`, `subscription_topics`, `transactional`) and reporting-webhook events (`email_events`, `push_events`, `sms_events`, and more).
It is analytics only: it has no people table, it does not fetch message bodies (list endpoints only), and nothing turns its tables into Workflows objects.

**The Customer.io destination** (`posthog/cdp/templates/customerio/template_customerio.py`) sends PostHog events and identifies to Customer.io.
During a parallel run it keeps Customer.io fed from PostHog, so a team can move one automation at a time.

**Templates accept raw HTML.** `MessageTemplate.content` holds `email.subject`, `email.html`, `email.text`, an optional Unlayer `design` and `templating: liquid | hog` (`products/messaging/backend/api/message_templates.py`).
HTML without a design is wrapped in a single Unlayer HTML block (`build_html_wrap_design` in `posthog/cdp/validation.py`, mirrored by `buildHtmlWrapDesign` in `frontend/src/scenes/hog-functions/email-templater/emailTemplaterLogic.tsx`).
So an imported Customer.io HTML body opens in the editor instead of a blank canvas.

**Workflows are already writable by agents.** `products/workflows/mcp/tools.yaml` exposes `hog-flows-create`, `broadcasts-create` (always as a draft), batch jobs and templates.
The generated tool description documents the full step config: triggers, `delay`, `conditional_branch`, `wait_until_condition`, `random_cohort_branch`, and `function_email`.

## Liquid: what has to be rewritten

Both sides use Liquid. PostHog renders templates with LiquidJS against the invocation globals (`nodejs/src/cdp/utils/liquid.ts`), so a template sees `person`, `event`, `groups`, `project` and the per-send `unsubscribe_url` (`nodejs/src/cdp/services/hog-inputs.service.ts`).
Customer.io adds its own objects, tags and filters ([Liquid syntax list](https://docs.customer.io/messaging/liquid/tag-list/), [Personalize messages with Liquid](https://docs.customer.io/messaging/liquid/using-liquid/)).

| Customer.io                                                                                              | PostHog equivalent                                                                                   | Rewrite                            |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `{{ customer.<attr> }}`                                                                                  | `{{ person.properties.<attr> }}`                                                                     | Mechanical                         |
| `{{ event.<attr> }}` (event-triggered)                                                                   | `{{ event.properties.<attr> }}`                                                                      | Mechanical                         |
| `event_name`, `event_timestamp`                                                                          | `event.event`, `event.timestamp`                                                                     | Mechanical                         |
| `{{ trigger.<attr> }}` (webhook, API broadcast, transactional)                                           | Webhook trigger payload under `event.properties` (guess: verify per trigger type)                    | Mechanical once confirmed          |
| `{{ journey.<attr> }}`                                                                                   | No journey variables                                                                                 | Manual                             |
| `{% unsubscribe_url %}`, `{% manage_subscription_preferences_url %}`                                     | `{{ unsubscribe_url }}` (opens the preferences page)                                                 | Mechanical                         |
| `{{ snippets.<name> }}`                                                                                  | None                                                                                                 | Inline the snippet value at import |
| `{% view_in_browser_url %}`, `{% cio_link %}`, `{% tracking_consent_url %}`                              | None                                                                                                 | Drop or flag                       |
| Filters `add_day`, `currency`, `format_number`, `timezone`, `{% render_liquid %}`, `{% generate_uuid %}` | Not registered in PostHog's LiquidJS setup (guess from `liquid.ts`; unknown filters act as identity) | Flag for review                    |

A rewriter that handles the mechanical rows and flags the rest covers the common case: personalized subject, body, footer and unsubscribe link (guess, based on typical lifecycle templates).

## Triggers: where the models differ

Customer.io automation trigger types, from the App API `campaignObject.type`: `segment`, `event`, `form`, `date`, `relationship`, `object`, `webhook`.
Workflows trigger types, from `nodejs/src/cdp/schema/hogflow.ts`: `event`, `webhook`, `manual`, `tracking_pixel`, `schedule`, `batch`, `data-warehouse-table`, `data-warehouse-view`, `internal-event`.

| Customer.io trigger                            | Workflows                                                                                                                                       | Fit                                                                             |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Event                                          | `event` trigger with event and property filters                                                                                                 | Direct                                                                          |
| Webhook                                        | `webhook` trigger                                                                                                                               | Direct                                                                          |
| Segment entry ("when someone joins segment X") | No entry trigger. Cohort membership is available in `conditional_branch` and `wait_until_condition`, and as a cohort filter on an event trigger | Gap; the behavior side is [#215](https://github.com/Silthus/posthog/issues/215) |
| Date ("N days before `renewal_at`")            | `schedule` + `batch`, or an event trigger followed by `delay_until` on a person property                                                        | Workable, not 1:1                                                               |
| Form                                           | Surveys or a `webhook` trigger                                                                                                                  | Workable                                                                        |
| Object, relationship                           | `batch` with `audience_type: accounts`                                                                                                          | Partial                                                                         |

Delays cap at 30 days per step in Workflows (tool description in `services/mcp/src/api/generated.ts`).
Long Customer.io waits need chained delays or `delay_until`.

## Switching paths

### Path 0: what a team does today

1. Verify the sending domain in PostHog ([#211](https://github.com/Silthus/posthog/issues/211), [#225](https://github.com/Silthus/posthog/issues/225)) and check sending caps ([#214](https://github.com/Silthus/posthog/issues/214)).
2. Make sure every recipient is a PostHog person with an `email` property. Teams already on PostHog mostly are; others send `$identify` with `$set` from their backend.
3. Run the four-step opt-out import and turn on both syncs.
4. Re-add ESP suppressions one address at a time, or skip them and risk bounces on the new domain.
5. Copy each message's HTML into a new template, rewrite the Liquid by hand.
6. Rebuild each automation in the editor, and turn off its Customer.io twin.
7. Change transactional callers to PostHog's sending path ([#216](https://github.com/Silthus/posthog/issues/216)).

Steps 4 to 6 scale with the size of the Customer.io workspace and carry most of the effort and risk (guess: days for a team with a few dozen automations).

### Path 1, recommended: Customer.io import v2

Extend the existing modal; do not start a new surface. It already holds the App API key (`Integration(kind="customerio-app")`).

1. **Content import.** Pull message actions of automations, broadcasts, newsletters and transactional messages. Create one `MessageTemplate` per message and language, `templating: liquid`, HTML wrapped as above, snippets inlined, Liquid rewritten, and every unsupported tag listed on the template.
2. **Suppression import.** Page `GET /v1/esp/suppression/{type}` per sending domain into `MessageSuppression` with a bulk write. This protects the new domain's reputation from day one.
3. **Sender checklist.** List Customer.io sender identities and link each domain into the domain verification flow.
4. **Draft workflows, agent-built.** A skill reads each automation's trigger, segment ids and ordered message actions (`parent_action_id`) and creates a **draft** workflow through `hog-flows-create`, with the imported templates in place and a note on each spot where Customer.io had a delay or branch the API does not reveal. A person fills in the flow control and turns it on.

Steps 1 to 3 are deterministic product code. Step 4 is an agent skill on top of tools that already exist, so it needs no new backend.
A first slice could ship step 4 alone as a skill (with the user's Customer.io App API key and the PostHog MCP), to learn what switchers need before building steps 1 to 3 into the modal **(guess at the right order)**.

### Path 2, not recommended now: full fidelity

A 1:1 import of automations is impossible through the public API, because flow control is not exposed.
Reaching it means scraping Customer.io's UI or asking users for screenshots, which is fragile.
People import as a product (creating persons from a CSV or the Parquet export) is a separate, larger bet; it helps only teams that never sent events to PostHog.

## First decisions for the follow-up map

1. Does content import live in the modal (product code) or in an agent skill first?
2. How are unsupported Liquid tags surfaced: a warning list on the template, or a blocking validation before the template is used?
3. Are snippets inlined (simple, loses reuse) or added as a template feature?
4. Does the importer cover teams with no PostHog events, or does it state "send your users to PostHog first" as a prerequisite?
5. What does "done" look like for one switcher: first automation live in Workflows with its Customer.io twin turned off?

## Dependencies on sibling tickets

- [#214](https://github.com/Silthus/posthog/issues/214) sending caps and bring-your-own sending: a switcher's volume hits caps on the first real send.
- [#215](https://github.com/Silthus/posthog/issues/215) behavior-driven workflows: segment-entry automations need it.
- [#216](https://github.com/Silthus/posthog/issues/216) transactional send API: Customer.io transactional callers need a target.
- [#225](https://github.com/Silthus/posthog/issues/225) send before domain verification: every switcher re-verifies its domains.

## Notes

- Compliance note on how the step-1 API import stores global unsubscribes compared with the webhook path: ask Michael.
- The `campaignObject.type` field is marked "Sunsetting on March 30, 2025" in the spec; an importer should read the newer trigger fields (guess: check the current spec before building).
- Customer.io rate-limits most App API endpoints to about 10 requests per second ([App API reference](https://docs.customer.io/api/app/)); a content import of a large workspace runs as a background job, not in the request.
- No native PostHog destination in Customer.io Data Pipelines was found in public docs; a webhook destination pointed at PostHog capture is possible in principle (guess, not verified).

## Sources

Code (this repository):

- `products/messaging/backend/services/customerio_import_service.py`, `customerio_client.py`, `customerio_sync_service.py`
- `products/messaging/backend/api/message_categories.py`, `customerio_webhook.py`, `message_templates.py`, `message_suppression.py`
- `products/messaging/backend/models/` (`message_preferences.py`, `message_category.py`, `message_suppression.py`, `optout_sync_config.py`, `message_template.py`)
- `products/workflows/frontend/OptOuts/CustomerIOImportModal.tsx`, `optOutCsvImport.ts`
- `products/warehouse_sources/backend/temporal/data_imports/sources/customer_io/` (`constants.py`, `source.py`)
- `products/warehouse_sources/backend/temporal/data_imports/pipelines/core/person_property_sync.py`
- `posthog/tasks/calculate_cohort.py` (`calculate_cohort_from_list`)
- `posthog/cdp/templates/customerio/template_customerio.py`, `posthog/cdp/validation.py`
- `nodejs/src/cdp/schema/hogflow.ts`, `nodejs/src/cdp/utils/liquid.ts`, `nodejs/src/cdp/services/hog-inputs.service.ts`, `nodejs/src/cdp/services/messaging/recipient-preferences.service.ts`, `nodejs/src/cdp/services/messaging/email.service.ts`
- `products/workflows/mcp/tools.yaml`, `services/mcp/src/api/generated.ts`
- `products/managed_migrations/backend/models/batch_imports.py` (event imports cover Mixpanel and Amplitude, not Customer.io)

Customer.io public docs:

- [App API reference](https://docs.customer.io/api/app/) and its OpenAPI spec `https://docs.customer.io/files/journeys-app.json` (campaign, actions, newsletters, transactional, snippets, ESP suppression, exports, segments)
- [Liquid syntax list](https://docs.customer.io/messaging/liquid/tag-list/)
- [Personalize messages with Liquid](https://docs.customer.io/messaging/liquid/using-liquid/)
- [Export data for multiple profiles](https://docs.customer.io/messaging/profiles/manage/exporting-users/)
- [Manage subscription preferences](https://docs.customer.io/messaging/channels/subscriptions/manage-subscription-preferences/)
- [Data warehouse integrations](https://docs.customer.io/integrations/data-out/data-warehouses/data-warehouses-intro/)
- [Reporting webhooks](https://docs.customer.io/integrations/data-out/connections/webhooks/)
