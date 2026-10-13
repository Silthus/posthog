import type { Edge, Node } from '@xyflow/react'

import { Box, CanvasLayout, entryX, frameChipWidth, PathFrameSpec, RoutedEdge } from './tileCanvasLayout'
import { edgeKey, PathGroup, VisibleEdge, VisibleGraph, VisibleNode } from './tileCanvasModel'

export type TileFlowNodeType = Node<{ node: VisibleNode }, 'tile'>
export type PathFrameNodeType = Node<{ group: PathGroup }, 'frame'>
export type PathChipNodeType = Node<{ group: PathGroup }, 'chip'>
export type TileCanvasNode = TileFlowNodeType | PathFrameNodeType | PathChipNodeType

export type TileEdgeType = Edge<{ edge: VisibleEdge; routed?: RoutedEdge }, 'tile'>

const CHIP_INSET = 8
const STATIC = { selectable: false, draggable: false } as const

function frameNode(frame: PathFrameSpec, box: Box): TileCanvasNode {
    return {
        id: frame.id,
        type: 'frame',
        position: { x: box.x, y: box.y },
        width: box.width,
        height: box.height,
        data: { group: frame.group },
        zIndex: -10 + frame.group.depth,
        ...STATIC,
    }
}

/** The chip sits where the arrow into the path crosses the frame's top edge, kept inside the frame. */
function chipNode(frame: PathFrameSpec, box: Box, layout: CanvasLayout, graph: VisibleGraph): TileCanvasNode {
    const entry = graph.edges.find((edge) => edge.originalEdgeKeys.includes(edgeKey(frame.group.entryEdge)))
    const x = entryX(entry ? layout.edges[entry.id]?.points : undefined, box.y, box.x + box.width / 2)
    const width = frameChipWidth(frame.group.label)
    const left = Math.min(Math.max(x - width / 2, box.x + CHIP_INSET), box.x + box.width - width - CHIP_INSET)
    return {
        id: `chip:${frame.group.id}`,
        type: 'chip',
        position: { x: left, y: box.y },
        data: { group: frame.group },
        zIndex: 5,
        ...STATIC,
    }
}

export function buildCanvasNodes(
    layout: CanvasLayout | null,
    frameSpecs: PathFrameSpec[],
    graph: VisibleGraph
): TileCanvasNode[] {
    if (!layout) {
        return []
    }
    const framed = frameSpecs.flatMap((frame) => {
        const box = layout.frames[frame.id]
        return box ? [{ frame, box }] : []
    })
    const tiles = graph.nodes.flatMap((node): TileCanvasNode[] => {
        const position = layout.positions[node.id]
        return position ? [{ id: node.id, type: 'tile', position, data: { node }, ...STATIC }] : []
    })
    return [
        ...framed.map(({ frame, box }) => frameNode(frame, box)),
        ...framed.map(({ frame, box }) => chipNode(frame, box, layout, graph)),
        ...tiles,
    ]
}

export function buildCanvasEdges(graph: VisibleGraph, layout: CanvasLayout | null): TileEdgeType[] {
    return graph.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'tile',
        data: { edge, routed: layout?.edges[edge.id] },
        selectable: false,
    }))
}
