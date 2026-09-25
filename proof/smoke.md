## Running-app smoke test, PR #106759 at `7cbee122408` (carries PR 1 at `2d89f1bdced`)

My side stack (web 8105, Vite 8338, router 8024), from the worktree at `7cbee122408`, 2026-09-25 16:30–16:48Z.
Fresh invented project "WL v2 163 proof" (team 16):
- 123 workflows: 12 hand-made ones on `acme.example.com` senders, 110 "Bulk flow" drafts and one `loops` workflow.
- 4 email templates.
- 12 invented metric rows.
API checks use a personal API key created for the invented user with the single scope `hog_flow:read`.

**Result: every check passes. No failures to triage.**

### PR 1 backend (curl-equivalent HTTP through the router, `smoke-api.py`)

| Check | Result | Detail |
| --- | --- | --- |
| `hog_flows/summaries/?limit=2` follows `next` to the end, each row once, no heavy fields | pass | 62 pages, 123 rows, 123 unique, count 123. No `actions`, `edges`, `draft`, `inputs`, `encrypted_inputs`, `content`, `html`, `text` or `design` key anywhere in the rows |
| `messaging_templates/summaries/?limit=2`, the same checks | pass | 2 pages, 4 rows, 4 unique, count 4, no heavy keys |
| `Accept-Encoding: gzip` on `hog_flows/summaries/` | pass | `Content-Encoding: gzip` |
| `Accept-Encoding: gzip` on `messaging_templates/summaries/` | pass | `Content-Encoding: gzip` |
| `Accept-Encoding: gzip` on the plain `hog_flows/` list | pass | no `Content-Encoding` |
| `?status=active,draft` | pass | 122 rows, the same set as the unfiltered rows with those statuses |
| `?exclude_type=loop` | pass | 122 of 123 rows, the loop workflow left out |
| `?channel=email` | pass | 10 rows, the same set as rows whose `channels` has `email` |
| `?trigger_type=event` | pass | 118 rows, the same set as rows whose `trigger_type` is `event` |
| `?created_by=,` | pass | HTTP 400, `"Must be a valid user uuid"` on `created_by` |
| `last_7_days` | pass | present on every row: 7 with totals, 116 with `{succeeded: 0, failed: 0}`, 0 null. Per the spec, a workflow without metrics gets 0/0; `null` is only for a metrics-store failure, which this run didn't simulate |
| A `hog_flow:read`-only key calls both `summaries` endpoints | pass | every request above used that key |

### PR 2, flag off (production today): the old list's row menu

The same row menu the shared row-actions refactor now drives. Each result was checked through the API afterwards.

| Check | Result | Detail |
| --- | --- | --- |
| Flag off renders the old list | pass | `workflows-table` present, `workflows-list-v2` absent |
| Duplicate | pass | "Onboarding checklist nudges (copy)" created as a draft |
| Archive, with confirm dialog | pass | the copy became `archived` (`off-archive-dialog.png`, `off-after-archive.png`) |
| Restore | pass | the copy became `draft` again |
| Delete, with confirm dialog | pass | archived again, then deleted; the original stays `draft` (`off-archive-again-dialog.png`, `off-delete-dialog.png`, `off-after-delete.png`) |

### PR 2, flag on

| Check | Result | Detail |
| --- | --- | --- |
| Page past 100 rows, and page 2 stays | pass | Page 1 shows "1-100 of 127 items". After "Next page" it shows "101-127 of 127 items", first row "Bulk flow 083", and it is the same 7 seconds later. The URL keeps no `page` param (`on-page-2.png`, `on-page-2-footer.png`) |
| Typing `status:active ` makes a pill | pass | "Status: Active" pill, URL `?q=status%3Aactive`, 9 rows (`on-typed-pill.png`) |
| `007` survives a reload | pass | URL `?text=007`, and after a reload the input still shows `007` (`on-007-after-reload.png`) |
| Duplicate | pass | "Feedback survey (copy)" created as a draft, shown after the reload |
| Archive, with confirm dialog | pass | the copy became `archived` and the row updated in place (`on-archive-dialog.png`, `on-after-archive.png`) |
| Restore | pass | the copy became `draft` |
| Delete, with confirm dialog | pass | archived again, then deleted; the original stays `draft` (`on-archive-again-dialog.png`, `on-delete-dialog.png`, `on-after-delete.png`) |

### Notes, not failures

- The first scripted "Next page" click did not land: the button was below the fold and the log still showed page 1. A second run scrolled the button into view and clicked it, and page 2 held. `ui-on.log` has the first run; `ui-on-page2.log` has the second.
- A fresh login on an account with a personal API key lands on master's "One more thing" credential-review page first. That page comes from master, not from these PRs. The script clicks "Continue to PostHog".

### Cleanup

- Project and team 16 deleted.
- Its 12 invented `app_metrics2` rows deleted, with the delete limited to `team_id = 16`: 12 before, 0 after.
- The `wl-v2-163 smoke` personal API key deleted, and the local key file removed.
- The stack stopped, and the `wl-v2-163-router` container removed. Ports 8105, 8338 and 8024 are free.
