# GitHub

Deliveries from the GitHub Apps PostHog runs.

## Headers

- `X-Hub-Signature-256` carries the signature.
- `X-GitHub-Delivery` carries the delivery id.
- `X-GitHub-Event` carries the event type.

## Signature scheme

HMAC-SHA256 over the raw body, hex encoded, with the prefix `sha256=`.
GitHub sends no timestamp, so there is no replay window.

## Delivery id and event type

Both come from headers, never from the body.
A request without `X-GitHub-Delivery` gets no delivery id and skips dedup.
The payload's `installation.id` goes into the delivery context as `installation_id`.

## Apps and secrets

Two apps share this incarnation, each subscribed to its own event types in GitHub.

- `posthog`, the customer-facing App. Its secret is the instance setting `GITHUB_WEBHOOK_SECRET`, so an operator can rotate it without a deploy.
- `stamphog`, the review App. Its secret is the Django setting `STAMPHOG_GITHUB_APP_WEBHOOK_SECRET`, because it is instance-wide infrastructure.

A consumer registers against an app name, so the two apps share no consumers.

Each region runs its own `posthog` App, with its own webhook URL and its own secret.
GitHub already delivers an installation's events to the region that holds it.
The `stamphog` App is one App, and one region serves its endpoint.

## Quirks

The status codes are the defaults: 403 on a bad signature, 500 when unconfigured, 202 on success.
The installation lifecycle is a core consumer rather than a product one, because it keeps PostHog's own integration rows in step with GitHub.
A GitHub delivery is never forwarded to the other region, so no consumer here declares `ownership`.
The other region verifies against its own App's secret, so it would answer a replayed delivery 403 and count it as an invalid signature.
An installation this region does not hold is an installation this region never receives deliveries for.
See [Regional forwarding](../README.md#regional-forwarding) for the lane the providers with one callback URL use.

## Consumers

- `posthog/ingress/github/provider.py` registers `installation_lifecycle` and `installation_repositories` on the `posthog` app.
- `products/{tasks,conversations,error_tracking,review_hog,workflows}/backend/webhook_consumers.py` register the product consumers on the `posthog` app.
- `products/stamphog/backend/webhook_consumers.py` registers `stamphog_review` on the `stamphog` app.

The Error Tracking consumer handles opened and edited issues and pull requests from repository owners, members, and collaborators.
It scans descriptions for direct issue links and fingerprint permalinks on the configured PostHog site, then queues team-scoped tasks.
Repeated links and deliveries reuse an existing reference.
Removing a link from a later description does not remove the reference.

A consumer that needs the teams behind a delivery's installation calls `installation_integrations()` from `posthog/github/installations.py`, never its own `Integration` query.
The provider's `dispatch_scope()` opens one lookup cache per request, so every consumer on a delivery that calls it shares a single capped query.

The Workflows consumer forwards `check_suite` deliveries as `$github_event_received` when `GITHUB_WORKFLOW_TRIGGERS_ENABLED` is enabled.
The customer-facing App must also subscribe to check suites with Checks read permission.
Each pull request based in the delivery's repository gets an event with its own `number` and UUID.
GitHub's associations can include pull requests from other repositories in the fork network, so those entries are excluded.
A suite without matching pull requests gets one event with `number` unset and `actor_access: read`.
Matching pull requests carry `actor_access: write`, because their head branch is in this repository and pushing there requires write access.
CI filters can use `action`, `conclusion`, `head_sha`, `branch`, `check_suite_id`, and `ci_app`.
A completed suite that failed, timed out or failed to start also carries `labels`, the pull request's label names.
The consumer reads them with one GitHub call per pull request, shared by every connected project.
All lookups for one delivery share a 2 second deadline, and they use the stored installation token without a refresh or a retry.
A failed or late lookup leaves `labels` out and logs `github_workflow_event_label_lookup_failed`, so a label filter does not match.
Match one label with a HogQL filter such as `has(properties.labels, 'babysit')`; `icontains` would also match `babysitter`.
Head commit messages are removed from the embedded payload, as they are for pushes.

The [Endpoints table](../README.md#endpoints) lists the consumer names per event type.
PR analytics shared by those consumers live in `posthog/github/`, see its README.
