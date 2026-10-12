// PROTOTYPE (graph-first lane, Silthus/personal#35). Throwaway code, never merged.
import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk.bundled.js'

import { getElk } from 'lib/elk'

import type { VisibleEdge } from './graphFirstModel'

export type Point = { x: number; y: number }
export type LayoutResult = {
    positions: Record<string, Point>
    edgePoints: Record<string, { points: Point[]; label?: Point; labelBox?: { x: number; y: number; width: number; height: number } }>
    width: number
    height: number
}

export const LABEL_HEIGHT = 22
export const labelWidth = (text: string): number => Math.ceil(text.length * 6.6) + 20

export async function layoutGraph(
    sizes: Record<string, { width: number; height: number }>,
    edges: VisibleEdge[],
    labels: Record<string, string | undefined>,
    portFractions: Record<string, number[]> = {}
): Promise<LayoutResult> {
    const ids = Object.keys(sizes)
    const graph: ElkNode = {
        id: 'root',
        layoutOptions: {
            'elk.algorithm': 'layered',
            'elk.direction': 'DOWN',
            'elk.edgeRouting': 'ORTHOGONAL',
            'elk.layered.spacing.nodeNodeBetweenLayers': '44',
            'elk.spacing.nodeNode': '56',
            'elk.spacing.edgeNode': '24',
            'elk.spacing.edgeEdge': '14',
            'elk.spacing.edgeLabel': '4',
            'elk.layered.spacing.edgeNodeBetweenLayers': '20',
            'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
            'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
            'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
            'elk.layered.crossingMinimization.forceNodeModelOrder': 'true',
            'elk.edgeLabels.placement': 'CENTER',
            'elk.padding': '[left=0, top=0, right=0, bottom=0]',
        },
        children: ids.map((id) => {
            const { width, height } = sizes[id]
            const outgoing = edges.filter((edge) => edge.source === id)
            const portCount = outgoing[0]?.portCount ?? 1
            return {
                id,
                width,
                height,
                layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
                ports: [
                    {
                        id: `${id}:in`,
                        x: width / 2,
                        y: 0,
                        width: 1,
                        height: 1,
                        layoutOptions: { 'elk.port.side': 'NORTH' },
                    },
                    ...Array.from({ length: portCount }, (_, index) => ({
                        id: `${id}:out:${index}`,
                        x:
                            width *
                            (portFractions[id]?.[index] ?? (portCount === 1 ? 0.5 : (index + 1) / (portCount + 1))),
                        y: height,
                        width: 1,
                        height: 1,
                        layoutOptions: { 'elk.port.side': 'SOUTH' },
                    })),
                ],
            }
        }),
        edges: edges
            .filter((edge) => sizes[edge.source] && sizes[edge.target])
            .map(
                (edge): ElkExtendedEdge => ({
                    id: edge.id,
                    sources: [`${edge.source}:out:${edge.portIndex}`],
                    targets: [`${edge.target}:in`],
                    labels: labels[edge.id]
                        ? [
                              {
                                  id: `${edge.id}:label`,
                                  text: labels[edge.id],
                                  width: labelWidth(labels[edge.id]!),
                                  height: LABEL_HEIGHT,
                              },
                          ]
                        : [],
                })
            ),
    }

    const elk = await getElk()
    const result = await elk.layout(graph)
    const positions: LayoutResult['positions'] = {}
    result.children?.forEach((child) => (positions[child.id] = { x: child.x ?? 0, y: child.y ?? 0 }))
    const edgePoints: LayoutResult['edgePoints'] = {}
    result.edges?.forEach((edge) => {
        const section = edge.sections?.[0]
        if (!section) {
            return
        }
        const label = edge.labels?.[0]
        edgePoints[edge.id] = {
            points: [section.startPoint, ...(section.bendPoints ?? []), section.endPoint],
            label:
                label && label.x !== undefined && label.y !== undefined
                    ? { x: label.x + (label.width ?? 0) / 2, y: label.y + (label.height ?? 0) / 2 }
                    : undefined,
            labelBox:
                label && label.x !== undefined && label.y !== undefined
                    ? { x: label.x, y: label.y, width: label.width ?? 0, height: label.height ?? 0 }
                    : undefined,
        }
    })
    return { positions, edgePoints, width: result.width ?? 0, height: result.height ?? 0 }
}
