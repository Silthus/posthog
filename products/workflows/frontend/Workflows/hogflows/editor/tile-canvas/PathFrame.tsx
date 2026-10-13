import { NodeProps } from '@xyflow/react'
import { useValues } from 'kea'

import { cn } from 'lib/utils/css-classes'

import { motionProps } from './motionProps'
import { tileCanvasLogic } from './tileCanvasLogic'
import { frameMotion, pathColor, tint } from './tileCanvasModel'
import type { PathFrameNodeType } from './tileCanvasNodes'

export function PathFrame({ data, width, height }: NodeProps<PathFrameNodeType>): JSX.Element {
    const { motion, pathGroups } = useValues(tileCanvasLogic)
    const color = pathColor(data.group.entryEdge)
    const motionStyle = motionProps(frameMotion(motion, data.group, pathGroups))
    return (
        <div className={cn('relative', motionStyle.className)} style={{ width, height, ...motionStyle.style }}>
            <div className="absolute inset-0 rounded-2xl" style={{ backgroundColor: tint(color, 6) }} />
            <div className="absolute bottom-3 left-0 top-3 w-[3px] rounded-full" style={{ backgroundColor: color }} />
        </div>
    )
}
