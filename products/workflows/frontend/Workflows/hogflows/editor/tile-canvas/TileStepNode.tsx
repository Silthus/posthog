import { useRef } from 'react'

import { cn } from 'lib/utils/css-classes'

import type { HogFlow, HogFlowAction } from '../../types'
import { emailContent } from './stepValues'
import { TileCaption } from './TileCaption'
import { TileFace } from './TileFace'
import { HOVER_CARD_CLOSE_MS, TileHoverCard } from './TileHoverCard'
import { useHoverIntent } from './useHoverIntent'
import { useRaisedNode } from './useRaisedNode'
import { useTileStep } from './useTileStep'

const HOVER_OPEN_DELAY_MS = 260

export function TileStepNode({
    action,
    workflow,
    count,
    selected = false,
    menuOpen = false,
    interactive = true,
}: {
    action: HogFlowAction
    workflow: HogFlow
    count: number | undefined
    selected?: boolean
    menuOpen?: boolean
    interactive?: boolean
}): JSX.Element {
    const ref = useRef<HTMLDivElement>(null)
    const tile = useTileStep(action, workflow)
    const showEmail = !!emailContent(action)?.html
    const hover = useHoverIntent(interactive && !selected && !menuOpen, HOVER_OPEN_DELAY_MS, HOVER_CARD_CLOSE_MS)
    useRaisedNode(ref, hover.mounted)

    return (
        <div
            ref={ref}
            className="flex cursor-pointer items-start gap-3 text-primary"
            title={hover.mounted ? undefined : action.name}
            onMouseEnter={hover.onMouseEnter}
            onMouseLeave={hover.onMouseLeave}
            data-attr={interactive ? 'workflow-tile-step' : undefined}
        >
            <div className={cn('relative rounded-xl', selected && 'ring-2 ring-[var(--color-accent)] ring-offset-4')}>
                <TileFace action={action} tile={tile} count={count} showEmail={showEmail} />
                {hover.mounted && (
                    <TileHoverCard open={hover.open} action={action} tile={tile} count={count} showEmail={showEmail} />
                )}
            </div>
            <TileCaption facts={tile.facts} />
        </div>
    )
}
