import { useValues } from 'kea'
import { useMemo } from 'react'

import { IconChat, IconPerson, IconSearch, IconSparkles } from '@posthog/icons'

import { IconSlack } from 'lib/lemon-ui/icons'

import { themeLogic } from '~/layout/navigation-3000/themeLogic'

import { workflowLogic } from '../../../workflowLogic'
import { useHogFlowStep } from '../../steps/HogFlowSteps'
import { isFunctionAction } from '../../steps/types'
import type { HogFlow, HogFlowAction } from '../../types'
import { StepFacts, stepBadge, stepFacts, StepPreviewKind, stepPreviewKind } from './stepFacts'

export type TileShape = 'start' | 'end' | 'step'

export interface TileStep {
    label: string
    icon: React.ReactNode
    color: string
    badge?: string
    facts: StepFacts
    preview: StepPreviewKind
    invalid: boolean
    shape: TileShape
}

interface TemplateLook {
    label: string
    icon?: JSX.Element
    color?: [light: string, dark: string]
}

const AI_COLOR: [string, string] = ['#7c3aed', '#a78bfa']
const TICKET_COLOR: [string, string] = ['#0e7490', '#22d3ee']

const TEMPLATE_LOOKS: Record<string, TemplateLook> = {
    'template-email': { label: 'Email' },
    'template-slack': { label: 'Slack message', icon: <IconSlack />, color: ['#611f69', '#e8a6e0'] },
    'template-webhook': { label: 'Webhook' },
    'template-posthog-create-task': { label: 'AI task', icon: <IconSparkles />, color: AI_COLOR },
    'template-posthog-run-scout': { label: 'Scout', icon: <IconSearch />, color: AI_COLOR },
    'template-posthog-send-ticket-message': { label: 'Ticket message', icon: <IconChat />, color: TICKET_COLOR },
    'template-posthog-update-ticket': { label: 'Update ticket', icon: <IconChat />, color: TICKET_COLOR },
    'template-posthog-update-person-properties': {
        label: 'Update person',
        icon: <IconPerson />,
        color: ['#475569', '#94a3b8'],
    },
}

const TYPE_LABELS: Partial<Record<HogFlowAction['type'], string>> = {
    trigger: 'Trigger',
    exit: 'End',
    function_email: 'Email',
    function_sms: 'SMS',
    function_push: 'Push',
    delay: 'Delay',
    wait_until_condition: 'Wait for an event',
    wait_until_time_window: 'Time window',
    conditional_branch: 'Split',
    random_cohort_branch: 'Random split',
}

export function useTileStep(action: HogFlowAction, workflow: HogFlow): TileStep {
    const step = useHogFlowStep(action)
    const { hogFunctionTemplatesById, actionValidationErrorsById } = useValues(workflowLogic)
    const { isDarkModeOn } = useValues(themeLogic)

    return useMemo(() => {
        const templateId = isFunctionAction(action) ? action.config.template_id : undefined
        const triggerTemplateId =
            action.type === 'trigger' && 'template_id' in action.config ? action.config.template_id : undefined
        const templateName = hogFunctionTemplatesById[templateId ?? triggerTemplateId ?? '']?.name
        const look = templateId ? TEMPLATE_LOOKS[templateId] : undefined
        return {
            label: look?.label ?? TYPE_LABELS[action.type] ?? templateName ?? 'Step',
            icon: look?.icon ?? step?.icon,
            color: look?.color?.[isDarkModeOn ? 1 : 0] ?? step?.color ?? 'var(--color-text-secondary)',
            badge: stepBadge(workflow, action),
            facts: stepFacts(workflow, action, templateName),
            preview: stepPreviewKind(action),
            invalid: actionValidationErrorsById[action.id]?.valid === false,
            shape: action.type === 'trigger' ? 'start' : action.type === 'exit' ? 'end' : 'step',
        }
    }, [action, workflow, step, hogFunctionTemplatesById, actionValidationErrorsById, isDarkModeOn])
}
