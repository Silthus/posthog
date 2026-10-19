# The enable request is stored on the workflow

`HogFlow` stores `enable_requested_at`, `enable_requested_by` and `went_live_at`.
A workflow that goes live after verification does so in a background task, with no request and no signed-in person, so its `hog_flow_activated` event needs a person to credit and a start time to measure `seconds_waiting` from.
We store them on the workflow instead of deriving them from earlier analytics events, because the backend cannot read those events back when it captures the next one, and the same fields drive the one-time "Started sending" notice.

## Considered options

- **Derive the wait from events only.** A funnel from `hog_flow_enable_requested` to `hog_flow_activated` measures the time, but the background event would have no person to credit, and `created_by` is often someone else.
- **Store the Enable's source as well.** It would put web, MCP or API on the background event, but a funnel by `workflow_id` and person already answers that, so the fourth field is not worth it.
