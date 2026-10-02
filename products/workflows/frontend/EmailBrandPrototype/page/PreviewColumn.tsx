// PROTOTYPE (throwaway): a small live preview of the starter email next to the fields.
import { buildStarterEmailHtml } from '../shared/brandEmail'
import { EmailFrame } from '../shared/EmailFrame'
import { BrandSimulation } from '../simulation'

export function PreviewColumn({ sim }: { sim: BrandSimulation }): JSX.Element {
    const blank = !sim.derived.detectedAnything && sim.state.edited.length === 0
    return (
        <aside className="flex flex-col gap-2 @3xl:sticky @3xl:top-4" data-attr="email-brand-page-preview">
            <div className="flex items-baseline justify-between gap-2">
                <h2 className="m-0 text-sm font-semibold">Preview</h2>
                <span className="text-xs text-secondary">Starter email</span>
            </div>
            <EmailFrame
                html={buildStarterEmailHtml(sim.state.brand, { muted: blank })}
                scale={0.45}
                className="rounded-lg border"
            />
            <p className="m-0 text-xs text-secondary max-w-[19rem]">
                {blank
                    ? 'Gray until you add a value or detect your brand.'
                    : 'Updates as you edit. The starter template starts as a copy of this.'}
            </p>
        </aside>
    )
}
