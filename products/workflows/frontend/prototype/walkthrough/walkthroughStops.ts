import { parseDuration } from '../../Workflows/hogflows/steps/durations'
import type { HogFlow, HogFlowAction } from '../../Workflows/hogflows/types'

export type WalkthroughStopKind = 'overview' | 'trigger' | 'email' | 'delay' | 'branch' | 'finish'

export interface WalkthroughEditor {
    setWorkflowActionConfig: (actionId: string, config: HogFlowAction['config']) => void
    setWorkflowInfo: (workflow: Partial<HogFlow>) => void
}

export interface WalkthroughChip {
    label: string
    prompt: string
    summary: string
    apply: (workflow: HogFlow, editor: WalkthroughEditor) => void
}

export interface WalkthroughStop {
    id: string
    kind: WalkthroughStopKind
    actionId: string | null
    anchorActionId: string | null
    title: string
    body: string
    chips: WalkthroughChip[]
}

type EmailAction = Extract<HogFlowAction, { type: 'function_email' }>
type DelayAction = Extract<HogFlowAction, { type: 'delay' }>
type BranchAction = Extract<HogFlowAction, { type: 'conditional_branch' }>
type TriggerAction = Extract<HogFlowAction, { type: 'trigger' }>

interface EmailContent {
    subject?: string
    text?: string
    from?: { email?: string; name?: string }
}

function emailContent(action: EmailAction): EmailContent {
    return (action.config.inputs.email?.value ?? {}) as EmailContent
}

function withEmailContent(action: EmailAction, patch: Partial<EmailContent>): EmailAction['config'] {
    const current = action.config.inputs.email
    return {
        ...action.config,
        inputs: {
            ...action.config.inputs,
            email: { ...current, value: { ...(current?.value as object), ...patch } },
        },
    }
}

// Copy reads a template the way a person would: "{{ person.properties.first_name }}" becomes "[first name]".
function plain(text: string | undefined): string {
    return (text ?? '').replace(
        /\{\{\s*person\.properties\.(\w+)\s*\}\}/g,
        (_, key: string) => `[${key.replace(/_/g, ' ')}]`
    )
}

function humanDuration(duration: string | undefined): string {
    const parsed = duration ? parseDuration(duration) : null
    if (!parsed) {
        return 'a while'
    }
    const units = { d: 'day', h: 'hour', m: 'minute', s: 'second' }[parsed.unit]
    return `${parsed.amountText} ${units}${parsed.amount === 1 ? '' : 's'}`
}

function triggerEventName(action: TriggerAction): string {
    const config = action.config as { filters?: { events?: { name?: string; id?: string }[] } }
    const event = config.filters?.events?.[0]
    return event?.name ?? event?.id ?? 'an event'
}

function nextActionId(workflow: HogFlow, fromId: string, type: 'continue' | 'branch' = 'continue'): string | null {
    return workflow.edges.find((edge) => edge.from === fromId && edge.type === type)?.to ?? null
}

function actionById(workflow: HogFlow, id: string | null): HogFlowAction | null {
    return workflow.actions.find((action) => action.id === id) ?? null
}

function stepSummary(action: HogFlowAction): string | null {
    switch (action.type) {
        case 'function_email':
            return `sends "${plain(emailContent(action).subject) || action.name}"`
        case 'delay':
            return `waits ${humanDuration(action.config.delay_duration)}`
        case 'conditional_branch':
            return `checks "${action.config.conditions[0]?.name ?? action.name}"`
        default:
            return null
    }
}

function mainPathOrder(workflow: HogFlow): HogFlowAction[] {
    const ordered: HogFlowAction[] = []
    let current = actionById(workflow, 'trigger') ?? workflow.actions.find((a) => a.type === 'trigger') ?? null
    const seen = new Set<string>()
    while (current && !seen.has(current.id) && current.type !== 'exit') {
        seen.add(current.id)
        ordered.push(current)
        const continueTarget = actionById(workflow, nextActionId(workflow, current.id, 'continue'))
        const branchTarget = actionById(workflow, nextActionId(workflow, current.id, 'branch'))
        const continueIsExit = !continueTarget || continueTarget.type === 'exit'
        current = continueIsExit && branchTarget && branchTarget.type !== 'exit' ? branchTarget : continueTarget
    }
    return ordered
}

function joinSentence(parts: string[]): string {
    if (parts.length <= 1) {
        return parts.join('')
    }
    return `${parts.slice(0, -1).join(', ')}, then ${parts[parts.length - 1]}`
}

function overviewStop(workflow: HogFlow, path: HogFlowAction[]): WalkthroughStop {
    const trigger = path.find((a): a is TriggerAction => a.type === 'trigger')
    const summaries = path.map(stepSummary).filter((s): s is string => !!s)
    const live = workflow.status === 'active'
    return {
        id: 'overview',
        kind: 'overview',
        actionId: null,
        anchorActionId: trigger?.id ?? null,
        title: workflow.name,
        body: `Starts when someone sends "${trigger ? triggerEventName(trigger) : 'an event'}" and ${joinSentence(summaries)}. ${
            live
                ? 'It is live, so new signups enter it right now.'
                : 'It is a draft, so nothing sends until you enable it.'
        }`,
        chips: [
            {
                label: 'Give it a clearer name',
                prompt: 'Give this workflow a clearer name that says who it is for.',
                summary: 'Renamed the workflow to "New signup welcome sequence".',
                apply: (_, editor) => editor.setWorkflowInfo({ name: 'New signup welcome sequence' }),
            },
            {
                label: 'Describe the goal',
                prompt: 'Write a one-line description that explains the goal of this workflow.',
                summary: 'Updated the description to say the goal is getting new signups through onboarding.',
                apply: (_, editor) =>
                    editor.setWorkflowInfo({
                        description: 'Get new signups through onboarding in their first week.',
                    }),
            },
        ],
    }
}

function triggerStop(action: TriggerAction): WalkthroughStop {
    const event = triggerEventName(action)
    return {
        id: action.id,
        kind: 'trigger',
        actionId: action.id,
        anchorActionId: action.id,
        title: 'Trigger',
        body: `Starts when someone sends "${event}". Every person who sends that event enters the workflow, once each.`,
        chips: [
            {
                label: 'Only people from the US',
                prompt: 'Only start this workflow for people in the US.',
                summary: 'Added a filter so only people with a US country code enter.',
                apply: (_, editor) =>
                    editor.setWorkflowActionConfig(action.id, {
                        ...action.config,
                        filters: {
                            ...(action.config as { filters?: object }).filters,
                            properties: [
                                {
                                    key: '$geoip_country_code',
                                    value: ['US'],
                                    operator: 'exact',
                                    type: 'person',
                                },
                            ],
                        },
                    } as TriggerAction['config']),
            },
            {
                label: 'Skip people who already pay',
                prompt: 'Do not start this workflow for people who already have a paid plan.',
                summary: 'Added a filter so people with a paid plan do not enter.',
                apply: (_, editor) =>
                    editor.setWorkflowActionConfig(action.id, {
                        ...action.config,
                        filters: {
                            ...(action.config as { filters?: object }).filters,
                            properties: [{ key: 'plan', value: 'is_not_set', operator: 'is_not_set', type: 'person' }],
                        },
                    } as TriggerAction['config']),
            },
        ],
    }
}

function emailStop(action: EmailAction): WalkthroughStop {
    const content = emailContent(action)
    const from = content.from?.name ? `${content.from.name} <${content.from.email}>` : content.from?.email
    const opening = plain(content.text).split(/(?<=\.)\s/)[0]
    return {
        id: action.id,
        kind: 'email',
        actionId: action.id,
        anchorActionId: action.id,
        title: action.name,
        body: `Sends "${plain(content.subject)}" from ${from ?? 'the default sender'}. It opens with: "${opening}"`,
        chips: [
            {
                label: 'Make the subject shorter',
                prompt: `Make the subject of "${action.name}" shorter.`,
                summary: 'Shortened the subject.',
                apply: (_, editor) =>
                    editor.setWorkflowActionConfig(
                        action.id,
                        withEmailContent(action, {
                            subject: action.id === 'tips-email' ? 'Three tips to get started' : 'Welcome to Acme',
                        })
                    ),
            },
            {
                label: 'Make it more casual',
                prompt: `Rewrite "${action.name}" in a more casual tone.`,
                summary: 'Rewrote the opening in a more casual tone.',
                apply: (_, editor) =>
                    editor.setWorkflowActionConfig(
                        action.id,
                        withEmailContent(action, {
                            text: `Hey {{ person.properties.first_name }}! ${(content.text ?? '').replace(/^Hi [^,]+, /, '')}`,
                        })
                    ),
            },
            {
                label: 'Send from a different address',
                prompt: `Send "${action.name}" from team@example.com instead.`,
                summary: 'Changed the sender to team@example.com.',
                apply: (_, editor) =>
                    editor.setWorkflowActionConfig(
                        action.id,
                        withEmailContent(action, { from: { ...content.from, email: 'team@example.com' } })
                    ),
            },
        ],
    }
}

function delayStop(action: DelayAction): WalkthroughStop {
    const duration = humanDuration(action.config.delay_duration)
    return {
        id: action.id,
        kind: 'delay',
        actionId: action.id,
        anchorActionId: action.id,
        title: action.name,
        body: `Waits ${duration} after the previous step, then continues. Nothing sends during the wait.`,
        chips: [
            {
                label: 'Wait 3 days instead',
                prompt: 'Change this wait to 3 days.',
                summary: 'Changed the wait to 3 days.',
                apply: (_, editor) =>
                    editor.setWorkflowActionConfig(action.id, { ...action.config, delay_duration: '3d' }),
            },
            {
                label: 'Wait 12 hours instead',
                prompt: 'Change this wait to 12 hours.',
                summary: 'Changed the wait to 12 hours.',
                apply: (_, editor) =>
                    editor.setWorkflowActionConfig(action.id, { ...action.config, delay_duration: '12h' }),
            },
        ],
    }
}

function branchStop(workflow: HogFlow, action: BranchAction): WalkthroughStop {
    const condition = action.config.conditions[0]
    const matchTarget = actionById(workflow, nextActionId(workflow, action.id, 'branch'))
    const elseTarget = actionById(workflow, nextActionId(workflow, action.id, 'continue'))
    const describe = (target: HogFlowAction | null): string =>
        !target || target.type === 'exit' ? 'leave the workflow' : `go to "${target.name}"`
    return {
        id: action.id,
        kind: 'branch',
        actionId: action.id,
        anchorActionId: action.id,
        title: action.name,
        body: `Checks "${condition?.name ?? action.name}". People who match ${describe(matchTarget)}. Everyone else ${describe(
            elseTarget
        )}. The walkthrough follows the second path next.`,
        chips: [
            {
                label: 'Also check if they invited a teammate',
                prompt: 'Also count people who invited a teammate as finished with onboarding.',
                summary: 'Added "invited a teammate" to the check.',
                apply: (_, editor) =>
                    editor.setWorkflowActionConfig(action.id, {
                        ...action.config,
                        conditions: [
                            {
                                ...condition,
                                name: 'Finished onboarding or invited a teammate',
                                filters: {
                                    properties: [
                                        ...(condition?.filters.properties ?? []),
                                        { key: 'invited_teammate', value: ['true'], operator: 'exact', type: 'person' },
                                    ],
                                },
                            },
                        ],
                    }),
            },
            {
                label: 'Rename this check',
                prompt: 'Rename this check to "Completed onboarding".',
                summary: 'Renamed the check to "Completed onboarding".',
                apply: (_, editor) =>
                    editor.setWorkflowActionConfig(action.id, {
                        ...action.config,
                        conditions: [{ ...condition, name: 'Completed onboarding', filters: condition?.filters ?? {} }],
                    }),
            },
        ],
    }
}

function finishStop(exitId: string | null): WalkthroughStop {
    return { id: 'finish', kind: 'finish', actionId: null, anchorActionId: exitId, title: '', body: '', chips: [] }
}

export function buildWalkthroughStops(workflow: HogFlow): WalkthroughStop[] {
    const path = mainPathOrder(workflow)
    const stepStops = path.flatMap((action): WalkthroughStop[] => {
        switch (action.type) {
            case 'trigger':
                return [triggerStop(action)]
            case 'function_email':
                return [emailStop(action)]
            case 'delay':
                return [delayStop(action)]
            case 'conditional_branch':
                return [branchStop(workflow, action)]
            default:
                return []
        }
    })
    const exitId = workflow.actions.find((action) => action.type === 'exit')?.id ?? null
    return [overviewStop(workflow, path), ...stepStops, finishStop(exitId)]
}

export interface FinishCopy {
    title: string
    body: string
}

export function finishCopy(hasDraft: boolean): FinishCopy {
    return hasDraft
        ? {
              title: 'Publish your changes',
              body: 'Your changes are saved as a draft. The live version keeps sending the old content until you publish.',
          }
        : {
              title: "It's sending",
              body: 'This workflow is live. Watch how it performs in Metrics.',
          }
}
