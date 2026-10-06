# PostHog AI sandbox streaming and local runs

Research for [#301](https://github.com/Silthus/posthog/issues/301), on [map #299](https://github.com/Silthus/posthog/issues/299). Read the ticket and the map's Notes on 2026-10-06.

The source checkout is `upstream/master` at `5202af95fd153f32ffc999dc1b75157e17e6362b`. All source links below pin that commit. This note records current behavior and implications for the architecture prototype. It does not implement the email tool or settle the prototype's design.

## Answers

### Tool input does stream, with a limit on parsed inner arguments

For the Claude adapter, the SDK enables `includePartialMessages`. A tool content-block start emits a tool call. Each `input_json_delta` adds to accumulated input JSON. When the runtime's best-effort partial parser can produce an object, the runtime sends a `tool_call_update` with the whole growing `rawInput` snapshot. It skips deltas it cannot parse. The granularity is the model's input delta, with no fixed character, word or timing guarantee.

Sources: [packages/agent/packages/agent/src/adapters/claude/session/options.ts:747](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/packages/agent/packages/agent/src/adapters/claude/session/options.ts#L747); [packages/agent/packages/agent/src/adapters/claude/conversion/sdk-to-acp.ts:625-658](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/packages/agent/packages/agent/src/adapters/claude/conversion/sdk-to-acp.ts#L625-L658); [packages/agent/packages/agent/src/adapters/claude/conversion/sdk-to-acp.ts:697-719](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/packages/agent/packages/agent/src/adapters/claude/conversion/sdk-to-acp.ts#L697-L719); [packages/agent/packages/agent/src/utils/partial-json.ts:13-67](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/packages/agent/packages/agent/src/utils/partial-json.ts#L13-L67). The existing test expects successive `command` values `echo`, `echo hello`, and `echo hello world`: [packages/agent/packages/agent/src/adapters/claude/conversion/sdk-to-acp.test.ts:221-262](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/packages/agent/packages/agent/src/adapters/claude/conversion/sdk-to-acp.test.ts#L221-L262). I read this runtime test; I did not run it.

The frontend folds these snapshots into `invocation.input`. Input replaces the previous input object. Other omitted fields retain their previous values. The bus emits `started` for a tool call, `updated` for a nonterminal update, and `completed` or `failed` for the first transition into that status. A later update to an already terminal call is also `updated`. Therefore `updated` alone does not mean that input is still being generated.

Sources: [products/posthog_ai/frontend/logics/runStreamLogic.ts:1399-1475](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/posthog_ai/frontend/logics/runStreamLogic.ts#L1399-L1475); [products/posthog_ai/frontend/logics/runStreamLogic.ts:5093-5165](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/posthog_ai/frontend/logics/runStreamLogic.ts#L5093-L5165).

PostHog MCP uses an outer `exec` tool. Its input is shaped like `{command: "call <tool-name> <JSON arguments>"}`. The frontend can resolve the inner name once the command contains the name. At the start, it can be unknown. During generation, it can also be an unfinished name token. There is no separate early declaration of the final inner name.

The important limit is the second JSON layer. The runtime parses incomplete outer JSON, so `invocation.input.command` can grow while its string contains unfinished inner JSON. The frontend resolver uses ordinary `JSON.parse` on that inner JSON. On failure it returns the name but omits `innerInput`. A growing raw command is available before completion. A normalized partial email design or operations object is not supplied by the existing resolver.

Sources: [products/posthog_ai/frontend/utils/toolResolver.ts:59-100](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/posthog_ai/frontend/utils/toolResolver.ts#L59-L100); [products/posthog_ai/frontend/components/tool/posthogExecDisplay.ts:26-82](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/posthog_ai/frontend/components/tool/posthogExecDisplay.ts#L26-L82).

A preview can subscribe to bus updates and inspect the raw input. It must treat the values as provisional. Applying a validated complete tool result is a separate step. The Claude source proves that partial input is supported; it does not establish an identical cadence for every adapter or the default published sandbox package. Choose a Claude model when proving this exact stream behavior.

### Apply-back cannot transfer an email target mid-turn

`useMcpToolApplyBack` registers an activation ID made from `targetKey` plus a UUID. Changing the key, active state, or matched tools creates a new registration. Send paths snapshot the active registrations by stream before making the request.

The bus matches claims by tool name, not by resource IDs in the tool arguments. It delivers an apply-back event only when exactly one claimed target matches that tool and the listener owns that target ID. Two email listeners claiming the same email-edit tool suppress both deliveries, even if the tool input names only one email. Ordinary bus listeners still receive the event.

Sources: [products/posthog_ai/frontend/hooks/useMcpToolApplyBack.ts:43-119](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/posthog_ai/frontend/hooks/useMcpToolApplyBack.ts#L43-L119); [products/posthog_ai/frontend/logics/toolStreamEventsLogic.ts:229-255](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/posthog_ai/frontend/logics/toolStreamEventsLogic.ts#L229-L255); [products/posthog_ai/frontend/logics/runInteractionLogic.ts:1326-1330](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/posthog_ai/frontend/logics/runInteractionLogic.ts#L1326-L1330); [products/posthog_ai/frontend/logics/runInteractionLogic.ts:1538-1555](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/posthog_ai/frontend/logics/runInteractionLogic.ts#L1538-L1555); [products/posthog_ai/frontend/scenes/TaskTracker/taskTrackerSceneLogic.ts:819](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/posthog_ai/frontend/scenes/TaskTracker/taskTrackerSceneLogic.ts#L819). Existing ambiguity and navigation tests: [products/posthog_ai/frontend/logics/toolStreamEventsLogic.test.ts:114-166](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/posthog_ai/frontend/logics/toolStreamEventsLogic.test.ts#L114-L166).

If email A deregisters and email B registers during the turn, B cannot inherit A's claim. Returning to A also creates a new activation. The explicit `transferApplyBackTargets` action moves a claim between stream keys. It does not transfer ownership between editor activations.

The hook ignores `started`, `updated`, and `failed`. Its actual default is `tool_call_completed`, which applies each matching completion. `turn_end` keeps only the last matching completion across the listener and applies it once on turn completion or run termination. It does not keep a final result per email. A foreground-stream change drops the buffered result, and turn/run completion releases the claims.

Sources: [products/posthog_ai/frontend/hooks/useMcpToolApplyBack.ts:48-119](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/posthog_ai/frontend/hooks/useMcpToolApplyBack.ts#L48-L119); [products/posthog_ai/frontend/logics/toolStreamEventsLogic.ts:202-215](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/posthog_ai/frontend/logics/toolStreamEventsLogic.ts#L202-L215); [products/posthog_ai/frontend/logics/toolStreamEventsLogic.ts:265-307](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/posthog_ai/frontend/logics/toolStreamEventsLogic.ts#L265-L307). Existing hook tests cover completion timing, ignoring updates, and deactivation: [products/posthog_ai/frontend/hooks/useMcpToolApplyBack.test.tsx:42-153](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/posthog_ai/frontend/hooks/useMcpToolApplyBack.test.tsx#L42-L153).

The frontend README says the default is `turn_end` near its apply-back recipe. The implementation, product README and integration skill say `tool_call_completed`. Use the implementation. Source: [products/posthog_ai/frontend/README.md:322-325](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/posthog_ai/frontend/README.md#L322-L325).

The existing SQL caller claims `sql:${tabId}` and applies the parsed tool input through its existing SQL-edit callback. The dashboard caller claims its dashboard ID and checks the `dashboards` argument before reloading. Neither transfers a target or uses streaming input.

Sources: [frontend/src/scenes/data-warehouse/editor/QueryWindow.tsx:185-197](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/frontend/src/scenes/data-warehouse/editor/QueryWindow.tsx#L185-L197); [frontend/src/scenes/dashboard/DashboardHeader.tsx:24-45](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/frontend/src/scenes/dashboard/DashboardHeader.tsx#L24-L45); [products/posthog_ai/README.md:93-131](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/posthog_ai/README.md#L93-L131); [.agents/skills/integrating-with-posthog-ai/references/reacting-to-tool-calls.md:72-87](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/.agents/skills/integrating-with-posthog-ai/references/reacting-to-tool-calls.md#L72-L87).

For the map's sequence requirement, the existing hook cannot follow independent per-email activations automatically. The prototype needs an owner that keeps its claim while it switches the visible email and routes edits by explicit email IDs, or a change to the targeting contract. A sequence-level draft owner is one candidate. This is an implication of the current code, not a selected architecture.

### The web app reacts to tool results and can answer interaction requests

The current PostHog AI web hook is a notification consumer. Its callback returns `void`. It does not reply to the tool call or replace the result returned to the model. MCP parses arguments, validates them, and invokes its handler on the server.

The web run logic can answer permissions and questions. It sends `permission_response` with the request ID, selected option, optional custom input and question answers. Normal messages, cancellation and configuration are separate commands.

Sources: [products/posthog_ai/frontend/hooks/useMcpToolApplyBack.ts:18-34](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/posthog_ai/frontend/hooks/useMcpToolApplyBack.ts#L18-L34); [products/posthog_ai/frontend/logics/runStreamLogic.ts:4459-4518](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/posthog_ai/frontend/logics/runStreamLogic.ts#L4459-L4518); [services/mcp/src/tools/exec.ts:1947-2017](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/services/mcp/src/tools/exec.ts#L1947-L2017).

There is a generic `mcp_response` command in the tasks API and agent server. It supports the separate desktop MCP relay, whose designated servers send `mcp_request` back to the desktop client. There is no `mcp_request` consumer or `mcp_response` sender under the current PostHog AI frontend. That relay does not make the existing web apply-back callback a frontend-executed sandbox tool.

Sources: [products/tasks/backend/presentation/serializers.py:4382-4399](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/tasks/backend/presentation/serializers.py#L4382-L4399); [packages/agent/packages/agent/src/server/agent-server.ts:1904-1921](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/packages/agent/packages/agent/src/server/agent-server.ts#L1904-L1921); [packages/agent/packages/agent/src/server/mcp-relay-server.ts:50](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/packages/agent/packages/agent/src/server/mcp-relay-server.ts#L50); [packages/agent/packages/agent/src/server/mcp-relay-server.ts:225](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/packages/agent/packages/agent/src/server/mcp-relay-server.ts#L225).

For a stateless tool returning a patched email, the result must retain the handler object for the frontend. The worker identifies the MCP consumer as `posthog_ai`; MCP preserves native app data for that consumer. `getToolOutputRecord` reads `rawOutput._meta["com.posthog.mcp/app_data"]`, then `structuredContent`, then a direct record. It rejects failed results and does not parse model-facing text. A bus invocation exposes this result as `invocation.output`, while the extractor takes a `rawOutput` field.

Sources: [products/tasks/backend/temporal/process_task/utils.py:741](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/tasks/backend/temporal/process_task/utils.py#L741); [products/tasks/backend/temporal/process_task/utils.py:842](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/tasks/backend/temporal/process_task/utils.py#L842); [services/mcp/src/tools/exec.ts:2062](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/services/mcp/src/tools/exec.ts#L2062); [products/posthog_ai/frontend/utils/getToolOutputRecord.ts:7-29](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/posthog_ai/frontend/utils/getToolOutputRecord.ts#L7-L29); [products/posthog_ai/frontend/logics/runStreamLogic.ts:1463-1475](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/posthog_ai/frontend/logics/runStreamLogic.ts#L1463-L1475).

## Running a real turn locally

These are source-supported steps, not a claim that I completed a real run. Use a checkout with its own prepared environment. Commands run from that checkout's repository root.

1. Prepare the environment:

   ```sh
   .codex/with-flox --prepare true
   ```

2. Select the required dev services:

   ```sh
   .codex/with-flox hogli dev:setup
   ```

   Select `ai_features`, `tasks`, and `mcp`. If setup is already saved, add these for this generation:

   ```sh
   .codex/with-flox hogli dev:generate --with ai_features --with tasks --with mcp
   .codex/with-flox hogli dev:explain ai_features tasks mcp
   ```

   The first two intents include the LLM gateway, Temporal worker and agent proxy. They do not include the MCP server. The `mcp` intent adds it. The agent itself starts on demand inside the sandbox; it is not a permanently running phrocs unit.

   Sources: [devenv/intent-map.yaml:368-384](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/devenv/intent-map.yaml#L368-L384); [devenv/intent-map.yaml:416-418](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/devenv/intent-map.yaml#L416-L418); [tools/hogli-commands/hogli_commands/devenv/cli.py:32-48](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/tools/hogli-commands/hogli_commands/devenv/cli.py#L32-L48).

3. Set local runtime and model configuration. Store model credentials in the checkout's gitignored environment files. Do not commit their values.

   ```dotenv
   DEBUG=1
   SANDBOX_PROVIDER=docker
   SANDBOX_MCP_URL=http://host.docker.internal:8787/mcp
   SANDBOX_LLM_GATEWAY_URL=http://host.docker.internal:3308
   LOCAL_POSTHOG_CODE_MONOREPO_ROOT=./packages/agent
   ```

   Give the gateway `LLM_GATEWAY_ANTHROPIC_API_KEY` for the Claude stream described above. `LLM_GATEWAY_OPENAI_API_KEY` enables the OpenAI route. The gateway also supports Bedrock with its region and AWS credentials. Root `.env.local` loads with the normal stack; the gateway startup also sources root `.env`. Put the runtime settings above into `.env.local` as well if they must reach processes that do not source the legacy `.env` directly. The wrapper also loads the selected dotenv file before each command.

   Explicit `SANDBOX_LLM_GATEWAY_URL` avoids deriving a nonlocal gateway when `SITE_URL` uses a devbox hostname. The worker passes this URL into the sandbox. Docker needs no Modal account.

   Sources: [bin/start:69](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/bin/start#L69); [bin/start-llm-gateway:6-37](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/bin/start-llm-gateway#L6-L37); [services/llm-gateway/src/llm_gateway/config.py:165-167](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/services/llm-gateway/src/llm_gateway/config.py#L165-L167); [services/llm-gateway/src/llm_gateway/config.py:350](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/services/llm-gateway/src/llm_gateway/config.py#L350); [services/llm-gateway/src/llm_gateway/main.py:144-156](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/services/llm-gateway/src/llm_gateway/main.py#L144-L156); [services/llm-gateway/README.md:202](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/services/llm-gateway/README.md#L202); [docs/internal/sandboxes-setup-guide.md:161-168](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/docs/internal/sandboxes-setup-guide.md#L161-L168); [docs/internal/sandboxes-setup-guide.md:351-372](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/docs/internal/sandboxes-setup-guide.md#L351-L372); [products/tasks/backend/temporal/process_task/activities/provision_sandbox.py:580](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/tasks/backend/temporal/process_task/activities/provision_sandbox.py#L580).

4. Start the selected stack and wait for the databases:

   ```sh
   .codex/with-flox hogli up -d -y
   .codex/with-flox hogli services:ready -y
   .codex/with-flox hogli wait -y
   .codex/with-flox python manage.py setup_background_agents
   ```

   The setup command requires DEBUG and a reachable database. It writes missing sandbox settings into root `.env`, creates the Array OAuth application, enables `tasks`, and builds the agent skills bundle. It does not enable `phai-sandbox-mode`.

   Sources: [.agents/skills/run-posthog/SKILL.md:22-41](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/.agents/skills/run-posthog/SKILL.md#L22-L41); [products/tasks/backend/management/commands/setup_background_agents.py:17-98](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/tasks/backend/management/commands/setup_background_agents.py#L17-L98); [products/tasks/backend/management/commands/setup_background_agents.py:160](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/tasks/backend/management/commands/setup_background_agents.py#L160).

5. Restart the Temporal worker after changes to sandbox environment. On a dedicated stack, restarting all selected processes uses:

   ```sh
   .codex/with-flox hogli down -y
   .codex/with-flox hogli up -d -y
   .codex/with-flox hogli wait -y
   ```

   Do this on the stack you own. Worktrees share infrastructure and compete for application ports. If MCP was omitted from an existing running selection, its standalone command is:

   ```sh
   .codex/with-flox hogli start:mcp:server
   ```

   MCP startup creates `services/mcp/.env` from its example when missing. The defaults target PostHog at `http://localhost:8010` and listen on `8787`. Verify that the sandbox can reach the host API, MCP and gateway. Check application health and the units `backend`, `frontend`, `temporal-worker`, `llm-gateway`, `mcp`, and, when proxy streaming is selected, `agent-proxy`.

   Sources: [docs/internal/sandboxes-setup-guide.md:364](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/docs/internal/sandboxes-setup-guide.md#L364); [bin/start-mcp-server:13-41](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/bin/start-mcp-server#L13-L41); [services/mcp/.env.example:14-22](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/services/mcp/.env.example#L14-L22); [.agents/skills/run-posthog/SKILL.md:134](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/.agents/skills/run-posthog/SKILL.md#L134).

6. Enable or locally override the frontend `phai-sandbox-mode` flag for the test browser. Open a fresh AI chat or side-panel conversation and select sandbox mode where the toggle is shown. Use a Claude model for the input-stream proof. Confirm the resulting conversation reports `agent_runtime: "sandbox"`. An existing LangGraph chat does not become a sandbox chat just because the frontend flag changes.

   The compatibility backend sandbox executor bypasses its flag gate under DEBUG. The normal Tasks runner at `/tasks` is another way to smoke-test a real run, but it does not by itself prove email apply-back in the side panel. Repository tasks need GitHub App setup. The email-only PostHog AI path permits no repository and sets `create_pr=False`, so a GitHub App is not a prerequisite just to test an email turn.

   Sources: [ee/hogai/utils/feature_flags.py:107-114](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/ee/hogai/utils/feature_flags.py#L107-L114); [ee/hogai/sandbox/executor.py:63](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/ee/hogai/sandbox/executor.py#L63); [frontend/src/scenes/max/components/SandboxModeToggle.tsx:18-43](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/frontend/src/scenes/max/components/SandboxModeToggle.tsx#L18-L43); [products/posthog_ai/backend/message_routing.py:255-279](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/posthog_ai/backend/message_routing.py#L255-L279); [docs/internal/sandboxes-setup-guide.md:137-145](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/docs/internal/sandboxes-setup-guide.md#L137-L145).

7. First prove a real read-only MCP call completes, such as asking the agent to list workflow templates. Then, with the proposed email tool and editor integration installed, record the map's subject, paragraph and button requests in the open editor. Confirm changes survive switching emails and appear in the user-triggered save or Enable result. Use invented email content and reserved example addresses for the recording. This last step depends on the implementation layers and remains unperformed by this research.

### Runtime source and package version

The runtime source is `packages/agent` in this monorepo. The example environment says the standalone `PostHog/code` repository is archived. Default Docker startup installs the published `@posthog/agent` package, version `2.4.256` at this source commit. Setting `LOCAL_POSTHOG_CODE_MONOREPO_ROOT=./packages/agent` makes the local Docker image build those checked-out agent packages. Use that setting if the proof must match the code cited here.

Sources: [.env.example:11-12](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/.env.example#L11-L12); [products/tasks/backend/sandbox/images/Dockerfile.sandbox-base:164](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/tasks/backend/sandbox/images/Dockerfile.sandbox-base#L164); [docs/internal/sandboxes-setup-guide.md:351-363](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/docs/internal/sandboxes-setup-guide.md#L351-L363).

The optional Go gateway startup expects a sibling checkout of `PostHog/ai-gateway`. I tried `gh repo view PostHog/ai-gateway`; current access could not resolve it. I could not inspect that repository or pin an external SHA. The baseline local recipe above uses the existing Python gateway and does not require the Go gateway. This research does not establish parity for the optional route.

Source: [bin/start-ai-gateway:16-24](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/bin/start-ai-gateway#L16-L24).

### What I actually ran

In the isolated research worktree:

- `.codex/with-flox --prepare true` succeeded. `.codex/with-flox node --version` returned `v24.13.0`.
- `.codex/with-flox hogli dev:explain ai_features tasks mcp` succeeded and resolved the expected services. `hogli dev:generate --help` confirmed the exact `--with` syntax. I did not generate a config or start/stop services.
- `.codex/with-flox docker info --format '{{.ServerVersion}}'` succeeded. This proves daemon access, not sandbox startup.
- `curl -sS --max-time 3 -o /dev/null -w '%{http_code}' http://localhost:8010/_health` returned `502`. A request to `http://localhost:8787/health` could not connect.
- A Python check printed only whether required variables were present. Sandbox provider, JWT and MCP URL were present. Both prefixed gateway model API keys and both unprefixed model API keys were absent from the loaded environment. The explicit sandbox gateway URL and local-agent-source override were also absent. This does not inspect credentials held by another running service.
- I ran the existing tests with:

  ```sh
  .codex/with-flox hogli test products/posthog_ai/frontend/hooks/useMcpToolApplyBack.test.tsx products/posthog_ai/frontend/logics/toolStreamEventsLogic.test.ts products/posthog_ai/frontend/utils/posthogContextBlock.test.ts --runInBand
  ```

  All three suites passed, with 20 tests. These prove the tested frontend contracts, not a real sandbox turn.

- I measured checked-in design JSON with Python and the installed `tiktoken`, then ran the actual frontend context wrapper with Node. The results are below.

I did not boot a new shared stack, install model credentials, invoke setup against the shared database, or record a real model turn. The local inspection took well below the 30-minute boot-attempt budget. The end-to-end proof is still open.

## Context size and cost

### Limits that apply to different paths

| Path                                | Actual constant or behavior                                                                                      | Meaning                                                                                                                                                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current frontend context wrapping   | No item-count, character or token cap in `formatPosthogContextBlock` or `wrapWithPosthogContext`                 | Context becomes part of the outgoing message string.                                                                                                                                                           |
| Current task command / run creation | `user_message` validates content shape, with no length cap here; `pending_user_message` has no `max_length`      | These serializers do not reserve an attachment budget.                                                                                                                                                         |
| Workflow editor state               | `EDITOR_STATE_MAX_CHARS = 64_000`                                                                                | Above this threshold, designs become fetch markers. The function does not recheck the final length, so this is not a strict total-size ceiling.                                                                |
| Legacy conversation bridge          | `MAX_ATTACHED_ITEMS = 32`, `MAX_TEXT_LENGTH = 4096`                                                              | These belong to the deprecated backend attachment path. They do not cap the current frontend-wrapped tasks message.                                                                                            |
| Django request body                 | `DATA_UPLOAD_MAX_MEMORY_SIZE = 20971520`                                                                         | A 20 MiB transport setting, not a sensible model-context budget. Other deployed proxies can impose other transport limits.                                                                                     |
| Agent session                       | `DEFAULT_CONTEXT_WINDOW = 200_000`, `CONTEXT_WINDOW_200K_TOKENS = 200_000`                                       | Whole-session fallback/window constants, not per-message attachment limits. Supported Claude models also offer `1m` using `CONTEXT_WINDOW_1M_BETA = "context-1m-2025-08-07"`. Actual model/SDK window applies. |
| Uploaded files                      | `MAX_ATTACHMENTS_PER_MESSAGE = 10`, `ATTACHMENT_MAX_SIZE_BYTES = 30 * 1024 * 1024`, PDF limit `10 * 1024 * 1024` | File uploads are separate from inline editor context.                                                                                                                                                          |

Sources: [products/posthog_ai/frontend/utils/posthogContextBlock.ts:47-67](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/posthog_ai/frontend/utils/posthogContextBlock.ts#L47-L67); [products/posthog_ai/frontend/utils/posthogContextBlock.ts:117-134](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/posthog_ai/frontend/utils/posthogContextBlock.ts#L117-L134); [products/tasks/backend/presentation/serializers.py:3583-3588](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/tasks/backend/presentation/serializers.py#L3583-L3588); [products/tasks/backend/presentation/serializers.py:4435-4466](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/tasks/backend/presentation/serializers.py#L4435-L4466); [products/workflows/frontend/Workflows/workflowAgentContext.ts:278-322](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/workflows/frontend/Workflows/workflowAgentContext.ts#L278-L322); [products/posthog_ai/backend/context_wrapper.py:4-11](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/posthog_ai/backend/context_wrapper.py#L4-L11); [products/posthog_ai/backend/context_wrapper.py:45-47](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/posthog_ai/backend/context_wrapper.py#L45-L47); [posthog/settings/web.py:252](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/posthog/settings/web.py#L252); [packages/agent/packages/agent/src/adapters/base-acp-agent.ts:60](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/packages/agent/packages/agent/src/adapters/base-acp-agent.ts#L60); [packages/agent/packages/agent/src/adapters/claude/session/models.ts:49-65](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/packages/agent/packages/agent/src/adapters/claude/session/models.ts#L49-L65); [products/posthog_ai/frontend/utils/attachments.ts:9-13](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/posthog_ai/frontend/utils/attachments.ts#L9-L13).

Do not attach both rendered HTML and the design if the design can reproduce the HTML. The existing workflow serializer removes HTML in that case. Eliding a design with a fetch hint does not solve an oversized unsaved email that no backend tool can fetch. The proposed integration needs its own explicit budget and an oversized-unsaved-state behavior.

Context dedupe is task-scoped. `text` always resends. Other items dedupe by `type` plus `key` or `value`, and by rendered lines seen in history. A value-only design item gets a new identity when its serialization changes. A fixed keyed item renders its key rather than its value, so adding a design to a keyed item does not send the design.

Sources: [products/posthog_ai/frontend/logics/runInteractionLogic.ts:1117-1137](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/posthog_ai/frontend/logics/runInteractionLogic.ts#L1117-L1137); [products/posthog_ai/frontend/types/contextTypes.ts:40-43](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/posthog_ai/frontend/types/contextTypes.ts#L40-L43); [products/posthog_ai/frontend/utils/posthogContextBlock.ts:117-125](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/posthog_ai/frontend/utils/posthogContextBlock.ts#L117-L125).

### Measured template email

I measured `products/workflows/backend/templates/welcome_email_sequence_template.json`, at `actions[1].config.inputs.email.value.design`. Compact serialization retains all IDs. This is a concrete small welcome-email example, not a distribution-wide average.

| Payload                                  | Characters / UTF-8 bytes | ID fields | cl100k_base tokens | o200k_base tokens |
| ---------------------------------------- | -----------------------: | --------: | -----------------: | ----------------: |
| First welcome email design               |            2,778 / 2,778 |         4 |                749 |               766 |
| Second email design in the same sequence |            2,700 / 2,700 |         4 |                729 |               742 |

The actual `wrapWithPosthogContext("", [{type: "email_design", value: JSON.stringify(design)}])` produced 3,357 characters for the first design. The wrapper added 579 characters. Prompt text, subject, preheader, resource IDs and any standing instructions add more. A simple four-characters-per-token estimate gives about 840 tokens for that wrapped example. The measured design-only token counts show why the estimate is approximate. These tokenizers do not measure Claude billing tokens, and I did not establish a dollar cost.

Sources: [products/workflows/backend/templates/welcome_email_sequence_template.json:122-277](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/workflows/backend/templates/welcome_email_sequence_template.json#L122-L277); [products/workflows/backend/templates/welcome_email_sequence_template.json:324-479](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/workflows/backend/templates/welcome_email_sequence_template.json#L324-L479); [products/posthog_ai/frontend/utils/posthogContextBlock.ts:128-134](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/posthog_ai/frontend/utils/posthogContextBlock.ts#L128-L134).

To reproduce the design-only measurement:

```sh
.codex/with-flox python - <<'PY'
import json
from pathlib import Path
import tiktoken

template = json.loads(
    Path("products/workflows/backend/templates/welcome_email_sequence_template.json").read_text()
)
for action_index in (1, 3):
    design = template["actions"][action_index]["config"]["inputs"]["email"]["value"]["design"]
    payload = json.dumps(design, ensure_ascii=False, separators=(",", ":"))
    print(action_index, len(payload), len(payload.encode("utf-8")))
    for encoding_name in ("cl100k_base", "o200k_base"):
        encoding = tiktoken.get_encoding(encoding_name)
        print(encoding_name, len(encoding.encode(payload)))
PY
```

## Documentation checked

The integration guide recommends MCP capability plus frontend cooperation through `api/logics`. It freezes new LangGraph integrations. The product and frontend READMEs describe attached context, the tool-event bus, and apply-back. I checked their claims against the implementation rather than treating them as the stream protocol.

Sources: [.agents/skills/integrating-with-posthog-ai/SKILL.md:10-39](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/.agents/skills/integrating-with-posthog-ai/SKILL.md#L10-L39); [.agents/skills/integrating-with-posthog-ai/SKILL.md:59-68](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/.agents/skills/integrating-with-posthog-ai/SKILL.md#L59-L68); [products/posthog_ai/README.md:20-42](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/posthog_ai/README.md#L20-L42); [products/posthog_ai/frontend/README.md:303-341](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/products/posthog_ai/frontend/README.md#L303-L341); [docs/published/handbook/engineering/ai/sandboxed-agents.md:27-38](https://github.com/PostHog/posthog/blob/5202af95fd153f32ffc999dc1b75157e17e6362b/docs/published/handbook/engineering/ai/sandboxed-agents.md#L27-L38).

## What remains unestablished

- A successful local sandbox/model/MCP turn and a recording of the proposed email integration.
- Exact live input cadence for non-Claude adapters or the default published agent package.
- A per-message model token allowance or exact monetary cost. The current inline context path has no reserved attachment budget.
- The optional `PostHog/ai-gateway` source and revision, which current repository access could not resolve.
