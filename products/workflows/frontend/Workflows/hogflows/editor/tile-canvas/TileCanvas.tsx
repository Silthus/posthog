import './TileCanvas.scss'

import {
    Background,
    BackgroundVariant,
    Controls,
    EdgeTypes,
    NodeTypes,
    Panel,
    ReactFlow,
    useReactFlow,
} from '@xyflow/react'
import { BindLogic, useActions, useValues } from 'kea'
import { useEffect, useMemo, useRef } from 'react'

import { IconX } from '@posthog/icons'
import { LemonButton } from '@posthog/lemon-ui'

import { cn } from 'lib/utils/css-classes'

import { themeLogic } from '~/layout/navigation-3000/themeLogic'

import { workflowLogic } from '../../../workflowLogic'
import { HOG_FLOW_EDITOR_DEFAULT_PANEL_WIDTH, hogFlowEditorLogic } from '../../hogFlowEditorLogic'
import { HogFlowEditorPanel } from '../../panel/HogFlowEditorPanel'
import { CommandBar } from './CommandBar'
import { PathChip } from './PathChip'
import { PathFrame } from './PathFrame'
import { PlacementHint } from './PlacementHint'
import { canvasBounds, entryX, frameChipWidth } from './tileCanvasLayout'
import { tileCanvasLogic } from './tileCanvasLogic'
import { TileCanvasMeasureLayer } from './TileCanvasMeasureLayer'
import { edgeKey } from './tileCanvasModel'
import type { TileCanvasNode, TileEdgeType } from './tileCanvasNodes'
import { TileEdge } from './TileEdge'
import { TileFlowNode } from './TileFlowNode'

const NODE_TYPES = { tile: TileFlowNode, frame: PathFrame, chip: PathChip } as NodeTypes
const EDGE_TYPES = { tile: TileEdge } as EdgeTypes
const MIN_ZOOM = 0.15
const MAX_ZOOM = 1.5
const MIN_READABLE_ZOOM = 0.66
const FIT_MARGIN = { side: 24, top: 32, bottom: 96 }
const CHIP_INSET = 8
const PANEL_CLOSE_GAP = 4

function TileCanvasContent(): JSX.Element {
    const wrapperRef = useRef<HTMLDivElement>(null)
    const reactFlow = useReactFlow()
    const { isDarkModeOn } = useValues(themeLogic)
    const { visibleGraph, frameSpecs, layout, measuredSizes, motion, isPanelOpen, fitRequest, commandPaletteQuery } =
        useValues(tileCanvasLogic)
    const { selectStep, openPath, closePanel } = useActions(tileCanvasLogic)
    const { panelWidth } = useValues(hogFlowEditorLogic)
    const { handlePaneClick } = useActions(hogFlowEditorLogic)

    const nodes = useMemo((): TileCanvasNode[] => {
        if (!layout) {
            return []
        }
        const frames = frameSpecs.flatMap((frame): TileCanvasNode[] => {
            const box = layout.frames[frame.id]
            return box
                ? [
                      {
                          id: frame.id,
                          type: 'frame',
                          position: { x: box.x, y: box.y },
                          width: box.width,
                          height: box.height,
                          data: { group: frame.group },
                          selectable: false,
                          draggable: false,
                          zIndex: -10 + frame.group.depth,
                      },
                  ]
                : []
        })
        const chips = frameSpecs.flatMap((frame): TileCanvasNode[] => {
            const box = layout.frames[frame.id]
            if (!box) {
                return []
            }
            const entry = visibleGraph.edges.find((edge) =>
                edge.originalEdgeKeys.includes(edgeKey(frame.group.entryEdge))
            )
            const x = entryX(entry ? layout.edges[entry.id]?.points : undefined, box.y, box.x + box.width / 2)
            const width = frameChipWidth(frame.group.label)
            const left = Math.min(Math.max(x - width / 2, box.x + CHIP_INSET), box.x + box.width - width - CHIP_INSET)
            return [
                {
                    id: `chip:${frame.group.id}`,
                    type: 'chip',
                    position: { x: left, y: box.y },
                    data: { group: frame.group },
                    selectable: false,
                    draggable: false,
                    zIndex: 5,
                },
            ]
        })
        const tiles = visibleGraph.nodes.flatMap((node): TileCanvasNode[] => {
            const position = layout.positions[node.id]
            return position
                ? [{ id: node.id, type: 'tile', position, data: { node }, selectable: false, draggable: false }]
                : []
        })
        return [...frames, ...chips, ...tiles]
    }, [layout, frameSpecs, visibleGraph])

    const edges = useMemo(
        (): TileEdgeType[] =>
            visibleGraph.edges.map((edge) => ({
                id: edge.id,
                source: edge.source,
                target: edge.target,
                type: 'tile',
                data: { edge, routed: layout?.edges[edge.id] },
                selectable: false,
            })),
        [visibleGraph, layout]
    )

    useEffect(() => {
        const wrapper = wrapperRef.current
        const bounds = layout && measuredSizes ? canvasBounds(layout, measuredSizes) : undefined
        if (!wrapper || !bounds) {
            return
        }
        const width = bounds.width + FIT_MARGIN.side * 2
        const height = bounds.height + FIT_MARGIN.top + FIT_MARGIN.bottom
        // Fit the width, but never shrink below a readable zoom just to fit a long workflow's height.
        const zoom = Math.max(
            MIN_ZOOM,
            Math.min(1, wrapper.clientWidth / width, Math.max(wrapper.clientHeight / height, MIN_READABLE_ZOOM))
        )
        void reactFlow.setViewport({
            x: Math.max(FIT_MARGIN.side, (wrapper.clientWidth - bounds.width * zoom) / 2) - bounds.x * zoom,
            y: FIT_MARGIN.top - bounds.y * zoom,
            zoom,
        })
        // Edits keep the viewport the person panned or zoomed to; only an explicit fit request moves it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fitRequest])

    return (
        <div
            className={cn(
                'TileCanvas relative flex min-h-0 min-w-0 flex-1 overflow-hidden',
                motion && 'TileCanvas--moving'
            )}
            data-attr="workflow-editor"
        >
            <TileCanvasMeasureLayer />
            <div ref={wrapperRef} className="flex min-h-0 min-w-0 grow">
                <ReactFlow<TileCanvasNode, TileEdgeType>
                    className="grow"
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={NODE_TYPES}
                    edgeTypes={EDGE_TYPES}
                    minZoom={MIN_ZOOM}
                    maxZoom={MAX_ZOOM}
                    panOnScroll
                    zoomOnScroll={false}
                    zoomActivationKeyCode={['Meta', 'Control']}
                    nodesDraggable={false}
                    nodesConnectable={false}
                    colorMode={isDarkModeOn ? 'dark' : 'light'}
                    onNodeClick={(_, node) => {
                        if (node.type !== 'tile') {
                            return
                        }
                        if (node.data.node.kind === 'step') {
                            selectStep(node.id)
                        } else {
                            openPath(node.id)
                        }
                    }}
                    onPaneClick={handlePaneClick}
                    proOptions={{ hideAttribution: true }}
                >
                    <Background gap={36} variant={BackgroundVariant.Dots} />
                    <Panel position="bottom-center" className="!mb-5">
                        <div className="flex flex-col items-center gap-2">
                            {commandPaletteQuery === null && <PlacementHint />}
                            <CommandBar />
                        </div>
                    </Panel>
                    <Controls showInteractive={false} />
                </ReactFlow>
            </div>
            {isPanelOpen && (
                <>
                    <HogFlowEditorPanel />
                    <div
                        className="absolute top-3 z-20"
                        style={{ right: (panelWidth ?? HOG_FLOW_EDITOR_DEFAULT_PANEL_WIDTH) + PANEL_CLOSE_GAP }}
                    >
                        <LemonButton
                            size="small"
                            type="secondary"
                            className="bg-surface-primary"
                            icon={<IconX />}
                            tooltip="Close the panel (Esc)"
                            data-attr="workflow-tile-close-panel"
                            onClick={closePanel}
                        />
                    </div>
                </>
            )}
        </div>
    )
}

export function TileCanvas(): JSX.Element {
    const { logicProps } = useValues(workflowLogic)
    return (
        <BindLogic logic={tileCanvasLogic} props={logicProps}>
            <TileCanvasContent />
        </BindLogic>
    )
}
