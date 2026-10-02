import { useState } from 'react'

// PROTOTYPE (throwaway): the "Canvas" variant: the starter email is the hero and a side panel fills it in with your brand.
import { cn } from 'lib/utils/css-classes'

import { EditorStandIn } from '../shared/EditorStandIn'
import { BrandFieldKey, BrandSimulation } from '../simulation'
import { EditorBarGhost } from './EditorBarGhost'
import { FocusRequest } from './FieldRow'
import { PreviewStage } from './PreviewStage'
import { SidePanel } from './SidePanel'
import { useLandedSignals } from './useLandedSignals'

export function CanvasVariant({ sim }: { sim: BrandSimulation }): JSX.Element {
    const [hovered, setHovered] = useState<BrandFieldKey | null>(null)
    const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null)
    const landed = useLandedSignals(sim.state.sources, sim.state.detectionRuns)
    const { phase } = sim.state

    if (phase === 'editor') {
        return (
            <div className="animate-fade-in">
                <EditorStandIn sim={sim} onBack={sim.actions.backToReview} />
            </div>
        )
    }

    const creating = phase === 'creating'
    const highlighted = hovered ?? focusRequest?.key ?? null
    const focusField = (key: BrandFieldKey): void => setFocusRequest((prev) => ({ key, nonce: (prev?.nonce ?? 0) + 1 }))

    return (
        <div
            className="flex flex-col min-h-[calc(100vh-2.5rem)] bg-[#e9e9eb] overflow-hidden"
            data-attr="email-brand-canvas"
        >
            {creating && <EditorBarGhost templateName={sim.state.templateName} />}
            <div className="flex flex-col @4xl:flex-row @4xl:items-start grow">
                {creating && (
                    <div className="hidden @4xl:block w-56 self-stretch shrink-0 border-r bg-surface-primary animate-fade-in" />
                )}
                <PreviewStage
                    sim={sim}
                    highlighted={highlighted}
                    recentlyLanded={landed.recent}
                    onHover={setHovered}
                    onSelect={focusField}
                    className="order-2 @4xl:order-1 grow"
                />
                <aside
                    className={cn(
                        'order-1 @4xl:order-2 shrink-0 p-3 @4xl:pl-0 @4xl:w-[24.75rem] @4xl:sticky @4xl:top-0 transition-all duration-500 ease-out motion-reduce:transition-none',
                        creating && 'hidden @4xl:block @4xl:w-0 @4xl:p-0 opacity-0 translate-x-full pointer-events-none'
                    )}
                >
                    <div className="@4xl:w-96 flex flex-col overflow-hidden rounded-xl border bg-surface-primary shadow-sm @4xl:max-h-[calc(100vh-14rem)]">
                        <SidePanel
                            sim={sim}
                            highlighted={highlighted}
                            focusRequest={focusRequest}
                            landedByFile={landed.byFile}
                            onHover={setHovered}
                        />
                    </div>
                </aside>
            </div>
        </div>
    )
}
