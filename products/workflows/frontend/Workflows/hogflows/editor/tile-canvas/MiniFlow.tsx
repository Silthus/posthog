import { useEffect, useRef, useState } from 'react'

import type { HogFlow } from '../../types'
import { MINI_TILE_SIZE, MiniTile } from './MiniTile'
import { SpotlightCard } from './SpotlightCard'
import { isHeadingToRect, layoutMiniFlow, Point } from './tileCanvasModel'

const SPACING = { tile: MINI_TILE_SIZE, gapX: 30, gapY: 52 }
const BADGE_ROOM = 16
const PREVIEW_DWELL_MS = 650
const SAFE_TRIANGLE_SLACK = 12
const SWITCH_AFTER_MS = 140
const BRIDGE_HEIGHT = 22

export function MiniFlow({
    workflow,
    memberIds,
    countOf,
    open,
}: {
    workflow: HogFlow
    memberIds: string[]
    countOf: (actionId: string) => number | undefined
    open: boolean
}): JSX.Element {
    const [spotlightId, setSpotlightId] = useState<string | null>(null)
    const [showPreview, setShowPreview] = useState(false)
    const pointer = useRef<Point>({ x: 0, y: 0 })
    const apex = useRef<Point | null>(null)
    const overId = useRef<string | null>(null)
    const switchTimer = useRef<number>()
    const previewRef = useRef<HTMLDivElement>(null)
    const layout = layoutMiniFlow(workflow, memberIds, SPACING)
    const actionsById = new Map(workflow.actions.map((action) => [action.id, action]))
    const spotlight = layout.nodes.find((node) => node.actionId === spotlightId)
    const spotlightAction = spotlight ? actionsById.get(spotlight.actionId) : undefined

    useEffect(() => {
        setShowPreview(false)
        if (!spotlightId) {
            return
        }
        const timer = window.setTimeout(() => setShowPreview(true), PREVIEW_DWELL_MS)
        return () => window.clearTimeout(timer)
    }, [spotlightId])

    useEffect(() => {
        if (!open) {
            setSpotlightId(null)
        }
    }, [open])

    useEffect(() => () => window.clearTimeout(switchTimer.current), [])

    const isHeadingToPreview = (): boolean => {
        const preview = previewRef.current?.getBoundingClientRect()
        return (
            !!preview && !!apex.current && isHeadingToRect(pointer.current, apex.current, preview, SAFE_TRIANGLE_SLACK)
        )
    }

    const enterStep = (actionId: string): void => {
        overId.current = actionId
        window.clearTimeout(switchTimer.current)
        if (spotlightId && spotlightId !== actionId && isHeadingToPreview()) {
            switchTimer.current = window.setTimeout(() => {
                if (overId.current === actionId) {
                    setSpotlightId(actionId)
                }
            }, SWITCH_AFTER_MS)
            return
        }
        setSpotlightId(actionId)
    }

    return (
        <div
            className="relative"
            style={{ width: layout.width, height: layout.height + BADGE_ROOM }}
            onMouseMove={(event) => {
                pointer.current = { x: event.clientX, y: event.clientY }
                if (overId.current && overId.current === spotlightId) {
                    apex.current = pointer.current
                }
            }}
            onMouseLeave={() => {
                window.clearTimeout(switchTimer.current)
                overId.current = null
                setSpotlightId(null)
            }}
        >
            <svg className="absolute inset-0 overflow-visible" width={layout.width} height={layout.height}>
                {layout.edges.map((edge, index) => {
                    const midX = (edge.from.x + edge.to.x) / 2
                    return (
                        <g
                            key={index}
                            className="transition-opacity duration-200 motion-reduce:transition-none"
                            style={{ opacity: open ? (spotlight ? 0.35 : 1) : 0 }}
                        >
                            <path
                                d={`M ${edge.from.x} ${edge.from.y} H ${midX} V ${edge.to.y} H ${edge.to.x - 1}`}
                                fill="none"
                                stroke="var(--border-bold)"
                                strokeWidth={1.25}
                            />
                            <path
                                d={`M ${edge.to.x - 5} ${edge.to.y - 3} L ${edge.to.x - 1} ${edge.to.y} L ${edge.to.x - 5} ${edge.to.y + 3}`}
                                fill="none"
                                stroke="var(--border-bold)"
                                strokeWidth={1.25}
                            />
                        </g>
                    )
                })}
            </svg>
            {layout.nodes.map((node) => {
                const action = actionsById.get(node.actionId)
                return action ? (
                    <div
                        key={node.actionId}
                        className="absolute transition-[opacity,transform] duration-200 motion-reduce:transition-none"
                        style={{
                            left: node.x,
                            top: node.y,
                            opacity: open ? 1 : 0,
                            transform: open ? 'none' : 'translateX(-10px) scale(0.85)',
                            transitionDelay: `${node.layer * 40}ms`,
                        }}
                        onMouseEnter={() => enterStep(node.actionId)}
                        onMouseLeave={() => {
                            if (overId.current === node.actionId) {
                                overId.current = null
                            }
                        }}
                    >
                        <MiniTile
                            action={action}
                            workflow={workflow}
                            count={countOf(action.id)}
                            dimmed={!!spotlight && spotlight.actionId !== action.id}
                            highlighted={spotlightId === action.id}
                        />
                    </div>
                ) : null
            })}
            {spotlight &&
                spotlightAction && (
                    // The top padding is an invisible bridge over the gap, so moving down to the preview keeps it open.
                    <div
                        className="TileCanvas__appear absolute z-20 -translate-x-1/2"
                        style={{
                            left: spotlight.x + MINI_TILE_SIZE / 2,
                            top: spotlight.y + MINI_TILE_SIZE,
                            paddingTop: BRIDGE_HEIGHT,
                        }}
                        onMouseEnter={() => {
                            overId.current = spotlight.actionId
                            window.clearTimeout(switchTimer.current)
                        }}
                    >
                        <div ref={previewRef}>
                            <SpotlightCard
                                action={spotlightAction}
                                workflow={workflow}
                                count={countOf(spotlightAction.id)}
                                showPreview={showPreview}
                            />
                        </div>
                    </div>
                )}
        </div>
    )
}
