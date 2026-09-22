# CI auth for workflows-as-code without a personal API key

Research for [ticket 104](https://github.com/Silthus/posthog/issues/104) on the
[Workflows as code map](https://github.com/Silthus/posthog/issues/68). The
v1 CLI push authenticates with a personal API key held as a CI secret. This
asks what exists today to avoid that, and what the smallest safe change
would be.

## 1. What the installed GitHub App can do

The GitHub integration (`posthog/models/integration/github.py`,
`posthog/models/github_integration_base.py`) is a **one-way, PostHog-to-GitHub**
credential. `GitHubIntegration.fetch_installation_access`
(`posthog/models/integration/github.py:130`) mints a GitHub App installation
access token by signing a JWT with `GITHUB_APP_PRIVATE_KEY` and calling
GitHub's `installations/{id}/access_tokens` endpoint. That token lets
**PostHog** call the GitHub API as the installation (read repo contents,
open PRs, write files) — it is stored PostHog-side in
`Integration.sensitive_config` (`posthog/models/integration/model.py`) and
never leaves PostHog. Consumers: `products/tasks/` (Tasks/Code sandbox repo
access), `products/error_tracking/backend/logic/github_external_references.py`
and `git_provider_file_link_resolver.py` (stack trace → source links),
`products/signals/backend/github_writeback.py` and `reviewer_pr_ready.py`
(PR comments, review status), `products/review_hog/` (automated review),
`products/visual_review/backend/logic/github_api.py`, `products/wizard/backend/logic/workers/repository_publisher.py`,
`ee/api/agentic_provisioning/views/github_grants.py`.

The only inbound direction is the webhook, `/webhooks/github`
(`posthog/api/github_callback/installation_events.py`), which handles
GitHub-initiated lifecycle events (`installation`, `installation_repositories`)
verified by HMAC against `GITHUB_WEBHOOK_SECRET`
(`posthog/api/github_callback/README.md:33,118,159`). It updates PostHog's
own integration rows; it is not a channel a customer's CI job can use to
present a credential and get something back. **PostHog holds nothing a CI
job on the customer's side could present.** The App only lets PostHog call
GitHub, never the reverse.

## 2. GitHub Actions OIDC as the credential

### How npm and PyPI do it

- **npm**: since npm CLI 11.5.1 / July 2025 GA, a workflow with
  `permissions: id-token: write` lets a modern npm CLI request a GitHub
  Actions OIDC token and exchange it with the npm registry for a short-lived
  publish credential, once the package's "Trusted Publisher" settings name
  the org/repo/workflow file (and optionally environment). See
  [npm Trusted Publishing docs](https://docs.npmjs.com/trusted-publishers/)
  and the [GitHub changelog announcement](https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/).
  This repository already has the client-side half of this pattern in
  `.github/workflows/publish-quill-npm.yml`: job-level
  `permissions: { contents: read, id-token: write }` plus
  `npm install -g npm@11.6.4` to get OIDC-capable npm.
- **PyPI**: a workflow POSTs its GitHub OIDC `id_token` to
  `https://pypi.org/_/oidc/mint-token`. PyPI validates the JWT signature and
  claims against every project's registered Trusted Publisher (repo,
  workflow filename, optionally environment) and, on a match, returns a
  15-minute PyPI API token scoped to the matching project(s). See
  [PyPI Trusted Publishers docs](https://docs.pypi.org/trusted-publishers/)
  and [Internals and Technical Details](https://docs.pypi.org/trusted-publishers/internals/).
- **GitHub's own OIDC token**: issued by GitHub's own OIDC provider
  (`token.actions.githubusercontent.com`) as a JWT carrying `repository`,
  `ref`, `workflow`, `job_workflow_ref`, `environment`, `run_id` and other
  claims a relying party checks against its stored trust rule. See
  [GitHub Actions OIDC hardening docs](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect).

### Whether PostHog has an equivalent

Grepping `posthog/`, `ee/`, `products/` for `oidc`, `id_token`, `token
exchange`, `trusted publishing`, `workload identity`, `token-exchange`
(RFC 8693) turns up no mechanism that accepts a **third-party** OIDC token
and mints a PostHog credential from it — with one close precedent:

**ID-JAG / XAA** (`posthog/api/id_jag.py`, `posthog/auth.py:529-620`,
`posthog/models/identity_provider_config.py`) is PostHog's own JWT-Bearer
grant (RFC 7523) at `/oauth/token`. An org's SSO IdP issues a user an
ID-JAG JWT; the user's client presents it to PostHog, which verifies it
against a stored `IdentityProviderConfig` (issuer URL, JWKS URL, allowed
client IDs — `posthog/models/identity_provider_config.py:222-243`) and
mints a short-lived `at+jwt` access token
(`posthog/auth.py:529-543`, doc comment: "IdP's issue JWT tokens to their
users which they can send to us to issue a short-lived JWT token which can
be used to access our API... eliminates the need for the user to oauth to
us, or get a personal API token"). This is architecturally the right shape
— JWKS-verified JWT-Bearer grant, a per-org trust-rule model, short-lived
scoped output — but it resolves identity by **matching the token's `sub`
to a human User's email domain**
(`IdentityProviderConfigManager.get_id_jag_for_request`,
`posthog/models/identity_provider_config.py:112-150`). A GitHub Actions
OIDC token carries no user email; it asserts a workflow run, not a person.
ID-JAG's trust model and grant plumbing are reusable; its identity
resolution is not.

`services/oauth-proxy` is a Cloudflare Worker that only routes PostHog's
**own** OAuth clients (MCP, Desktop) between the US/EU regions
(`services/oauth-proxy/README.md`) — it re-signs PostHog's own OIDC ID
tokens under its own issuer, it does not accept or validate anyone else's
OIDC token. Not relevant to this problem.

`ee/api/agentic_provisioning/views/oauth_token.py` supports only
`authorization_code` and `refresh_token` grants for partner (Stripe
marketplace) provisioning — no RFC 8693 token-exchange, no
`subject_token`/`actor_token`.

### What a PostHog equivalent would need

Following the ID-JAG shape but for machine identity instead of user
identity:

1. **A per-project trust rule model** — analogous to `IdentityProviderConfig`
   but keyed on `team_id` + `{repository, workflow_ref, environment}`
   (the fields a PyPI/npm Trusted Publisher stores), not an org + email
   domain. No existing model fits; this is new.
2. **A token endpoint** that accepts GitHub's OIDC `id_token`, verifies it
   against GitHub's JWKS (`token.actions.githubusercontent.com`, fixed
   issuer — simpler than ID-JAG's configurable-issuer case), matches its
   `repository`/`job_workflow_ref`/`ref` claims against a stored trust rule
   for the target `team_id`, and mints a short-lived, narrowly-scoped
   token. `posthog/api/id_jag.py` is the closest reusable reference for the
   JWT verification and OAuth-error-response shape.
3. **A scoped, short-lived output credential.** Reusing the
   `ProjectSecretAPIKeyUser` synthetic-user shape (see §3) rather than
   inventing a new token type keeps this from becoming a second credential
   system.
4. **Admin UI** for a team admin to register the trust rule (repo +
   workflow path, optionally branch), mirroring PyPI's per-project
   "Add a trusted publisher" form.

This is real, buildable work — a new model, a new unauthenticated
token-exchange endpoint (necessarily unauthenticated, since its entire job
is to authenticate the caller), and JWT/JWKS verification code — not a
config flip.

## 3. Existing lesser credentials

| Credential                    | User-less?                                                                                                                                                            | Can carry `hog_flow:write` today?                                                                                                                                                                                                                                                                                                                                                                             | File                                                                                                     |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Personal API key              | No — `user = models.ForeignKey("posthog.User", ...)` is required                                                                                                      | Yes, `hog_flow` is a valid `APIScopeObject` (`posthog/scopes.py:67`)                                                                                                                                                                                                                                                                                                                                          | `posthog/models/personal_api_key.py:36`                                                                  |
| Project secret API key (PSAK) | **Yes** — "project-scoped, user-less service credential"                                                                                                              | **No, not yet.** `hog_flow` is absent from `PROJECT_SECRET_API_KEY_ALLOWED_API_SCOPE_ACTION` (`posthog/scopes.py:223-239`, currently `endpoint:read`, `feature_flag:read`, `account:read`, `loop:write`, `experiment:read`); `HogFlowViewSet` (`products/workflows/backend/api/hog_flow.py:3934-3937`) declares no `authentication_classes` override, so it never accepts `ProjectSecretAPIKeyAuthentication` | `posthog/models/project_secret_api_key.py`, `.agents/skills/adding-project-secret-api-key-auth/SKILL.md` |
| OAuth application             | No — only `GRANT_AUTHORIZATION_CODE`, `GRANT_IMPLICIT`, `GRANT_OPENID_HYBRID` are permitted (`posthog/models/oauth.py:449-451`); no `client_credentials` grant exists | N/A — requires a human consent screen, so it cannot be a CI-only credential regardless of scope                                                                                                                                                                                                                                                                                                               | `posthog/models/oauth.py`                                                                                |
| MCP client                    | No — MCP auth is a first-party OAuth app behind `services/oauth-proxy`, same authorization-code human flow                                                            | N/A, same reason as OAuth apps                                                                                                                                                                                                                                                                                                                                                                                | `services/oauth-proxy/README.md`                                                                         |

**PSAK is the only user-less, machine-to-machine credential PostHog has
today**, and it is the natural target for a CI credential — it already
exists, is documented, and the skill
(`.agents/skills/adding-project-secret-api-key-auth/SKILL.md`) spells out
exactly what wiring it onto a new viewset action needs: (1) add
`("hog_flow", "write")` to `PROJECT_SECRET_API_KEY_ALLOWED_API_SCOPE_ACTION`
in `posthog/scopes.py` (and mirror it in
`frontend/src/lib/scopes.tsx`, checked by
`posthog/test/test_scopes.py`), (2) add `ProjectSecretAPIKeyAuthentication`
to `HogFlowViewSet.authentication_classes` and list the CLI's push actions
(`create`, `update`, `partial_update`, at minimum) in
`psak_allowed_actions`, (3) use `PersonalOrProjectSecretApiKeyRateThrottle`
/ `ProjectSecretApiKeyTeamRateThrottle` (`posthog/rate_limit.py`), (4)
handle `ProjectSecretAPIKeyUser` as `request.user` (no `.id`, no
`has_perm()`, bypasses object-level RBAC by design — acceptable here since
PSAK scopes are already project-wide and a workflow push is project-wide
by nature).

A PSAK is still a bearer secret a customer must generate and store in CI
— it does not remove the "one secret in a CI variable" step, only removes
the tie to a specific human's account (a PAK is revoked when its owner
leaves; a PSAK survives that and is auditable as a service credential in
its own right).

## 4. The read-only PR's guard

On `feat/workflows-code-managed-read-only`
(`git show origin/feat/workflows-code-managed-read-only:products/workflows/backend/api/hog_flow.py`):

```python
# line 228
CODE_MANAGED_WRITER_EVENT_SOURCES: Final = frozenset({EventSource.API, EventSource.CLI})

# line 252
def is_code_managed_writer(request: Request) -> bool:
    """Whether this request is the client that pushes the file, and so may write a code-managed row."""
    if isinstance(getattr(request, "successful_authenticator", None), SessionAuthentication):
        return False
    if is_mcp_transport_request(request):
        return False
    return get_event_source(request) in CODE_MANAGED_WRITER_EVENT_SOURCES
```

The important detail: `get_event_source` (`posthog/event_usage.py:441-482`)
classifies **entirely from the `User-Agent` header, `X-Posthog-Mcp-Consumer`,
`X-Posthog-Client`, and the OAuth `client_id`** — never from which
authentication class validated the request. The CLI branch is:

```python
# posthog/event_usage.py:476-477
if user_agent == "posthog-cli" or request.headers.get("X-Posthog-Mcp-Consumer") == "posthog-cli":
    return EventSource.CLI
```

and the fallback for anything that is not session auth, not MCP, and
matches no known User-Agent is `EventSource.API`
(`posthog/event_usage.py:482`).

**Consequence: neither a PSAK credential nor an OIDC-derived credential
needs a change to this guard.** A request authenticated by either one,
sent with the CLI's existing `User-Agent: posthog-cli` (or with no
special User-Agent at all, which still resolves to `EventSource.API`),
already satisfies `is_code_managed_writer` — because the guard reads
headers, not the auth backend. All the real work for either credential
option is in getting a valid, correctly-scoped token into the CLI's hands
in the first place (§2, §3); once it holds one and calls the existing
push endpoint with the existing User-Agent, the read-only guard already
accepts it unmodified.

## Options ranked

Ranked by how much PostHog has to build, cheapest first, each rated for
safety.

1. **PSAK, scope added (recommended for v1).** Build: one line in
   `posthog/scopes.py` (plus its frontend mirror), `authentication_classes`
   - `psak_allowed_actions` on `HogFlowViewSet`, a throttle. No new model,
     no new endpoint, no cryptography. Safety: good — PSAK is already
     audited, project-scoped, rotatable, and distinct from a person's
     account; the risk is the same as any long-lived bearer secret in CI
     (leak = misuse until rotated), which is no worse than today's personal
     API key and strictly better (no human tied to it, project-scoped by
     construction).
2. **Personal API key (status quo).** Build: none. Safety: worst of the
   three — tied to a human account, inherits that person's full scope
   surface unless carefully scoped, breaks silently when the person
   leaves or is offboarded.
3. **GitHub Actions OIDC trusted publishing (recommended for later).**
   Build: a new trust-rule model, a new unauthenticated token-exchange
   endpoint doing JWT/JWKS verification against GitHub's fixed OIDC
   issuer, admin UI to register trust rules, and minting logic that
   likely still bottoms out in a `ProjectSecretAPIKeyUser`-shaped token so
   the rest of the stack (throttles, guard, activity log) doesn't need a
   second code path. Safety: best of the three once built — no bearer
   secret sits in CI config at all, the credential is minted fresh per
   run and bound to the exact repo/workflow/ref, and a leaked run token
   is worthless outside its ~short window. The build is real (new
   endpoint = new attack surface to review carefully), but the shape is
   proven by ID-JAG internally and npm/PyPI externally.

## Recommendation

**v1: extend PSAK to cover `hog_flow:write`.** It is the smallest change
that gets a CI job off a personal API key, needs no new endpoint or
cryptography, and the guard in §4 already accepts it with zero changes.

**Later: GitHub Actions OIDC trusted publishing**, once more than one
product wants "no secret in CI at all" — it removes the CI secret
entirely rather than just de-personalizing it, following the shape npm
and PyPI already validated and the shape ID-JAG already proved out
internally for a different identity type. Worth doing once, generically
(a trust-rule model + token endpoint any product can register against),
not once per product.
