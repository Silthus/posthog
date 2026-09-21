// Shapes of the workflow definition: the nodes-and-edges JSON that POST/PATCH
// /api/projects/{id}/hog_flows/ accepts. Lifted by reading
// prototype/workflows-as-code sdk/types.ts, then extended to the v1 surface
// locked by issue #69: a `schedule` trigger and a `function_email` action.

/** A duration the DRF serializer accepts: `^\d*\.?\d+[dhm]$`. The compiler rejects `"soon"`. */
export type Duration = `${number}d` | `${number}h` | `${number}m`

export type PropertyType = 'event' | 'person' | 'group'

export type PropertyOperator =
    | 'exact'
    | 'is_not'
    | 'icontains'
    | 'not_icontains'
    | 'is_set'
    | 'is_not_set'
    | 'gt'
    | 'lt'

/** One property condition. `bytecode` is compiled server-side and is never sent. */
export interface PropertyCondition {
    readonly key: string
    readonly value?: readonly (string | number | boolean)[]
    readonly operator: PropertyOperator
    readonly type: PropertyType
}

export interface EventFilter {
    readonly id: string
    readonly name: string
    readonly type: 'events'
    readonly order: number
    readonly properties?: readonly PropertyCondition[]
}

export interface ActionFilters {
    readonly events?: readonly EventFilter[]
    readonly properties?: readonly PropertyCondition[]
    readonly filter_test_accounts?: boolean
}

/** Trigger config, discriminated on `type`. v1 covers `event` and `schedule` only. */
export type TriggerConfig = { readonly type: 'event'; readonly filters: ActionFilters } | { readonly type: 'schedule' }

export interface BranchCondition {
    readonly filters: { readonly properties: readonly PropertyCondition[] }
    readonly name?: string
}

/** Function input values are wrapped so hog templating (`{person.x}`) resolves. */
export type FunctionInputs = Readonly<Record<string, { readonly value: unknown }>>

/** The inline email message. `template-email`'s single input, at config.inputs.email.value. */
export interface EmailMessage {
    readonly from: { readonly integrationId?: number }
    readonly to: { readonly email: string; readonly name?: string }
    readonly subject: string
    readonly text: string
    readonly html: string
    readonly preheader?: string
}

export type ActionType = 'trigger' | 'delay' | 'conditional_branch' | 'function' | 'function_email' | 'exit'

interface ActionBase {
    readonly id: string
    readonly name: string
    readonly description?: string
    readonly on_error?: 'continue' | 'abort'
}

export type Action =
    | (ActionBase & { readonly type: 'trigger'; readonly config: TriggerConfig })
    | (ActionBase & { readonly type: 'delay'; readonly config: { readonly delay_duration: Duration } })
    | (ActionBase & {
          readonly type: 'conditional_branch'
          readonly config: { readonly conditions: readonly BranchCondition[] }
      })
    | (ActionBase & {
          readonly type: 'function'
          readonly config: { readonly template_id: string; readonly inputs: FunctionInputs }
      })
    | (ActionBase & {
          readonly type: 'function_email'
          // `template_id` is coerced server-side to `template-email` whatever we send
          // (hog_flow.py:560, applied at :1600), so the SDK sends the literal and never a uuid.
          readonly config: {
              readonly template_id: 'template-email'
              readonly inputs: { readonly email: { readonly value: EmailMessage } }
          }
      })
    | (ActionBase & { readonly type: 'exit'; readonly config: { readonly reason?: string } })

export type Edge =
    | { readonly from: string; readonly to: string; readonly type: 'continue' }
    | { readonly from: string; readonly to: string; readonly type: 'branch'; readonly index: number }

export type ExitCondition =
    | 'exit_only_at_end'
    | 'exit_on_conversion'
    | 'exit_on_trigger_not_matched'
    | 'exit_on_trigger_not_matched_or_conversion'

export type WorkflowStatus = 'draft' | 'active' | 'archived'

/**
 * The create/update request body. Deliberately narrow: `trigger`, `version`,
 * `billable_action_types`, `abort_action`, `action_redirects` and the `draft*`
 * fields are read-only on HogFlowSerializer and must never be sent.
 */
export interface WorkflowDefinition {
    readonly name: string
    readonly description: string
    readonly status: WorkflowStatus
    readonly exit_condition: ExitCondition
    readonly actions: readonly Action[]
    readonly edges: readonly Edge[]
}
