import { Handle, NodeProps, Position } from '@xyflow/react'
import { useValues } from 'kea'

import { cn } from 'lib/utils/css-classes'

import { hogFlowEditorLogic } from '../../hogFlowEditorLogic'
import { motionProps } from './motionProps'
import { tileCanvasLogic } from './tileCanvasLogic'
import { nodeMotion, stepCount } from './tileCanvasModel'
import type { TileFlowNodeType } from './tileCanvasNodes'
import { TileStackNode } from './TileStackNode'
import { TileStepNode } from './TileStepNode'

export function TileFlowNode({ data }: NodeProps<TileFlowNodeType>): JSX.Element {
    const { node } = data
    const { workflow, isPanelOpen, motion, pathGroups, layout, measuredSizes } = useValues(tileCanvasLogic)
    const { selectedNodeId, actionMetricsById, hogFunctionTemplatesById } = useValues(hogFlowEditorLogic)
    const position = layout?.positions[node.id]
    const size = measuredSizes?.[node.id]
    const motionStyle = motionProps(
        nodeMotion(motion, node, pathGroups, position && size ? { ...position, ...size } : undefined)
    )
    const countOf = (actionId: string): number | undefined => stepCount(actionMetricsById, actionId)

    return (
        <div className={cn(motionStyle.className)} style={motionStyle.style}>
            <Handle type="target" position={Position.Top} className="!opacity-0" isConnectable={false} />
            {node.kind === 'step' ? (
                <TileStepNode
                    action={node.action}
                    workflow={workflow}
                    count={countOf(node.id)}
                    selected={isPanelOpen && selectedNodeId === node.id}
                />
            ) : (
                <TileStackNode
                    group={node.group}
                    workflow={workflow}
                    countOf={countOf}
                    templateNameOf={(templateId) => hogFunctionTemplatesById[templateId]?.name}
                />
            )}
            <Handle type="source" position={Position.Bottom} className="!opacity-0" isConnectable={false} />
        </div>
    )
}
