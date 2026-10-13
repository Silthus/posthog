import type { StepFacts } from './stepFacts'

export const CAPTION_WIDTH = 230

export function TileCaption({ facts }: { facts: StepFacts }): JSX.Element {
    return (
        <div className="flex w-57.5 flex-col gap-0.5 pt-1 text-left">
            <div className="break-words text-[13px] font-semibold leading-tight">{facts.headline}</div>
            {facts.detail && <div className="break-words text-xs leading-snug text-secondary">{facts.detail}</div>}
        </div>
    )
}
