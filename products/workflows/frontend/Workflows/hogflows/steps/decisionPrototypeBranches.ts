import type { HogFlowAction } from '../types'

export type DecisionConfig = Extract<HogFlowAction, { type: 'decision' }>['config']

export function getDecisionAnswerNames(config: DecisionConfig): string[] {
    if (config.answer_type === 'yes_no') {
        return ['Yes', 'No']
    }
    return config.options.map((option, index) => option.name || `Option ${index + 1}`)
}

export function getDecisionBranchNames(config: DecisionConfig): string[] {
    if (config.shape !== 'branch') {
        return []
    }
    const answers = getDecisionAnswerNames(config)
    return config.unsure_enabled && config.answer_type === 'pick_one' ? [...answers, 'Unsure'] : answers
}
