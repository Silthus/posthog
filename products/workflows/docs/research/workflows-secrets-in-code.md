# How secrets and environment values reach a code-defined workflow

Research note for the workflows-as-code effort.
Nothing is built here.

- Question: how does a committed workflow file reference a secret or an environment value, and what does the backend do with it on push?
- Source: this repository at `f637db96f1fc853ea6a83694f02b94ab690bdcaf` (2026-09-21). Every repository claim cites a file and a line. Every external claim cites a URL and the date it was read.
- Location: `products/workflows/docs/research/`, the directory the read-only-mode note created.
- Evidence: `products/workflows/docs/research/test_patch_omits_secret_evidence.py` on this branch. It is not a product test. It answers one question the product suite leaves open.

## Summary

1. **A write that omits a stored secret keeps it.** Verified. The omitted key and the read-back marker take the same recovery branch, because the serializer reads `data.get(key) or {}`. A file that never names the secret is therefore safe, but only while the action id is stable.
2. **The action id is the recovery key.** The encrypted map is `{action_id: {input_key: value}}`, and recovery looks up the stored value by the incoming action's id. A push that re-keys an action loses that action's secret silently.
3. **The read-back marker breaks the prototype's change detection.** `GET` returns `{"secret": true}` inside `config.inputs`. `normalize.ts` compares `config` whole and drops only `null`, `undefined` and `""`. A workflow with any secret input therefore never compares equal, so every push looks like a change.
4. **Only `function`-shaped steps can hold a secret at all.** The secret set comes from the step template's `inputs_schema`. Email and Slack steps hold an integer integration id instead, which is not a secret and is not encrypted on the workflow row.
5. **Every code-first tool surveyed keeps the secret out of the file and names it.** None of Convex, Trigger.dev or Inngest lets a committed definition carry a value. The committed side carries a name; the platform or the host holds the value.

## 1. What the API does today

### 1.1 The write path

`HogFlowSerializer.validate()` loads every stored secret into serializer context before the nested action serializers run:

```python
self.context["existing_encrypted_inputs"] = existing_secret_map(instance, template_cache={})
```

at `products/workflows/backend/api/hog_flow.py:3071`. The comment on `:3064-3070` states the reason: the nested serializers validate inside `super()`, so the context must exist first. The line is guarded by `if instance is not None`, so a create has no recovery base.

`existing_secret_map` (`products/workflows/backend/api/hog_flow.py:384-389`) merges four sources, later winning: legacy plaintext in the live `actions`, legacy plaintext in the draft `actions`, the live `encrypted_inputs` column, then `draft_encrypted_inputs`.

Each action then builds `HogFlowConfigFunctionInputsSerializer` (declared at `products/workflows/backend/api/hog_flow.py:986-993`) and passes that action's slice of the map:

```python
"encrypted_inputs": (self.context.get("existing_encrypted_inputs") or {}).get(data.get("id")) or {}
```

at `products/workflows/backend/api/hog_flow.py:1636`. The lookup key is `data.get("id")`, the incoming action id.

The `inputs` field on that serializer is the shared `InputsSerializer` from `posthog/cdp/validation.py:797`. Its `run_child_validation` holds the decision:

- `posthog/cdp/validation.py:808` reads the context: `existing_secret_inputs = self.context.get("encrypted_inputs")`.
- `posthog/cdp/validation.py:819` coerces an absent key to an empty dict: `value = data.get(key) or {}`.
- `posthog/cdp/validation.py:825-830` computes `is_masked`, true when the value is a dict with a truthy `secret` and either no `value` key or `value == MASKED_SECRET_VALUE`.
- `posthog/cdp/validation.py:831-838` is the branch: `if is_masked or value == {}`, look up the stored value and substitute it. If nothing is stored and the caller sent the marker, raise `"No value is saved for this secret input. Enter the value again."` If nothing is stored and the key was merely absent, no error is raised and the key stays out of the result.
- A real value falls past that branch to normal validation and lands in `result[key]` (`posthog/cdp/validation.py:867`), so a rotation wins.
- `posthog/cdp/validation.py:862-866` refuses to persist the literal mask as a value, with `"This secret input was not updated correctly. Enter the value again."`

`MASKED_SECRET_VALUE` is `"********"` (`posthog/cdp/validation.py:38`). It is a write-side sentinel, not what a read returns.

After validation, `HogFlowSerializer._strip_secret_inputs` (`products/workflows/backend/api/hog_flow.py:3290-3301`) moves the secrets out of the plaintext blob:

```python
validated_data["encrypted_inputs"] = strip_secrets_from_content(validated_data, template_cache={})
```

It returns early when `"actions" not in validated_data` (`:3296-3297`), which is why a metadata-only write cannot touch a stored secret. `create()` calls it at `:3308` and `update()` at `:3313`.

`strip_secrets_from_content` (`products/workflows/backend/api/hog_flow.py:474-486`) delegates to `partition_flow_secrets` (`:351-372`), which pops each secret key out of `action.config.inputs` into `{action_id: {input_key: value}}`. Its docstring states the rule that matters here: the map is rebuilt from scratch on every call and never merged onto a prior map, so secrets for deleted or renamed actions drop out rather than orphaning.

### 1.2 The three answers

**A whole-definition PATCH that omits a stored secret input keeps the stored value.**
This is **verified**. `value = data.get(key) or {}` at `posthog/cdp/validation.py:819` makes an absent key indistinguishable from `{}`, and `{}` takes the recovery branch at `:831`. The recovered value then flows through `_strip_secret_inputs` and is re-encrypted onto the row.

The verification is at the serializer level, not through the HTTP API, because no dev stack was available in this worktree. `products/workflows/docs/research/test_patch_omits_secret_evidence.py` drives `HogFlowConfigFunctionInputsSerializer` directly with the same context key the API sets, and asserts three cases:

| Sent for the secret key | Stored before  | Result                     | Test                                                       |
| ----------------------- | -------------- | -------------------------- | ---------------------------------------------------------- |
| key absent              | `STORED-VALUE` | `STORED-VALUE` kept        | `test_omitted_secret_key_recovers_the_stored_value`        |
| key absent              | nothing        | key stays absent, no error | `test_omitted_secret_key_with_nothing_stored_stays_absent` |
| `{"value": "ROTATED"}`  | `STORED-VALUE` | `ROTATED`                  | `test_sent_secret_value_overwrites_the_stored_value`       |

All three pass. The remaining hop, from the viewset to that serializer with `existing_encrypted_inputs` populated, is established by reading `products/workflows/backend/api/hog_flow.py:3071` and `:1636` rather than by running it.

The caveat is the action id. Recovery is `existing_encrypted_inputs[action_id]`, so the same PATCH against a re-keyed action returns nothing to recover, and `partition_flow_secrets` writes a map that no longer holds the value. Neither path raises. The secret is simply gone.

**A PATCH that sends a secret value overwrites.**
`products/workflows/backend/api/test/test_hog_flow.py:5034` pins this as `test_secret_update`, parameterized over three cases: `{"secret": True}` preserves, `{"value": "ROTATED"}` replaces, and `{"secret": True, "value": "ROTATED"}` also replaces. The third case carries a comment explaining why a client that merges its new value into the object it read back must win: silently keeping the old token makes a rotation appear to succeed.

**GET never returns a secret. It returns `{"secret": true}`.**
`HogFlowMinimalSerializer.to_representation` (`products/workflows/backend/api/hog_flow.py:2787-2816`) masks the live `actions`, the derived `trigger`, and the staged `draft`. The masking itself is `mask_secret_action_inputs` (`:418-437`), and the placeholder is set at `:434`:

```python
inputs[key] = {"secret": True}
```

A value counts as set if it is in the encrypted map or, for a legacy row, still sits in plaintext (`:432-433`). The whole input object is replaced, so `order`, `templating` and any other sibling field on that input disappear from the read.

Two masking subtleties matter for a file-to-server compare. `trigger` is masked from the instance rather than from `data["actions"]` (`:2804-2806`), because the summary serializer returns `trigger` while omitting `actions`, and a function-shaped trigger's secret would otherwise leak on the MCP list endpoint. And `actions` is deep-copied before masking (`:2798-2800`), because a `JSONField` comes back from `super()` by reference.

### 1.3 The tests that pin these paths

All in `products/workflows/backend/api/test/test_hog_flow.py`, class `TestHogFlowSecretInputs` at `:4967`. The fixture template is `_secret_input_template()` at `:99-108`: a webhook destination with one secret input `api_key` and one plain input `url`.

- `:5005` `test_secret_action_input_is_encrypted_at_rest_and_masked_on_read` asserts `inputs["api_key"] == {"secret": True}` on both the create response and the retrieve, that `api_key` is absent from the stored `actions` blob, that `encrypted_inputs["action_1"]["api_key"]["value"]` holds the real value, and that the raw column text does not contain it.
- `:5034` `test_secret_update`, the overwrite and preserve matrix above.
- `:5045` `test_metadata_only_update_leaves_secret_intact`, a PATCH carrying only `name`.
- `:5053` `test_publish_promotes_draft_secret_to_live_without_wiping`.
- `:5099` `test_activity_log_masks_secret_changes`.
- `:5135` `test_activation_keeps_secret_stripped_from_live_actions`.
- `:5148` `test_restore_reattaches_live_secret_not_historical`.
- `:5216` `test_noop_resave_of_secret_flow_does_not_bump_revision`.
- `:5275` `test_function_shaped_trigger_secret_is_masked_on_read`.
- `:5309`, `:5405`, `:5423`, `:5501` cover the legacy plaintext rows written before encryption shipped.
- `:5467` `test_masked_secret_with_no_stored_value_is_rejected_for_strict_callers`.
- `:320` `test_mcp_list_is_metadata_only_and_hides_action_secrets`.

At the serializer level, `posthog/cdp/test/test_validation.py:785` `test_validate_inputs_with_secret_values` covers `{}`, a new value, the bare marker, and the marker with the mask as its value. `posthog/cdp/test/test_validation.py:852` `test_masked_secret_without_stored_value_is_rejected` covers the empty-store case.

None of these sends an action whose secret key is absent. That is the gap the evidence test fills.

## 2. Which inputs are secret

### 2.1 How a template marks an input secret

`secret` is a boolean on each `inputs_schema` entry, default `false`. The API's source of truth is `InputsSchemaItemSerializer` in `posthog/cdp/validation.py:522-565`, where `secret = serializers.BooleanField(default=False)` sits at `posthog/cdp/validation.py:557`.

Storage is untyped. `HogFunctionTemplate.inputs_schema` is a plain `models.JSONField()` (`products/cdp/backend/models/hog_function_template.py:29`), and the dataclass mirror is `inputs_schema: list[dict]` (`posthog/cdp/templates/hog_function_template.py:63`). The same shape is redeclared for the workers as `HogFunctionInputSchemaType` with `secret?: boolean` (`nodejs/src/cdp/types.ts:550`) and for the frontend as `CyclotronJobInputSchemaType` with `secret?: boolean` (`frontend/src/types.ts:6528`).

The workflows side reads exactly that key. `_secret_keys_for_action` (`products/workflows/backend/api/hog_flow.py:344-348`) resolves the action's template and returns `{schema["key"] for schema in (template.inputs_schema or []) if schema.get("secret")}`.

Only some steps resolve a template at all. `_function_template_for_action` (`products/workflows/backend/api/hog_flow.py:326-342`) treats an action as function-shaped when `"function" in action_type`, or when the action is a `trigger` whose `config.type` is in `_FUNCTION_TRIGGER_CONFIG_TYPES`, which is `{"webhook", "manual", "tracking_pixel"}` (`products/workflows/backend/api/hog_flow.py:317`). Everything else has no secret inputs.

### 2.2 Which built-in templates have secret inputs

All are `type="destination"` templates under `posthog/cdp/templates/`, reachable from a workflow `function` step. Twenty-eight template ids carry at least one secret input:

| Template id                            | Secret input keys                            | Location                                                                               |
| -------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------- |
| `template-activecampaign`              | `apiKey`                                     | `posthog/cdp/templates/activecampaign/template_activecampaign.py:62`                   |
| `template-airtable`                    | `access_token`                               | `posthog/cdp/templates/airtable/template_airtable.py:43`                               |
| `template-attio`                       | `apiKey`                                     | `posthog/cdp/templates/attio/template_attio.py:51`                                     |
| `template-avo`                         | `apiKey`                                     | `posthog/cdp/templates/avo/template_avo.py:89`                                         |
| `template-aws-kinesis`                 | `aws_access_key_id`, `aws_secret_access_key` | `posthog/cdp/templates/aws_kinesis/template_aws_kinesis.py:43,50`                      |
| `template-braze`                       | `apiKey`                                     | `posthog/cdp/templates/braze/template_braze.py:59`                                     |
| `template-brevo`                       | `apiKey`                                     | `posthog/cdp/templates/brevo/template_brevo.py:45`                                     |
| `template-clearbit`                    | `api_key`                                    | `posthog/cdp/templates/clearbit/template_clearbit.py:50`                               |
| `template-customerio`                  | `token`                                      | `posthog/cdp/templates/customerio/template_customerio.py:96`                           |
| `template-engage-so`                   | `public_key`, `private_key`                  | `posthog/cdp/templates/engage/template_engage.py:28,36`                                |
| `template-gleap`                       | `apiKey`                                     | `posthog/cdp/templates/gleap/template_gleap.py:49`                                     |
| `template-hubspot`                     | `access_token`                               | `posthog/cdp/templates/hubspot/template_hubspot.py:385`                                |
| `template-june`                        | `apiKey`                                     | `posthog/cdp/templates/june/template_june.py:114`                                      |
| `template-klaviyo-user`                | `apiKey`                                     | `posthog/cdp/templates/klaviyo/template_klaviyo.py:78`                                 |
| `template-klaviyo-event`               | `apiKey`                                     | `posthog/cdp/templates/klaviyo/template_klaviyo.py:212`                                |
| `template-kudosity-sms`                | `api_key`                                    | `posthog/cdp/templates/kudosity/template_kudosity.py:70`                               |
| `template-loops`                       | `apiKey`                                     | `posthog/cdp/templates/loops/template_loops.py:56`                                     |
| `template-loops-event`                 | `apiKey`                                     | `posthog/cdp/templates/loops/template_loops.py:157`                                    |
| `template-mailchimp`                   | `apiKey`                                     | `posthog/cdp/templates/mailchimp/template_mailchimp.py:70`                             |
| `template-mailgun-send-email`          | `api_key`                                    | `posthog/cdp/templates/mailgun/template_mailgun.py:70`                                 |
| `template-mailjet-create-contact`      | `api_key`, `secret_key`                      | `posthog/cdp/templates/mailjet/template_mailjet.py:6,13` (shared dicts, used at `:40`) |
| `template-mailjet-update-contact-list` | `api_key`, `secret_key`                      | same dicts, used at `posthog/cdp/templates/mailjet/template_mailjet.py:95`             |
| `template-onesignal`                   | `apiKey`                                     | `posthog/cdp/templates/onesignal/template_onesignal.py:55`                             |
| `template-rudderstack`                 | `token`                                      | `posthog/cdp/templates/rudderstack/template_rudderstack.py:116`                        |
| `template-sendgrid`                    | `api_key`                                    | `posthog/cdp/templates/sendgrid/template_sendgrid.py:68`                               |
| `template-userlist`                    | `push_key`                                   | `posthog/cdp/templates/userlist/template_userlist.py:100`                              |
| `template-zendesk`                     | `admin_email`, `token`                       | `posthog/cdp/templates/zendesk/template_zendesk.py:55,63`                              |

`template-hubspot-event` (`posthog/cdp/templates/hubspot/template_hubspot.py:104`) has no secret input, unlike its sibling. `template-email`, the template behind the workflow email step, declares `secret: false` (`nodejs/src/cdp/templates/_destinations/email/email.template.ts:22-45`).

Workflow function steps come in four node kinds, `function`, `function_email`, `function_sms` and `function_push` (`products/workflows/frontend/Workflows/hogflows/steps/hogFunctionStepLogic.tsx:13-16`). The generic `function` step is the one that reaches the destination catalog above.

### 2.3 How an integration-typed input differs

The allowed input types are enumerated on `InputsSchemaItemSerializer.type` (`posthog/cdp/validation.py:524-546`): `string`, `number`, `boolean`, `dictionary`, `choice`, `json`, `integration`, `integration_multi`, `integration_field`, `email`, `native_email`, plus a set of PostHog-specific pickers.

An `integration`-typed input does not hold a secret. It holds an integer, the primary key of a `posthog_integration` row. `InputsItemSerializer.validate` enforces that at `posthog/cdp/validation.py:636-638`: `if not isinstance(value, int): raise ... "Value must be an Integration ID."` `integration_multi` validates a list of ints at `posthog/cdp/validation.py:640-642`.

The credential lives on the other side of that id. `Integration.sensitive_config` is an `EncryptedJSONField` and `Integration.config` is plain JSON (`posthog/models/integration/model.py:187-194`). The kinds are enumerated at `posthog/models/integration/model.py:128-178` and include `email`, `slack`, `hubspot` and `twilio`. The worker resolves the id and decrypts the row at execution time (`nodejs/src/cdp/services/managers/integration-manager.service.ts:38-57`).

Three consequences for a code-defined workflow:

- A Slack or email step's committed value is a team-scoped integer, not a secret. It survives a plaintext file, but it is not portable between projects, because the id belongs to one team's `posthog_integration` table.
- That integer is not masked on read and not moved into `encrypted_inputs`, so it compares cleanly.
- An `email` or `native_email` input carries a message object with `from`, `to`, `subject` and a body, validated at `posthog/cdp/validation.py:661-724`. A custom sender address is checked against the integration's verified domain, and an unchanged stored value is grandfathered through `existing_action_email_from` (`products/workflows/backend/api/hog_flow.py:3073-3078`).

Extra sibling keys on an integration-typed schema entry are `integration`, `integration_key`, `integration_field`, `requires_field` and `requiredScopes` (`posthog/cdp/validation.py:558-563`).

## 3. Precedents in this repository

### 3.1 `HogFunction.encrypted_inputs`

`encrypted_inputs` is an `EncryptedJSONStringField` on the model (`products/cdp/backend/models/hog_functions/hog_function.py:134`), with `draft_encrypted_inputs` alongside it (`:166`). The migration is `posthog/migrations/0474_hogfunction_encrypted_inputs.py:16`.

The split runs in the model, not the serializer. `HogFunction.move_secret_inputs()` (`products/cdp/backend/models/hog_functions/hog_function.py:259-278`) walks `inputs_schema`, leaves non-secret entries in `inputs`, and for a secret entry writes `final_encrypted_inputs[schema["key"]] = value or encrypted_value` (`:275`). It is called from `save()` (`:284-292`) on create and update alike, except on a draft-only write (`_is_draft_only_save`, `:96`).

Recovery upstream is the same shared serializer the workflows path uses, so the answers match. The context is set at `products/cdp/backend/api/hog_function.py:561`: `self.context["encrypted_inputs"] = instance.encrypted_inputs if instance else {}`. Note the shape difference: `HogFunction` keys the map by input key, while `HogFlow` keys it by action id and then input key.

Read masking is `HogFunctionSerializer.to_representation` (`products/cdp/backend/api/hog_function.py:751-771`), and the placeholder is the same `{"secret": True}` (`:766`). `_mask_draft_secrets` (`:773-790`) does the draft.

Pinning tests: `products/cdp/backend/api/test/test_hog_function.py:922` `test_secret_inputs_not_returned`, `:1017` `test_secret_inputs_not_updated_if_not_changed`, `:1054` `test_secret_inputs_updated_if_changed`, and `:973` `test_masked_secrets_lists_only_functions_storing_the_mask`.

That last one names a real failure mode. `masked_secret_input_keys` (`posthog/cdp/validation.py:41-58`) exists to find rows that stored the literal `"********"` as the credential. Its docstring records why the check cannot be a SQL predicate: the column is Fernet encrypted and Fernet embeds a random IV, so the same plaintext encrypts differently on every write, and a caller has to decrypt and inspect. A code path that ever writes a placeholder as a value produces rows only the owner can repair.

### 3.2 The MCP `workflows-create` path

`workflows-create` is a generated pass-through. It is declared in `products/workflows/mcp/tools.yaml:135-170` against `operation: hog_flows_create`, and its description at `:146-169` never mentions secrets. It forwards `actions` to the same `HogFlow` create endpoint, which accepts a plaintext secret value in `config.inputs` and immediately splits it into `encrypted_inputs` via `_strip_secret_inputs` (`products/workflows/backend/api/hog_flow.py:3290-3308`).

So the MCP path has no secret handling of its own. It has the accept-then-split behavior of the API, which means an agent authoring a workflow through MCP sends the credential in the request body.

The read side is guarded separately. `mask_trigger_config` (`products/workflows/backend/api/hog_flow.py:454-471`) exists because the summary serializer used by the MCP list endpoint returns `trigger` while omitting `actions`, so a function-shaped trigger's secret could not be re-derived from masked actions there. `products/workflows/backend/api/test/test_hog_flow.py:320` pins it.

## 4. What the prototype's change detection compares

`sdk/normalize.ts` on `origin/prototype/workflows-as-code` (read 2026-09-21) reduces both sides to one canonical JSON string and deep-compares.

- `WRITABLE_FIELDS` is `['name', 'description', 'status', 'exit_condition', 'actions', 'edges']`. The projection is onto what a client may write, so every read-only field on the serializer falls outside it by construction.
- `WRITABLE_ACTION_FIELDS` is `['id', 'name', 'description', 'type', 'config', 'on_error']`.
- `canonicalize` sorts object keys, drops `bytecode`, `bytecode_error` and `bytecode_version`, and drops any value that `isEmpty` calls empty, which is `null`, `undefined` and `""`.
- Actions are sorted by `id`, edges by their JSON, so order is not content.

`config` is kept whole and recursed into. `config.inputs` is therefore part of the compare, and a secret input is part of `config.inputs`.

Two failure modes follow, and the prototype never hit either because it never sent a secret:

- The file omits the secret. The server side of the compare carries `api_key: {"secret": true}`; the file side carries nothing. `{"secret": true}` is not empty, so it is not dropped. The strings differ on every run.
- The file carries a literal value. The server side still carries the marker. The strings differ on every run, and the value is committed.

Either way, a workflow with one secret input reports a change forever. The comparison needs an explicit rule for a masked input before a push can be idempotent.

## 5. What other code-first tools do

All read 2026-09-21.

**Convex.** Environment variables are per-deployment and live on the platform, never in version control. They are set from the dashboard or the CLI: `npx convex env set NAME 'value'`, `npx convex env list`, `npx convex env remove NAME`, `npx convex env set --from-file .env.convex`, and `--prod` targets production. The docs note that a value can be passed on stdin, from a file, or interactively so it stays out of shell history. Committed code reads the value by name, either as `process.env.KEY` or through a typed `env` object declared in `convex/convex.config.ts` and imported from `./_generated/server`. Source: <https://docs.convex.dev/production/environment-variables>.

CI deploys authenticate with one variable. `npx convex deploy` typechecks, regenerates, bundles and pushes; when `CONVEX_DEPLOY_KEY` is set, which the docs call typical in CI, it targets the deployment that key belongs to. Source: <https://docs.convex.dev/cli>.

So Convex's answer is: the file names the variable, a separate CLI verb sets the value per deployment, and the deploy carries exactly one secret of its own.

**Trigger.dev.** Environment variables are managed per environment, dev, staging and prod, on a dedicated dashboard page. A variable can be marked secret, which hides it and, per the docs, means it "cannot be viewed after creation". Task definitions reference them as `process.env.MY_ENV_VAR`, and secrets are never committed in the definition; they are injected at runtime before execution begins. There is an SDK surface, `envvars.list()`, `envvars.create()`, `envvars.retrieve()`, `envvars.update()`, `envvars.del()` and `envvars.upload()` for bulk import, and a `syncEnvVars` build extension that pushes values from another source at deploy time, with a native Infisical sync that does it without a redeploy. The local CLI loads `.env`, `.env.development`, `.env.local`, `.env.development.local` and `dev.vars`. Source: <https://trigger.dev/docs/deploy-environment-variables>.

So Trigger.dev's answer is: the file names the variable, and the value arrives either by a one-time set in the UI that later deploys preserve, or by a deploy-time sync extension that reads the deployer's own store.

**Inngest.** The question is different in kind, because the function runs in the user's own deployed app behind the SDK serve handler rather than on Inngest's infrastructure. The docs place secrets in "your hosting provider or `.env` file locally". Inngest itself needs `INNGEST_SIGNING_KEY` on the app so the app syncs into the right Inngest environment, alongside `INNGEST_EVENT_KEY`. Source: <https://www.inngest.com/docs/apps/cloud>.

So Inngest's answer is: there is nothing to solve, because no definition is uploaded. The code and its secrets stay in one process, and only two platform keys cross the boundary.

## 6. The options these facts leave open

Not a recommendation. These are the choices the facts do not settle.

1. **Omit the secret from the file and rely on recovery.** Works today and is verified, and it needs no backend change. It binds correctness to action id stability, gives no way to set a secret for the first time from code, and needs an explicit compare rule for the `{"secret": true}` marker.
2. **Name the secret in the file and resolve it at push from the deployer's environment.** The Convex and Trigger.dev shape: something like `secret('SLACK_TOKEN')` in the definition, read from CI's environment by the CLI and sent as a real value. Overwrite already works, so the backend needs nothing. It puts the plaintext credential in the CLI process and on the wire on every push, and it needs a rule for a name the environment does not define: fail the push, or fall back to recovery.
3. **Name the secret in the file and let the server resolve it from its own store.** The definition carries a reference and never a value. No such reference type exists in `inputs_schema` today, so this needs a new input type or a new value shape, plus a place to hold the values. There is no team-level secret store for this in the repository; the closest thing is `Integration.sensitive_config`, which is per-integration and not free-form.
4. **Reuse integrations instead of secrets wherever a provider has one.** An `integration`-typed input already keeps the credential off the definition, at the cost of committing a team-scoped integer that does not move between projects. This can only cover providers that have an `IntegrationKind`, so it does not remove the need for a plain-secret answer.
5. **A one-time set in the UI that later pushes preserve.** The user creates the workflow with its secret in the UI, then hands the definition to code. Recovery keeps it. This conflicts with read-only mode, which wants the UI to stop being a write surface, and it needs a stated rule for the first push of a brand-new workflow that has a secret input.
6. **Refuse the case.** A code-managed workflow rejects any step with a secret input, and those steps stay UI-managed. Cheapest to ship and easy to explain, but it excludes twenty-eight destination templates from the code path.

Two questions cut across all six.

- **Compare.** Whichever option wins, `normalize.ts` needs a rule for a masked input. The candidates are to drop every secret key from both sides before comparing, which makes a rotation invisible to the diff and so always pushed or never pushed, or to compare a hash the server would have to return and does not today.
- **Action ids.** Recovery is keyed by action id, so the identity story for a code-defined step decides whether a secret survives a refactor of the file. This is the same question the identity work is already asking, with a silent data loss attached to the wrong answer.
