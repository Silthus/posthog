// PROTOTYPE (throwaway): a small SVG thumbnail of the flow graph. Nodes sit in rows by their distance
// from the trigger, and edges are straight lines. No React Flow or dagre, so it costs nothing per tile.
import { useMemo } from 'react'

import { getHogFlowStep } from '../../hogflows/steps/HogFlowSteps'
import type { WorkflowListItem } from '../shared/workflowListItems'

const NODE_W = 18
const NODE_H = 10
const GAP_X = 10
const GAP_Y = 10

interface LaidOutNode {
    id: string
    x: number
    y: number
    color: string
    title: string
}

export function MiniCanvas({ item, className }: { item: WorkflowListItem; className?: string }): JSX.Element | null {
    const layout = useMemo(() => {
        const source = item.workflow ?? item.template
        const edges = ((source as { edges?: { from: string; to: string }[] } | null)?.edges ?? []) as {
            from: string
            to: string
        }[]
        const start = item.actions.find((action) => action.type === 'trigger')
        if (!start) {
            return null
        }
        const depth = new Map<string, number>([[start.id, 0]])
        const queue = [start.id]
        while (queue.length) {
            const id = queue.shift()!
            for (const edge of edges.filter((e) => e.from === id)) {
                if (!depth.has(edge.to)) {
                    depth.set(edge.to, depth.get(id)! + 1)
                    queue.push(edge.to)
                }
            }
        }
        // Exit nodes go to the last row, so a branch to exit reads as a side path rather than a new level.
        const maxDepth = Math.max(...depth.values())
        const rows = new Map<number, string[]>()
        for (const action of item.actions) {
            const d = action.type === 'exit' ? maxDepth : (depth.get(action.id) ?? maxDepth)
            rows.set(d, [...(rows.get(d) ?? []), action.id])
        }
        const widest = Math.max(...Array.from(rows.values()).map((row) => row.length))
        const width = widest * NODE_W + (widest - 1) * GAP_X
        const nodes = new Map<string, LaidOutNode>()
        const byId = new Map(item.actions.map((action) => [action.id, action]))
        for (const [d, ids] of rows) {
            const rowWidth = ids.length * NODE_W + (ids.length - 1) * GAP_X
            ids.forEach((id, index) => {
                const action = byId.get(id)!
                const step = getHogFlowStep(action as any, {})
                nodes.set(id, {
                    id,
                    x: (width - rowWidth) / 2 + index * (NODE_W + GAP_X),
                    y: d * (NODE_H + GAP_Y),
                    color:
                        action.type === 'trigger'
                            ? 'var(--color-accent)'
                            : action.type === 'exit'
                              ? 'var(--color-text-tertiary)'
                              : (step?.color ?? 'var(--color-text-secondary)'),
                    title: action.name,
                })
            })
        }
        const height = (Math.max(...rows.keys()) + 1) * (NODE_H + GAP_Y) - GAP_Y
        return { nodes, edges, width, height }
    }, [item])

    if (!layout) {
        return null
    }
    const { nodes, edges, width, height } = layout
    return (
        <svg
            viewBox={`-2 -2 ${width + 4} ${height + 4}`}
            className={className}
            role="img"
            aria-label={`Flow with ${nodes.size} nodes`}
        >
            {edges.map((edge) => {
                const from = nodes.get(edge.from)
                const to = nodes.get(edge.to)
                if (!from || !to) {
                    return null
                }
                return (
                    <line
                        key={`${edge.from}-${edge.to}`}
                        x1={from.x + NODE_W / 2}
                        y1={from.y + NODE_H}
                        x2={to.x + NODE_W / 2}
                        y2={to.y}
                        stroke="var(--color-text-tertiary)"
                        strokeWidth={1}
                    />
                )
            })}
            {Array.from(nodes.values()).map((node) => (
                <rect
                    key={node.id}
                    x={node.x}
                    y={node.y}
                    width={NODE_W}
                    height={NODE_H}
                    rx={2}
                    fill={node.color}
                    fillOpacity={0.85}
                >
                    <title>{node.title}</title>
                </rect>
            ))}
        </svg>
    )
}
