import { useActions, useValues } from 'kea'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { HogFunctionTemplateType } from '~/types'

import { workflowLogic } from '../../../workflowLogic'
import type { HogFlow } from '../../types'
import type { NodeSize } from './tileCanvasLayout'
import { StepCountOf, tileCanvasLogic } from './tileCanvasLogic'
import { outgoingEdges, pathActions, VisibleNode } from './tileCanvasModel'
import { TileStackNode } from './TileStackNode'
import { TileStepNode } from './TileStepNode'

const STACK_COVER_STEPS = 4

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

/** Everything that can change a node's size. A node whose inputs match its last measure keeps that size. */
function sizeInputs(
    node: VisibleNode,
    workflow: HogFlow,
    countOf: StepCountOf,
    templates: Record<string, HogFunctionTemplateType>
): unknown[] {
    if (node.kind === 'step') {
        return [
            node.action,
            countOf(node.id),
            templates,
            node.action.type === 'exit' ? workflow.exit_condition : undefined,
            outgoingEdges(workflow, node.id).length,
        ]
    }
    return [
        node.group.label,
        node.group.memberIds.length,
        countOf(node.group.entryEdge.to),
        templates,
        ...pathActions(workflow, node.group).slice(0, STACK_COVER_STEPS),
    ]
}

const sameInputs = (a: unknown[] | undefined, b: unknown[]): boolean =>
    !!a && a.length === b.length && a.every((value, index) => value === b[index])

/** Captions wrap differently once the web font loads, so every node is measured again then. */
function useFontsLoaded(): boolean {
    const [loaded, setLoaded] = useState(() => document.fonts?.status === 'loaded')
    useEffect(() => {
        let cancelled = false
        void document.fonts?.ready.then(() => !cancelled && setLoaded(true))
        return () => {
            cancelled = true
        }
    }, [])
    return loaded
}

interface MeasuredNode {
    inputs: unknown[]
    size: NodeSize
}

export function TileCanvasMeasureLayer(): JSX.Element {
    const ref = useRef<HTMLDivElement>(null)
    const measured = useRef(new Map<string, MeasuredNode>())
    const { visibleGraph, workflow, countOf } = useValues(tileCanvasLogic)
    const { hogFunctionTemplatesById } = useValues(workflowLogic)
    const { setMeasuredSizes } = useActions(tileCanvasLogic)
    const fontsLoaded = useFontsLoaded()

    const nodes = visibleGraph.nodes.map((node) => ({
        node,
        inputs: [...sizeInputs(node, workflow, countOf, hogFunctionTemplatesById), fontsLoaded],
    }))
    const changed = nodes.filter(({ node, inputs }) => !sameInputs(measured.current.get(node.id)?.inputs, inputs))

    useLayoutEffect(() => {
        const container = ref.current
        if (!container) {
            return
        }
        const sizes = measure(container)
        changed.forEach(({ node, inputs }) => {
            if (sizes[node.id]) {
                measured.current.set(node.id, { inputs, size: sizes[node.id] })
            }
        })
        setMeasuredSizes(
            Object.fromEntries(
                nodes.flatMap(({ node }) => {
                    const size = measured.current.get(node.id)?.size
                    return size ? [[node.id, size]] : []
                })
            )
        )
        // `changed` and `nodes` derive from these inputs on every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visibleGraph, workflow, countOf, hogFunctionTemplatesById, fontsLoaded, setMeasuredSizes])

    return (
        <div ref={ref} aria-hidden className="pointer-events-none invisible absolute left-[-20000px] top-0">
            {changed.map(({ node }) => (
                <div key={node.id} data-measure-id={node.id} className="w-max">
                    {node.kind === 'step' ? (
                        <TileStepNode
                            action={node.action}
                            workflow={workflow}
                            count={countOf(node.id)}
                            interactive={false}
                        />
                    ) : (
                        <TileStackNode
                            group={node.group}
                            workflow={workflow}
                            countOf={countOf}
                            templateNameOf={(templateId) => hogFunctionTemplatesById[templateId]?.name}
                            interactive={false}
                        />
                    )}
                </div>
            ))}
        </div>
    )
}
