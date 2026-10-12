import type { HogFlowEdge } from './types'

// Every catalog operation lists `done` first, and the primary outcome follows the continue edge.
export const NATIVE_PRIMARY_OUTCOME = 'done'

export function getOutcomeLabel(outcome: string): string {
    const words = outcome.replaceAll('_', ' ')
    return words.charAt(0).toUpperCase() + words.slice(1)
}

export function isSameEdgeSlot(left: HogFlowEdge, right: HogFlowEdge): boolean {
    return (
        left.from === right.from &&
        left.type === right.type &&
        left.index === right.index &&
        left.outcome === right.outcome
    )
}

// The graph layout orders a node's ports by handle id, so these ids must sort the way
// compareOutgoingEdges orders the edges: branches first, by outcome, then continue.
export function getSourceHandleId(edge: HogFlowEdge): string {
    if (edge.type === 'continue') {
        return `continue_${edge.from}`
    }
    return `branch_${edge.from}_${edge.outcome ?? edge.index}`
}

export function compareOutgoingEdges(left: HogFlowEdge, right: HogFlowEdge): number {
    if (left.type !== right.type) {
        return left.type === 'branch' ? -1 : 1
    }
    if (left.outcome !== undefined || right.outcome !== undefined) {
        return (left.outcome ?? '').localeCompare(right.outcome ?? '')
    }
    return (left.index ?? Number.POSITIVE_INFINITY) - (right.index ?? Number.POSITIVE_INFINITY)
}
