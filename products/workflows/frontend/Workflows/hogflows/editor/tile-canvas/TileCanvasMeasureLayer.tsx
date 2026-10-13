import { useActions, useValues } from 'kea'
import { useLayoutEffect, useRef } from 'react'

import { workflowLogic } from '../../../workflowLogic'
import type { NodeSize } from './tileCanvasLayout'
import { tileCanvasLogic } from './tileCanvasLogic'
import { stepCount } from './tileCanvasModel'
import { TileStackNode } from './TileStackNode'
import { TileStepNode } from './TileStepNode'

function measure(container: HTMLElement): Record<string, NodeSize> {
    const sizes: Record<string, NodeSize> = {}
    container.querySelectorAll<HTMLElement>('[data-measure-id]').forEach((wrapper) => {
        const node = wrapper.firstElementChild as HTMLElement | null
        const id = wrapper.dataset.measureId
        if (!node || !id) {
            return
        }
        const box = node.getBoundingClientRect()
        const anchor = node.querySelector<HTMLElement>('[data-tile-anchor]')?.getBoundingClientRect()
        sizes[id] = {
            width: node.offsetWidth,
            height: node.offsetHeight,
            anchor: anchor && {
                x: anchor.left - box.left + anchor.width / 2,
                y: anchor.top - box.top + anchor.height / 2,
                width: anchor.width,
                height: anchor.height,
            },
        }
    })
    return sizes
}

export function TileCanvasMeasureLayer(): JSX.Element {
    const ref = useRef<HTMLDivElement>(null)
    const { visibleGraph, workflow, stepMetrics } = useValues(tileCanvasLogic)
    const { hogFunctionTemplatesById } = useValues(workflowLogic)
    const { setMeasuredSizes } = useActions(tileCanvasLogic)

    useLayoutEffect(() => {
        const container = ref.current
        if (!container) {
            return
        }
        setMeasuredSizes(measure(container))
        let cancelled = false
        // Captions wrap differently once the web font loads, which changes node heights.
        void document.fonts.ready.then(() => !cancelled && setMeasuredSizes(measure(container)))
        return () => {
            cancelled = true
        }
    }, [visibleGraph, workflow, stepMetrics, hogFunctionTemplatesById, setMeasuredSizes])

    return (
        <div ref={ref} aria-hidden className="pointer-events-none invisible absolute left-[-20000px] top-0">
            {visibleGraph.nodes.map((node) => (
                <div key={node.id} data-measure-id={node.id} className="w-max">
                    {node.kind === 'step' ? (
                        <TileStepNode
                            action={node.action}
                            workflow={workflow}
                            count={stepCount(stepMetrics, node.id)}
                            interactive={false}
                        />
                    ) : (
                        <TileStackNode
                            group={node.group}
                            workflow={workflow}
                            countOf={(actionId) => stepCount(stepMetrics, actionId)}
                            templateNameOf={(templateId) => hogFunctionTemplatesById[templateId]?.name}
                            interactive={false}
                        />
                    )}
                </div>
            ))}
        </div>
    )
}
