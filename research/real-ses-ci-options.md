# Real SES CI options

Research for [Silthus/posthog#293](https://github.com/Silthus/posthog/issues/293), part of [#291](https://github.com/Silthus/posthog/issues/291). Checked 2026-10-06 by GPT-6.1 Sol. This records facts and candidate designs for the follow-up grilling. It does not select an account, domain, mailbox, trigger, or provisioning policy.

## Answer

A real arrival test can run after relevant changes land on `master`, on maintainer dispatch, or during Trunk's temporary same-repository PR checks. OIDC can supply short-lived AWS credentials. SES receiving into S3 and third-party inbox APIs can expose the received message body. The SES mailbox simulator can exercise feedback scenarios, but it does not provide a mailbox-reading API and cannot satisfy the message-arrival assertion by itself.

The simplest candidate to take into grilling is a path-scoped `push` to `master` plus `workflow_dispatch`, a dedicated OIDC role, and SES receipt rules writing to S3. A third-party receiver adds independence from AWS at the cost of a subscription and another credential. A queue test provides pre-merge evidence, but requires broader trust and a decision about whether external delivery failures should hold the queue. These are trade-offs, not decisions made by this research.

## Repository evidence

The inspected upstream snapshot is [`f2fe805a35181`](https://github.com/PostHog/posthog/commit/f2fe805a35181). The map names [`9668491696973`](https://github.com/PostHog/posthog/commit/9668491696973), the throttle-fix branch head, as the implementation base. I also checked that revision's SES constructor and send parameters; the credential-chain and tenant findings below hold there too.

- [`ci-nodejs.yml`](https://github.com/PostHog/posthog/blob/f2fe805a35181/.github/workflows/ci-nodejs.yml#L1) subscribes to `pull_request`, `push` on `master`, and a schedule. It identifies Trunk checks through `github.head_ref` beginning `trunk-merge/`, forces full Jest selection on those heads, and runs several test jobs only when the event is not `push`. Adding a real SES test to those jobs would not automatically give it a post-merge run.
- [`container-images-cd.yml`](https://github.com/PostHog/posthog/blob/f2fe805a35181/.github/workflows/container-images-cd.yml#L11) uses `push` on `master` and `workflow_dispatch`. Its job grants `id-token: write` and passes an AWS role from repository variables into [`docker-meta/action.yml`](https://github.com/PostHog/posthog/blob/f2fe805a35181/.github/actions/docker-meta/action.yml#L60), which calls the SHA-pinned `aws-actions/configure-aws-credentials` action. The workflow documents master-only OIDC trust. The actual IAM policy is outside this repository and was not inspected.
- [`container-images-label-ci.yml`](https://github.com/PostHog/posthog/blob/f2fe805a35181/.github/workflows/container-images-label-ci.yml#L1) subscribes to `pull_request: types: [labeled]`, checks the exact label in a job condition, and requires the PR head repository to equal the workflow repository before granting OIDC. This pattern does not unlock credentials for a fork PR.
- [`EmailService`](https://github.com/PostHog/posthog/blob/f2fe805a35181/nodejs/src/cdp/services/messaging/email.service.ts#L345) creates `SESv2Client` with region and optional endpoint, with no explicit credentials. Despite the legacy access-key fields in `EmailServiceConfig`, this constructor uses the SDK default credential chain. The [AWS SDK documentation](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html) lists environment credentials as a provider. OIDC action output must reach the test process, including `AWS_SESSION_TOKEN`; Docker or another environment boundary must explicitly preserve it.
- The [send adapter](https://github.com/PostHog/posthog/blob/f2fe805a35181/nodejs/src/cdp/services/messaging/email.service.ts#L1079) sends SESv2 `SendEmailCommand`, always sets `TenantName = team-<teamId>`, selects a tracked or untracked configuration set, and includes a signed tracking header. It checks `MessageId` but does not expose it as a public result. Correlate arrival with a unique recipient and subject/body token instead of relying on that result.
- A real test must use the SES sender path rather than maildev, set a real SES region, and leave `SES_ENDPOINT` unset. The fake endpoint and fake AWS keys must not leak into this job. Existing [`email.service.test.ts`](https://github.com/PostHog/posthog/blob/f2fe805a35181/nodejs/src/cdp/services/messaging/email.service.test.ts#L193) spies on the SDK client's `send`; it is not proof of real SES delivery.

## Triggers, filters, and labels

| Trigger                                                | Credential access                                                                                                                                                 | What it tests and how to select runs                                                                                                                                        |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upstream `pull_request` from `Silthus/posthog`         | No repository secrets or writable OIDC permission under the normal public-fork restrictions. Approving the workflow or adding a label does not change that trust. | Keep local-fake tests here. Paths select relevant PRs; labels select jobs only when the workflow subscribes to the label event.                                             |
| Trunk temporary same-repository PR                     | Can request OIDC with `id-token: write`; AWS must separately trust its subject.                                                                                   | Tests a queued merge candidate before landing. Require head-repository equality and `trunk-merge/` head, accept draft PRs, and evaluate the queued diff.                    |
| `push` to upstream `master`                            | Can use upstream secrets/OIDC if configured.                                                                                                                      | Tests committed code after merge. `branches` plus `paths` is an AND. PR labels are not present in the push payload.                                                         |
| Maintainer `workflow_dispatch`                         | Can use secrets/OIDC in the repository receiving the dispatch.                                                                                                    | Explicit rerun or selected trusted revision. No native path/label filter. Use inputs and validated job conditions.                                                          |
| `pull_request_target` with a label                     | Has base-repository privilege, subject to Actions policy.                                                                                                         | Safe default runs base/default-branch code. It does not test the PR implementation unless it executes PR-controlled code, which introduces the privilege problem below.     |
| `workflow_run`                                         | The follow-on workflow can have secrets even if its predecessor did not.                                                                                          | Filter workflow name, completion, branch, repository, and conclusion. It has no native paths/labels; do not execute fork artifacts or fork code with credentials.           |
| Schedule, `repository_dispatch`, or PR `issue_comment` | Can run trusted default-branch code with configured privilege.                                                                                                    | Useful for recurring probes or a trusted dispatcher. Paths and labels require explicit API/diff checks. A comment command needs actor authorization and a fixed tested SHA. |
| `workflow_call`                                        | Inherits the caller's permissions; it is not a fork-credential bypass.                                                                                            | Reuse a test job from a trusted caller.                                                                                                                                     |

Sources: [GitHub event reference](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), [workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax), [fork privilege model](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target), and the repository workflows linked above.

Trunk supports both draft-PR testing and push-triggered testing on `trunk-merge/**`. Its [CI setup documentation](https://docs.trunk.io/merge-queue/getting-started/configure-ci-status-checks) explains both. This repository's Node workflow explicitly handles the draft-PR form. Do not substitute GitHub's native `merge_group` event for that existing path. A queue PR's default non-environment OIDC subject is the repository's `pull_request` subject, not a `ref:refs/heads/trunk-merge/...` subject. A push to a queue branch uses a branch subject. Verify the actual claims before writing trust.

The queue lane would execute proposed code while holding a limited test role. A head-prefix condition is a workflow condition, not an IAM guarantee. Broad trust for `repo:PostHog/posthog:pull_request` authorizes other eligible internal PR workflows too. A protected test environment or a suitable subject customization can narrow trust, but environment branch rules, workflow provenance, and approval policy must be designed together. See [GitHub's OIDC reference](https://docs.github.com/en/actions/reference/security/oidc).

Path filters do not widen credentials. GitHub evaluates only the first 300 files for trigger-level path filtering, so a matching file outside that window can be missed. A required workflow skipped by filters can leave its check pending. A job-level diff calculation plus an always-reporting gate avoids that shape; the repo's vendored [paths-filter](https://github.com/PostHog/posthog/blob/f2fe805a35181/.github/actions/paths-filter/README.md) and [container CD changes job](https://github.com/PostHog/posthog/blob/f2fe805a35181/.github/workflows/container-images-cd.yml#L52) are references. Cover the test, SES adapter, sender gates, email queue, workflow file, shared dependencies, and lockfiles as appropriate to the accepted test seam. [GitHub filter limitations](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#git-diff-comparisons).

GitHub has no trigger filter for a particular label name. `types: [labeled]` plus `github.event.label.name` reacts to label addition; a condition reading current labels does not itself start a run. If `synchronize` is also subscribed, an already-applied label can authorize later commits unless permission is tied to the SHA. Do not assume original PR labels propagate onto Trunk's batch PR. The repo's [label rerun workflow](https://github.com/PostHog/posthog/blob/f2fe805a35181/.github/workflows/desktop-backend-coupling-rerun.yml#L1) explains why a small dispatcher is separate from its expensive suite.

### Is `pull_request_target` forbidden here?

There is no blanket ban in the checked local workflow lint rules. There are narrowly documented metadata-only uses, including [`review-hog.yml`](https://github.com/PostHog/posthog/blob/f2fe805a35181/.github/workflows/review-hog.yml#L12). The security workflow loads the external [`p/github-actions` ruleset](https://github.com/PostHog/posthog/blob/f2fe805a35181/.github/workflows/ci-security.yaml#L379). Fetching that current ruleset confirmed the ERROR rule `yaml.github-actions.security.pull-request-target-code-checkout.pull-request-target-code-checkout`. Its [upstream implementation](https://github.com/semgrep/semgrep-rules/blob/develop/yaml/github-actions/security/pull-request-target-code-checkout.yaml) flags checkout refs derived from PR data or `github.head_ref` under this trigger. A label condition does not remove that match. Existing `nosemgrep` annotations are not authorization for a new SES test exemption.

The local [publish rule](https://github.com/PostHog/posthog/blob/f2fe805a35181/.semgrep/rules/security/github-actions-publish-on-pull-request.yaml) prevents package/image publication from PR-capable events; it is not a prohibition on test email sends. The [fanout checker](https://github.com/PostHog/posthog/blob/f2fe805a35181/tools/hogli-commands/hogli_commands/workflow_lint/checks/pr_event_fanout.py) also budgets unscoped PR dispatches, exempts `paths` allowlists, and excludes label events from the burst budget.

As of this check, [GitHub documents a default public-repository policy](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target#default-policy-for-pull_request_target) for this trigger in evaluate mode, with enforcement on November 2, 2026 for affected repositories. The live upstream/fork policy was not inspected. A candidate using this event would need a policy check as well as a code review. Prefer trusted dispatch or post-merge execution over a labeled privileged checkout of arbitrary fork code.

Running a `push` or dispatch in `Silthus/posthog` is technically possible with fork-owned AWS trust and credentials. It does not inherit upstream resources or prove that an upstream workflow works. Dispatching upstream `master` while checking out a fork SHA also does not make that code trusted automatically.

## AWS authentication and resources

OIDC avoids storing a long-lived AWS key. A new test role needs the GitHub issuer, `sts.amazonaws.com` audience, and `sts:AssumeRoleWithWebIdentity` trust limited to the chosen repository and execution context. The job needs `contents: read` and `id-token: write`; use a SHA-pinned credential action, short session duration, and session name correlated with the run. Store the role ARN and non-secret configuration in repository/environment variables. [GitHub AWS OIDC setup](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws), [credential action upstream](https://github.com/aws-actions/configure-aws-credentials).

Without an environment, master push/dispatch normally uses `repo:ORG/REPO:ref:refs/heads/master`. An environment changes the default subject to `repo:ORG/REPO:environment:NAME`, so the environment must enforce permitted branches. Current GitHub docs also describe immutable repository/owner IDs in subjects for newer or opted-in repositories. Match this repository's actual format; do not copy a historical subject string or a wildcard covering every repository context. Repository names in these examples are templates, not inspected account configuration.

The runtime role can be limited to `ses:SendEmail` on the test identity and configuration-set resources, with `ses:FromAddress`, `ses:Recipients`, and `ses:TenantName` restrictions. Recipient restrictions must cover every To/CC/BCC address, using the IAM set operators appropriate for the multi-valued key. S3 arrival checks additionally need `s3:ListBucket` limited to the mailbox prefix and `s3:GetObject` on that prefix. Add deletion only if the test performs cleanup; lifecycle expiry can handle it instead. Provisioning permissions belong in a separate role. Exact policy must be tested after account/region selection. [SESv2 authorization reference](https://docs.aws.amazon.com/service-authorization/latest/reference/list_sesv2.html).

The test must have a verified sending identity, an enabled `team-<fixtureTeamId>` SES tenant, and each used configuration set associated with that tenant. This is required by the current send adapter, including `isTest=true`. The repository's [SES provisioning provider](https://github.com/PostHog/posthog/blob/f2fe805a35181/products/workflows/backend/providers/ses.py#L462) and [AWS tenant documentation](https://docs.aws.amazon.com/ses/latest/dg/tenants.html) agree on those resource associations. A manually constructed SDK send that omits the tenant would miss this application requirement.

The SES sandbox is regional. It permits only verified recipients/domains and simulator recipients, with a default 200 messages/day and one message/second. A controlled verified receiving domain can therefore support a small arrival test without assuming production access. A random third-party address requires recipient verification or production access. Sender identities still require verification outside the sandbox. [AWS sandbox restrictions](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html).

No role, DNS record, AWS resource, inbox subscription, or secret was provisioned. No existing AWS role was assumed. Whether a suitable isolated account or mailbox already exists remains an input for Michael's grilling.

## Mailbox options

| Option                         | What a passing assertion proves                                                                              | Setup and operational trade-offs                                                                                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SES inbound receipt rule to S3 | SES accepted the application send, a real receiver processed the message, and CI retrieved its MIME content. | Own a test subdomain, verify it, publish receiving MX, activate receipt rules, and allow SES to write a private S3 prefix. AWS-only round trip; does not prove delivery to Gmail/Outlook inbox folders. |
| SES mailbox simulator          | Real SES API/auth/request handling and the chosen simulated feedback event.                                  | No managed inbox to poll for content. Cannot alone prove the ticket's arrival criterion.                                                                                                                |
| Mailosaur                      | A separate provider received the SES email and exposed its content through an API.                           | API key and subscription, provider limits, API/delivery availability, data retention policy.                                                                                                            |
| MailSlurp                      | A separate provider received the SES email into an API-addressable inbox.                                    | API key and plan, inbox isolation/expiry, provider limits and availability.                                                                                                                             |

### SES receiving into S3

SES receiving needs domain verification, a receiving MX record, resource permissions, and a rule in an active ruleset. It is available only in selected regions. The [setup guide](https://docs.aws.amazon.com/ses/latest/dg/receiving-email-setting-up.html) and [receiving guide](https://docs.aws.amazon.com/ses/latest/dg/receiving-email.html) describe these requirements. Use a dedicated receiving subdomain so an MX change cannot redirect an existing mailbox.

The [S3 receipt action](https://docs.aws.amazon.com/ses/latest/dg/receiving-email-action-s3.html) writes raw MIME, supports a prefix and an optional SNS notification, and currently has a default 40 MB maximum. Use the SES write role or a bucket policy scoped to the receipt rule's source account/ARN. Avoid SES's optional client-side message encryption unless the test has a compatible decryption implementation; it differs from normal S3 server-side encryption.

A test design can send one invented message containing a unique run token, poll the receipt prefix or consume receipt notifications, fetch the matching object, parse MIME, and assert recipient, subject, text/HTML token, and relevant headers. The receiver assigns its own message identifier; do not assume the outbound SES `MessageId` is the S3 key. An [inbound notification](https://docs.aws.amazon.com/ses/latest/dg/receiving-email-notifications-contents.html) supplies the receiving action's object key. Use the run token to reject old mail and unrelated inbound spam.

Polling needs a finite deadline and bounded backoff. DNS/verification readiness should be established during provisioning, not recreated during each run. S3 provides [strong read/list consistency](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html#ConsistencyModel), but SMTP receipt and receipt-rule execution remain asynchronous. Concurrent runs must not delete each other's messages. Prefer a small isolated prefix with lifecycle expiry and synthetic content.

### SES simulator

The [official simulator guide](https://docs.aws.amazon.com/ses/latest/dg/send-an-email-from-console.html) defines these outcomes:

| Address at `simulator.amazonses.com` | Outcome                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------- |
| `success`                            | Simulated acceptance, with a delivery notification if configured.         |
| `bounce`                             | Permanent bounce, without adding the address to the SES suppression list. |
| `complaint`                          | Spam complaint feedback.                                                  |
| `ooto`                               | Automatic response to the return path or envelope sender.                 |
| `suppressionlist`                    | Hard bounce as if globally suppressed.                                    |

It supports plus labels for correlation, works in the sandbox, respects the maximum send rate, does not consume daily quota or damage bounce/complaint reputation metrics, and incurs normal sending charges. These recipients are useful for a separate feedback test. They are not an inbox-content assertion. OOTO also does not map to an event type handled by the current workflow SES webhook.

### Third-party receivers

[Mailosaur's Node client](https://mailosaur.com/docs/email-testing/nodejs) waits for messages matching recipient, subject, or body, supports a timeout and `receivedAfter`, and returns parsed message content. Use a per-run address/token and an inbox-scoped API key. Send through PostHog's SES adapter; use Mailosaur only to read the arrival. Its [API-key documentation](https://mailosaur.com/docs/managing-your-account/api-keys) describes scoped keys.

[MailSlurp's JavaScript client](https://www.mailslurp.com/docs/js/) can create real inboxes and wait for the latest or matching email, then read subject/body/attachments. A per-run inbox avoids ambiguity; a shared inbox needs token matching rather than a latest-message assertion. Send through SES rather than the vendor's send API.

Both prove arrival at their receiving service, not placement in an ordinary user's inbox or general deliverability. They also add a service and API credential to the failure path. Plan limits, retention, regions, and custom-domain availability must be checked at purchase. The current [Mailosaur](https://mailosaur.com/pricing) and [MailSlurp](https://www.mailslurp.com/pricing/) pricing pages did not expose a reliable numeric quote in this text-only check, so no subscription price is guessed here.

### Cost

Current [AWS public pricing](https://aws.amazon.com/ses/pricing/) lists Essentials at $0.16/1,000 outbound emails for the first volume tier, and an optional à-la-carte rate of $0.10/1,000. Classic inbound receipt costs $0.10/1,000 plus $0.09/1,000 incoming chunks. S3 storage/requests, SNS/SQS usage, DNS, and any tenant charges are additional. À-la-carte tenants cost $0.005/month/tenant plus $0.005/1,000 sends; bundled plans differ. Simulator sends are billed. Verify the selected plan before budgeting. Classic receipt rules do not require a paid Mail Manager open ingress endpoint.

These are public list prices, not account usage or a measured monthly estimate. External-delivery flakiness is not quantified because no real mailbox trial was authorized.

## Can SNS exercise the SES webhook?

Yes, with additional infrastructure and assertions. A sending configuration set can publish selected delivery/bounce/complaint events to an SNS Standard topic with SES publish permissions scoped to the configuration set. [AWS event-destination setup](https://docs.aws.amazon.com/ses/latest/dg/event-publishing-add-event-destination-sns.html). A second SNS subscription to an isolated SQS queue could collect feedback for CI without a public receiver, but would not exercise the HTTP webhook itself.

The application exposes [`POST /public/m/ses_webhook`](https://github.com/PostHog/posthog/blob/f2fe805a35181/nodejs/src/cdp/cdp-api.ts#L337). [`EmailTrackingService`](https://github.com/PostHog/posthog/blob/f2fe805a35181/nodejs/src/cdp/services/messaging/email-tracking.service.ts#L421) requests signature verification, and [`SesWebhookHandler`](https://github.com/PostHog/posthog/blob/f2fe805a35181/nodejs/src/cdp/services/messaging/helpers/ses.ts#L376) confirms subscriptions, verifies SNS signatures, enforces configured topic allowlisting, and extracts tracking codes.

For an actual webhook test, SNS needs a reachable HTTPS endpoint running the tested application, successful subscription confirmation, the test topic in `SES_ALLOWED_SNS_TOPIC_ARNS`, and the same tracking signing keys as the sender. The current envelope schema supports SNS signature version 1. [AWS signature documentation](https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html) also describes version 2, so topic/signature settings need to match or support needs a separately reviewed change.

Configuration-set publishing uses `eventType`, which the parser expects. Identity-level SNS feedback uses `notificationType`; the two [AWS message formats](https://docs.aws.amazon.com/ses/latest/dg/event-publishing-retrieving-sns-contents.html) and [identity notification format](https://docs.aws.amazon.com/ses/latest/dg/notification-contents.html) should not be treated as interchangeable. Receiving-rule SNS notifications are a third format, `Received`, and do not belong on this send-feedback endpoint.

Verify that actual event payloads retain the signed original tracking header. The adapter's comment mentions `IncludeOriginalHeaders`, but [SESv2 event-destination definitions](https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_EventDestinationDefinition.html) do not expose that field. Identity notifications have a separate [header-inclusion operation](https://docs.aws.amazon.com/ses/latest/APIReference/API_SetIdentityHeadersInNotificationsEnabled.html). Use observed configuration-set event payloads rather than blindly copying that comment into provisioning.

`isTest=true` makes webhook processing skip engagement metrics, invocation logs, and suppression changes. A metrics/suppression round-trip test therefore needs an isolated synthetic team/invocation with ordinary send semantics. Simulator bounce/complaint tests must not run against production suppression state. Poll the resulting application state by invocation/run token, allow for duplicate/out-of-order delivery, and include only sanitized diagnostics in public CI artifacts.

The mailbox-arrival test can share its test account and configuration sets with this effort, but does not establish subscription confirmation, signature verification, event attribution, or persistence. Treat the webhook round trip as a separate follow-up.

## Cheap checks performed

All repository commands below ran against the separate worktree unless a revision is named. No real email was sent.

- `gh issue view 291 --repo Silthus/posthog` and `gh issue view 293 --repo Silthus/posthog --comments`. Read the map's binding notes and the ticket question. The comment-only view did not include the body in this CLI; followed with `gh issue view 293 --repo Silthus/posthog --json title,body,comments,labels,state,assignees`.

- `git show origin/master:docs/agents/issue-tracker.md`. Confirmed fork-only ticket operations and claim/resolve conventions.

- `git fetch upstream master`; `git worktree add /tmp/wf-research-real-ses-ci-options -b research/real-ses-ci-options upstream/master`; `git rev-parse HEAD`. Separate branch/worktree at `f2fe805a35181`.

- `rg -n 'trunk-merge|event_name|labeled' .github/workflows/ci-nodejs.yml .github/workflows/container-images-label-ci.yml`. Confirmed temporary-PR detection, non-push test jobs, and same-repository label guard.

- `rg -n 'configure-aws-credentials|role-to-assume|aws-region' .github/actions/docker-meta/action.yml`. Found SHA-pinned action, role input, and region.

- `sed -n '345,365p' nodejs/src/cdp/services/messaging/email.service.ts`; `rg -n 'TenantName|ConfigurationSetName|SendEmailCommand' nodejs/src/cdp/services/messaging/email.service.ts`. No explicit credentials; tenant/configuration set included on actual SES send.

- `git show 9668491696973:nodejs/src/cdp/services/messaging/email.service.ts` with the same constructor/send searches. Confirmed the map's throttle-fix base has the same credential and tenant requirements.

- `rg -n 'pull_request_target' .semgrep .github/workflows tools/hogli-commands/hogli_commands/workflow_lint`. Found narrow metadata uses and external-pack loading; no local blanket trigger ban.

- `curl -fsSL https://semgrep.dev/c/p/github-actions -o /tmp/wf293-github-actions-rules.yaml`; `rg -n 'id:.*pull.*request.*target' /tmp/wf293-github-actions-rules.yaml -A 32`; inspect lines 81-136. Confirmed current ERROR rule against PR-derived checkout under `pull_request_target`. A two-file probe below also reproduced the rule.

- `curl -fsSL https://docs.trunk.io/merge-queue/getting-started/configure-ci-status-checks.md -o /tmp/wf293-trunk-ci.md`; `rg -n 'pull_request|trunk-merge|draft' /tmp/wf293-trunk-ci.md`. Official documentation confirms draft-PR and push-triggered modes.

- `rg -n 'SesWebhookHandler|verifySignature|SES_ALLOWED_SNS_TOPIC_ARNS|ses_webhook' nodejs/src/cdp`. Confirmed HTTP route, signature verification, and topic configuration. Read handler's event parsing and `isTest` guards.

These checks prove configuration and code facts, not live AWS permissions, propagation time, mailbox reliability, or the current GitHub Actions event policy.

Two additional executable probes passed without AWS access:

- SDK credentials: the installed SESv2 client resolved all three invented environment credentials, including the session token. No request was sent. The command was `.codex/with-flox node -e '<script below>'`.
- Semgrep: extracted the named checkout rule from the fetched pack, then ran `.codex/with-flox semgrep scan --config /tmp/wf293-trigger-proof/rule.yaml --metrics=off --disable-version-check --json /tmp/wf293-trigger-proof/labeled-head-checkout.yml /tmp/wf293-trigger-proof/metadata-only.yml`. The result had one finding on the PR-head checkout at line 11, zero findings on the metadata-only workflow, and no parser errors. This proves a label does not bypass that rule; it is not a scan of an implementation workflow.

The SDK probe script was:

```javascript
process.env.AWS_ACCESS_KEY_ID = 'test-access-key'
process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key'
process.env.AWS_SESSION_TOKEN = 'test-session-token'
const { SESv2Client } = require(require.resolve('@aws-sdk/client-sesv2', { paths: [process.cwd() + '/nodejs'] }))
const client = new SESv2Client({ region: 'us-east-1' })
client.config
  .credentials()
  .then((credentials) => {
    if (
      credentials.accessKeyId !== 'test-access-key' ||
      credentials.secretAccessKey !== 'test-secret-key' ||
      credentials.sessionToken !== 'test-session-token'
    )
      throw new Error('environment credentials mismatch')
    console.log(
      'PASS: SDK default chain includes environment access key, secret key, and session token; no request sent'
    )
    client.destroy()
  })
  .catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
```

The Semgrep reproduction used this input, and a second input with the checkout step removed:

```yaml
name: labeled head checkout
on:
  pull_request_target:
    types: [labeled]
jobs:
  test:
    if: github.event.label.name == 'real-ses-test'
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd
        with:
          ref: ${{ github.event.pull_request.head.sha }}
      - run: echo test
```

The rule extraction command was:

```sh
.codex/with-flox python -c 'import pathlib, yaml; rules = yaml.safe_load(pathlib.Path("/tmp/wf293-github-actions-rules.yaml").read_text()); selected = [rule for rule in rules["rules"] if rule["id"] == "yaml.github-actions.security.pull-request-target-code-checkout.pull-request-target-code-checkout"]; assert len(selected) == 1; pathlib.Path("/tmp/wf293-trigger-proof/rule.yaml").write_text(yaml.safe_dump({"rules": selected}))'
```

The probes and downloaded rules remained outside the committed file tree.

Document validation also passed. `.codex/with-flox hogli format:markdown research/real-ses-ci-options.md` reported zero markdownlint errors. After committing, `.codex/with-flox hogli ci:preflight --strict --against upstream/master` saw one changed Markdown file, passed its formatting check, and reported zero failures. It emitted an age-only freshness advisory because the inherited merge-base commit was eight days old. `git rev-parse HEAD^ upstream/master` returned the same full base SHA, so the requested branch already started at the fetched upstream tip. This research intentionally keeps that cited snapshot instead of merging unrelated fork changes.

The first push attempt exposed a tooling mismatch. The pre-push hook defaults to the fork's older `origin/master`, so it scanned unrelated upstream changes. I stopped that attempt, restored its incidental lockfile reorder, and set the throwaway worktree's uncommitted pre-push invocation to `hogli ci:preflight --strict --against upstream/master`. Strict checks and the merge-queue guard remained enabled. This hook adjustment is not part of the research commit; only this Markdown file is published.

## Open decisions and proposed follow-ups

The conductor can graduate these into tickets; none was dispatched or created here.

1. Grill real-SES policy with Michael. Select hosting repository, account ownership/isolation, region, sender/receiving domain, mailbox provider, automatic trigger, optional queue gating, and failure/timeout policy. This includes whether a real receiver means an AWS S3 mailbox or an independent provider.
2. Provision the approved design. Create a limited OIDC runtime role separately from provisioning permissions; establish verified identities, fixed synthetic SES tenant and resource associations, mailbox rules/inbox, retention, and configuration variables. Prove DNS and sandbox readiness once.
3. Implement the real arrival test through the accepted `EmailService` seam. Run one synthetic email through the real SDK and assert content in the chosen receiver. Keep it separate from deterministic fake-provider tests and record exact tested SHA and finite timing.
4. Implement the approved CI triggers and gates. Validate fork skip, manual dispatch, relevant/irrelevant paths, missing configuration, queue/draft behavior if chosen, actual OIDC claims, and public-safe failure diagnostics. Account for the repository's workflow fanout budget and unrebased PR compatibility.
5. Separately decide and implement real SNS feedback coverage. Use simulator recipients, signed configuration-set events, an isolated application receiver/state, and explicit Delivery/Bounce/Complaint assertions. Resolve original-header and signature-version compatibility during provisioning validation.

No Michael-only input blocks completion of this facts-only ticket. Those inputs block provisioning and the policy decision, which the map explicitly assigns to the follow-up grilling.
