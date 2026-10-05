import { useEffect, useState } from 'react'

import { Popover } from '@posthog/lemon-ui'

import { CoachMarkCard } from './CoachMarkCard'
import { WalkthroughState } from './useWalkthrough'

interface CoachMarksWalkthroughProps {
    walkthrough: WalkthroughState
    chipsEnabled: boolean
}

function nodeElement(actionId: string): HTMLElement | null {
    return document.querySelector<HTMLElement>(`.react-flow__node[data-id="${actionId}"]`)
}

// The card anchors to the DOM node of the selected step. That node can disappear and come back
// (a reload after an AI edit remounts the graph), and the canvas pans under it when fitView runs,
// so the anchor is re-resolved on graph mutations and the popover re-measured once panning settles.
function useStepAnchor(actionId: string | null): { element: HTMLElement | null; positionKey: number } {
    const [element, setElement] = useState<HTMLElement | null>(null)
    const [positionKey, setPositionKey] = useState(0)

    useEffect(() => {
        if (!actionId) {
            setElement(null)
            return
        }
        let cancelled = false
        const resolve = (): void => {
            const found = nodeElement(actionId)
            if (found) {
                setElement((current) => (current === found ? current : found))
            } else if (!cancelled) {
                requestAnimationFrame(resolve)
            }
        }
        resolve()

        const nodesContainer = document.querySelector('.react-flow__nodes')
        const viewport = document.querySelector('.react-flow__viewport')
        let settleTimer: number | undefined
        const observer = new MutationObserver((mutations) => {
            if (mutations.some((m) => m.type === 'childList')) {
                resolve()
            }
            window.clearTimeout(settleTimer)
            settleTimer = window.setTimeout(() => setPositionKey((key) => key + 1), 150)
        })
        if (nodesContainer) {
            observer.observe(nodesContainer, { childList: true })
        }
        if (viewport) {
            observer.observe(viewport, { attributes: true, attributeFilter: ['style'] })
        }
        return () => {
            cancelled = true
            observer.disconnect()
            window.clearTimeout(settleTimer)
        }
    }, [actionId])

    return { element, positionKey }
}

export function CoachMarksWalkthrough({ walkthrough, chipsEnabled }: CoachMarksWalkthroughProps): JSX.Element | null {
    const { stop } = walkthrough
    const { element, positionKey } = useStepAnchor(stop?.anchorActionId ?? null)

    if (!stop) {
        return null
    }

    if (!stop.anchorActionId) {
        return (
            <div className="absolute left-1/2 top-14 z-10 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-md border bg-surface-primary p-3 shadow-lg">
                <CoachMarkCard walkthrough={walkthrough} chipsEnabled={chipsEnabled} />
            </div>
        )
    }

    return (
        <Popover
            key={`${stop.id}-${positionKey}`}
            visible={!!element}
            referenceElement={element}
            placement="right-start"
            fallbackPlacements={['left-start', 'bottom-start', 'top-start']}
            showArrow
            onClickOutside={() => {}}
            overlay={<CoachMarkCard walkthrough={walkthrough} chipsEnabled={chipsEnabled} />}
        />
    )
}
