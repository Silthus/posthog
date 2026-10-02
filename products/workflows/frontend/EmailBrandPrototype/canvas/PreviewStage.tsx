import { useResizeObserver } from 'lib/hooks/useResizeObserver'
// PROTOTYPE (throwaway): the starter email as the hero of the screen, scaled to fit, with hotspots on top.
import { cn } from 'lib/utils/css-classes'

import { EmailFrame } from '../shared/EmailFrame'
import { HedgehogRocket } from '../shared/hoggies'
import { BrandFieldKey, BrandSimulation } from '../simulation'
import { LandingPulses } from './LandingPulses'
import { PreviewCaption } from './PreviewCaption'
import { PreviewHotspots } from './PreviewHotspots'
import { EMAIL_HEIGHT, EMAIL_WIDTH, previewHtml, previewModeFor } from './previewModel'

interface PreviewStageProps {
    sim: BrandSimulation
    highlighted: BrandFieldKey | null
    recentlyLanded: BrandFieldKey[]
    onHover: (key: BrandFieldKey | null) => void
    onSelect: (key: BrandFieldKey) => void
    className?: string
}

const STAGE_PADDING = 48

export function PreviewStage({
    sim,
    highlighted,
    recentlyLanded,
    onHover,
    onSelect,
    className,
}: PreviewStageProps): JSX.Element {
    const { ref, width = EMAIL_WIDTH + STAGE_PADDING } = useResizeObserver<HTMLDivElement>()
    const scale = Math.max(0.4, Math.min(1, (width - STAGE_PADDING) / EMAIL_WIDTH))
    const { phase } = sim.state
    const mode = previewModeFor(sim.state)

    return (
        <div ref={ref} className={cn('flex flex-col items-center gap-3 px-6 py-5 min-w-0', className)}>
            {phase !== 'creating' && <PreviewCaption sim={sim} />}
            <div
                className={cn('relative rounded-xl shadow-lg transition-shadow', phase === 'creating' && 'shadow-2xl')}
                style={{ width: EMAIL_WIDTH * scale, height: EMAIL_HEIGHT * scale }}
                data-attr="email-brand-canvas-preview"
            >
                <EmailFrame
                    html={previewHtml(sim.state, mode)}
                    scale={scale}
                    height={EMAIL_HEIGHT}
                    className="rounded-xl"
                />
                {phase === 'review' && (
                    <PreviewHotspots
                        sim={sim}
                        scale={scale}
                        highlighted={highlighted}
                        onHover={onHover}
                        onSelect={onSelect}
                    />
                )}
                {(phase === 'detecting' || phase === 'review') && (
                    <LandingPulses sim={sim} scale={scale} keys={recentlyLanded} />
                )}
                {phase === 'creating' && <BuildingOverlay />}
            </div>
        </div>
    )
}

function BuildingOverlay(): JSX.Element {
    return (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/10 animate-fade-in">
            <div className="flex items-center gap-3 rounded-lg bg-surface-primary px-5 py-4 shadow-lg">
                <HedgehogRocket className="w-14" />
                <div>
                    <div className="font-semibold">Building your starter email</div>
                    <div className="text-xs text-secondary">
                        Your logo, colors and font, saved as a template you can edit
                    </div>
                </div>
            </div>
        </div>
    )
}
