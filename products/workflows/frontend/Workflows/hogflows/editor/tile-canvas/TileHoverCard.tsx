import type { HogFlow, HogFlowAction } from '../../types'
import { StepCountLine } from './StepCountLine'
import { StepFieldList } from './StepFieldList'
import { StepPreview } from './StepPreview'
import { TILE_SIZE } from './tileCanvasLayout'
import { CAPTION_WIDTH, TileCaption } from './TileCaption'
import { TileFace } from './TileFace'
import type { TileStep } from './useTileStep'

const PADDING = 14
const MIN_WIDTH = 440
const KIND_LABEL_ROOM = 72
const EMAIL_FACE = { width: 164, height: 116 }
export const HOVER_CARD_CLOSE_MS = 200
const PREVIEWS_THAT_SHOW_SETTINGS = new Set(['slack', 'ai', 'ticket', 'person', 'webhook', 'branch', 'wait', 'window'])

/**
 * The tile grows right and down into this card. The card starts clipped to the tile's own box, so the
 * icon and caption stay exactly where they were and only the new content appears around them.
 */
export function TileHoverCard({
    open,
    action,
    workflow,
    tile,
    count,
    showEmail,
}: {
    open: boolean
    action: HogFlowAction
    workflow: HogFlow
    tile: TileStep
    count: number | undefined
    showEmail: boolean
}): JSX.Element {
    const face = showEmail ? EMAIL_FACE : { width: TILE_SIZE, height: TILE_SIZE }
    const width = Math.max(MIN_WIDTH, face.width + 12 + CAPTION_WIDTH + PADDING * 2 + KIND_LABEL_ROOM)
    const closedClip = `inset(${PADDING}px ${width - PADDING - face.width}px calc(100% - ${PADDING + face.height}px) ${PADDING}px round 12px)`
    const showPreview = tile.preview !== 'fields' && !(showEmail && tile.preview === 'email')
    return (
        <div
            className="absolute z-10 rounded-2xl border bg-surface-primary text-primary shadow-xl transition-[clip-path] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none"
            style={{
                left: -PADDING,
                top: -PADDING,
                width,
                padding: PADDING,
                borderColor: tile.color,
                clipPath: open ? 'inset(0px 0px 0px 0px round 16px)' : closedClip,
                transitionDuration: open ? '240ms' : `${HOVER_CARD_CLOSE_MS}ms`,
            }}
        >
            <div className="relative flex items-start gap-3">
                <TileFace action={action} tile={tile} count={count} showEmail={showEmail} />
                <TileCaption facts={tile.facts} />
                <div
                    className="absolute right-0 top-0 text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: tile.color }}
                >
                    {tile.label}
                </div>
            </div>
            <div
                className="mt-3 flex flex-col gap-2.5 border-t pt-3 transition-opacity motion-reduce:transition-none"
                style={{
                    opacity: open ? 1 : 0,
                    transitionDuration: open ? '180ms' : '80ms',
                    transitionDelay: open ? '90ms' : '0ms',
                }}
            >
                {showPreview && <StepPreview action={action} workflow={workflow} tile={tile} />}
                {(!showPreview || !PREVIEWS_THAT_SHOW_SETTINGS.has(tile.preview)) && (
                    <StepFieldList facts={tile.facts} />
                )}
                <StepCountLine count={count} />
                <div className="border-t pt-2 text-[11px] text-secondary">Click to open the step</div>
            </div>
        </div>
    )
}
