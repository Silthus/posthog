import type { LoopSchemas } from "@posthog/api-client/loops";

/** What the loop's backend can store. Workflow-backed loops carry one trigger,
 * subscribe to one GitHub event type, have no payload conditions, and are the
 * only ones that can react to failed CI. */
export interface LoopTriggerEditorLimits {
  triggerTypes: LoopSchemas.LoopTriggerTypeEnum[];
  maxTriggers: number | null;
  singleGithubEvent: boolean;
  githubPayloadConditions: boolean;
  ciFailedEvent: boolean;
}

export const LOOPS_API_TRIGGER_LIMITS: LoopTriggerEditorLimits = {
  triggerTypes: ["schedule", "github", "api"],
  maxTriggers: null,
  singleGithubEvent: false,
  githubPayloadConditions: true,
  ciFailedEvent: false,
};

export const WORKFLOW_TRIGGER_LIMITS: LoopTriggerEditorLimits = {
  triggerTypes: ["schedule", "github"],
  maxTriggers: 1,
  singleGithubEvent: true,
  githubPayloadConditions: false,
  ciFailedEvent: true,
};
