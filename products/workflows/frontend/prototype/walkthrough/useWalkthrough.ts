import { useActions, useValues } from 'kea'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { hogFlowEditorLogic } from '../../Workflows/hogflows/hogFlowEditorLogic'
import type { HogFlow } from '../../Workflows/hogflows/types'
import { workflowLogic } from '../../Workflows/workflowLogic'
import { WalkthroughChip, WalkthroughStop, buildWalkthroughStops, finishCopy } from './walkthroughStops'

export interface WalkthroughMessage {
    id: number
    role: 'ai' | 'human'
    stopIndex: number
    text: string
}

export interface WalkthroughState {
    stops: WalkthroughStop[]
    index: number
    stop: WalkthroughStop | null
    active: boolean
    hasDraft: boolean
    workflowId: string
    isFirst: boolean
    isLast: boolean
    messages: WalkthroughMessage[]
    pendingChip: WalkthroughChip | null
    appliedChips: Record<string, string[]>
    start: () => void
    next: () => void
    back: () => void
    skip: () => void
    applyChip: (chip: WalkthroughChip) => void
}

const SIMULATED_AGENT_TURN_MS = 1200

// Walkthrough state lives here, outside the workflow form: an AI edit reloads the workflow from
// the server, which would wipe anything stored in the form or the editor logic.
export function useWalkthrough(): WalkthroughState {
    const { workflow, originalWorkflow, hasUnsavedChanges, hasStagedDraft } = useValues(workflowLogic)
    const { setWorkflowActionConfig, setWorkflowInfo } = useActions(workflowLogic)
    const { logicProps } = useValues(workflowLogic)
    const { setSelectedNodeId, fitView } = useActions(hogFlowEditorLogic(logicProps))

    const stopsSource = useRef<HogFlow | null>(null)
    const [stops, setStops] = useState<WalkthroughStop[]>([])
    const [index, setIndex] = useState(0)
    const [active, setActive] = useState(true)
    const [messages, setMessages] = useState<WalkthroughMessage[]>([])
    const [pendingChip, setPendingChip] = useState<WalkthroughChip | null>(null)
    const [appliedChips, setAppliedChips] = useState<Record<string, string[]>>({})
    const nextMessageId = useRef(1)

    // Stops come from the workflow as it was when the walkthrough started, so a chip's edit never
    // reorders or reworded the stops under the user's feet. Only the chips read the live workflow.
    useEffect(() => {
        if (originalWorkflow && !stopsSource.current) {
            stopsSource.current = workflow
            setStops(buildWalkthroughStops(workflow))
        }
    }, [originalWorkflow, workflow])

    const stop = stops[index] ?? null

    const pushMessage = useCallback((message: Omit<WalkthroughMessage, 'id'>) => {
        setMessages((current) => [...current, { ...message, id: nextMessageId.current++ }])
    }, [])

    useEffect(() => {
        if (!active || !stop) {
            return
        }
        setSelectedNodeId(stop.actionId)
        // Selection alone pans without zooming, which leaves the node tiny when the canvas is
        // small (a side panel open pushes the editor into its stacked layout). Fit to it instead.
        fitView({ duration: 250 })
    }, [active, stop, setSelectedNodeId, fitView])

    const hasDraft = hasUnsavedChanges || hasStagedDraft
    const stopBody = stop ? (stop.kind === 'finish' ? finishCopy(hasDraft).body : stop.body) : null
    const announcedStop = useRef<string | null>(null)

    useEffect(() => {
        if (!active || !stop || stopBody === null) {
            return
        }
        const announcement = `${index}:${stop.id}`
        if (announcedStop.current === announcement) {
            return
        }
        announcedStop.current = announcement
        pushMessage({ role: 'ai', stopIndex: index, text: stopBody })
    }, [active, stop, index, stopBody, pushMessage])

    const start = useCallback(() => {
        setIndex(0)
        setMessages([])
        setAppliedChips({})
        setActive(true)
    }, [])

    const end = useCallback(() => {
        setActive(false)
        setSelectedNodeId(null)
        fitView({ duration: 200 })
    }, [setSelectedNodeId, fitView])

    const next = useCallback(() => {
        if (index >= stops.length - 1) {
            end()
            return
        }
        setIndex(index + 1)
    }, [index, stops.length, end])

    const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), [])

    const applyChip = useCallback(
        (chip: WalkthroughChip) => {
            if (pendingChip || !stop) {
                return
            }
            pushMessage({ role: 'human', stopIndex: index, text: chip.prompt })
            setPendingChip(chip)
            window.setTimeout(() => {
                chip.apply(workflow, { setWorkflowActionConfig, setWorkflowInfo })
                setAppliedChips((current) => ({ ...current, [stop.id]: [...(current[stop.id] ?? []), chip.label] }))
                pushMessage({
                    role: 'ai',
                    stopIndex: index,
                    text: `Done. ${chip.summary} Nothing is live until you publish.`,
                })
                setPendingChip(null)
            }, SIMULATED_AGENT_TURN_MS)
        },
        [pendingChip, stop, index, workflow, setWorkflowActionConfig, setWorkflowInfo, pushMessage]
    )

    return useMemo(
        () => ({
            stops,
            index,
            stop: active ? stop : null,
            active,
            hasDraft,
            workflowId: logicProps.id ?? '',
            isFirst: index === 0,
            isLast: index === stops.length - 1,
            messages,
            pendingChip,
            appliedChips,
            start,
            next,
            back,
            skip: end,
            applyChip,
        }),
        [
            stops,
            index,
            stop,
            active,
            hasDraft,
            logicProps.id,
            messages,
            pendingChip,
            appliedChips,
            start,
            next,
            back,
            end,
            applyChip,
        ]
    )
}
