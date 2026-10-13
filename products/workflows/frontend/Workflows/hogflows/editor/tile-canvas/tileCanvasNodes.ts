import type { Edge, Node } from '@xyflow/react'

import type { RoutedEdge } from './tileCanvasLayout'
import type { PathGroup, VisibleEdge, VisibleNode } from './tileCanvasModel'

export type TileFlowNodeType = Node<{ node: VisibleNode }, 'tile'>
export type PathFrameNodeType = Node<{ group: PathGroup }, 'frame'>
export type PathChipNodeType = Node<{ group: PathGroup }, 'chip'>
export type TileCanvasNode = TileFlowNodeType | PathFrameNodeType | PathChipNodeType

export type TileEdgeType = Edge<{ edge: VisibleEdge; routed?: RoutedEdge }, 'tile'>
