Resend migration skill v1: move every supported site to posthog.emails.send
Slice: 15
Strand: skill
Map: [Map: send code-managed email templates with one PostHog call](https://github.com/Silthus/posthog/issues/461)
Spec: [SPEC.md](../SPEC.md), sections "Migration skill", "Code form", "Testing Decisions"
Repository: PostHog/context-mill
Base: slice 14's branch, or `main` once it merges

## What to build

The `migrate-email` / `resend` skill moves every supported Resend call site to posthog-node:

- **Client setup:** add `posthog-node` at the release with the code form, with `secretKey` and `migratedFrom: 'resend'` once on the client.
- **Hosted Resend templates** become local templates in the app's code: the skill writes each one into the repository and the call site sends `templateKey`, `subject`, `html` and `templateData`. The first send uploads it; the agent never creates a template.
  - Variables keep their names: `{{{FIRST_NAME}}}` becomes `{{ variables.FIRST_NAME }}`, and the call site's `variables` move to `templateData` unchanged.
  - A Resend fallback becomes Liquid's `default` filter.
  - PostHog's Liquid escapes HTML in output. A variable the app fills with HTML, or any template syntax beyond plain variables and fallbacks, keeps the site on Resend with a report row.
- **`html:` and `text:` sites** send rendered content with a `templateKey` named for the kind of email.
- **React sites** render in the app (`html: await render(<Welcome />)` with `@react-email/render`, added if missing) and send rendered content. The component stays unchanged.
- `from`, `replyTo` and `idempotencyKey` move as they are. `distinctId` comes from the app's existing identify call.
- `if (error.name === ...)` branches keep working. A branch on a Resend name with no PostHog counterpart, and a site that branches on `last_event`, stays on Resend with a report row.
- Sites with Resend-only fields or attachments stay on Resend with report rows, as in v0.
- The skill proves the chain on one person: a send, an engagement event, and a product event on the same distinct ID (#532).

## Test seams

- Bundle build test and ranking, as in v0.
- A hosted-template fixture: one Resend template with a plain variable, a fallback, and an HTML-valued variable. The first two convert and render as before; the third stays on Resend with a report row.
- Agent runs on the happy fixture (PostHog/wizard-workbench#2221) and the hard fixture (Silthus/next-session: REST, idempotency key, `.ics` attachment), judged by the diff: no `from 'resend'` left on the happy app, `posthog.emails.send` count equals the old send count, the project typechecks; on the hard app every unsupported site is unchanged with a reason and `resend` stays a dependency.

## Proof

- Each flow of the migrated happy app, triggered once on the local stack, lands one email in the dev mail catcher, and the send event carries `migrated_from: resend`.
- One send, its engagement event and a product event show on one person in the local project.
- Gaps: real SES delivery and DNS publish.

## Acceptance criteria

- [ ] A replayed Resend idempotency key keeps its meaning.
- [ ] The summary block still parses.

## Blocked by

- Native: slices 01, 06, 07, 10, 13 and 14.
