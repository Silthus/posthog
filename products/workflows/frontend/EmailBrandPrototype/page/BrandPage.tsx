// PROTOTYPE (throwaway): the Email brand settings page: header, stacked sections, a side preview and a sticky action bar.
import { IconArrowLeft } from '@posthog/icons'
import { LemonBanner, LemonButton } from '@posthog/lemon-ui'

import { BrandSimulation } from '../simulation'
import { ColorsSection } from './ColorsSection'
import { FontSection } from './FontSection'
import { FooterBar } from './FooterBar'
import { NameLogoSection } from './NameLogoSection'
import { PreviewColumn } from './PreviewColumn'
import { SourceCard } from './SourceCard'
import { useSaveStatus } from './useSaveStatus'

export function BrandPage({ sim }: { sim: BrandSimulation }): JSX.Element {
    const save = useSaveStatus(sim)
    const fromLibrary = sim.scenario.entry === 'library'
    return (
        <div className="flex flex-col min-h-full" data-attr="email-brand-page">
            <div className="grow w-full max-w-[76rem] mx-auto px-4 @md:px-6 py-6 flex flex-col gap-5">
                <header className="flex flex-col items-start gap-1">
                    <LemonButton
                        size="xsmall"
                        type="tertiary"
                        icon={<IconArrowLeft />}
                        onClick={() => sim.actions.goTo('entry')}
                        disabledReason={sim.state.phase === 'detecting' ? 'Wait for detection to finish' : undefined}
                    >
                        {fromLibrary ? 'Templates' : 'Channels'}
                    </LemonButton>
                    <h1 className="m-0 text-2xl font-bold">Email brand</h1>
                    <p className="m-0 text-secondary max-w-[56rem]">
                        The logo, colors and font your emails use. Each starter template takes a copy when you create
                        it, so changing the brand later leaves existing emails alone.
                    </p>
                </header>
                {fromLibrary && (
                    <LemonBanner type="info" className="max-w-[56rem]">
                        Once your brand is saved, we create the starter template and open it.
                    </LemonBanner>
                )}
                <div className="grid gap-5 items-start @3xl:grid-cols-[minmax(0,56rem)_auto]">
                    <div className="flex flex-col gap-4 min-w-0">
                        <SourceCard sim={sim} />
                        <NameLogoSection sim={sim} />
                        <ColorsSection sim={sim} />
                        <FontSection sim={sim} />
                    </div>
                    <PreviewColumn sim={sim} />
                </div>
            </div>
            <FooterBar sim={sim} save={save} />
        </div>
    )
}
