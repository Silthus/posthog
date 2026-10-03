// PROTOTYPE ONLY (silthus/posthog#212). Variant G: the template gallery, filtered to what fits the project's
// data and already in the team's brand. Picking one opens a focused workspace for the three steps.
import { useActions, useValues } from 'kea'
import { useState } from 'react'

import { LemonModal, LemonSegmentedButton, Link } from '@posthog/lemon-ui'

import { urls } from 'scenes/urls'

import { firstRunPrototypeLogic } from '../firstRunPrototypeLogic'
import { AiCustomizer } from '../shared/AiCustomizer'
import { BrandCard } from '../shared/BrandCard'
import { FlowSteps } from '../shared/FlowSteps'
import { SignupsLine } from '../shared/SignupsLine'
import { StarterCard } from '../shared/StarterCard'
import { LIBRARY_TEMPLATE_COUNT } from '../starterEmails'

export function HomeTailoredGallery(): JSX.Element {
    const { picks, starter } = useValues(firstRunPrototypeLogic)
    const { selectStarter, closeStarter } = useActions(firstRunPrototypeLogic)
    const [filter, setFilter] = useState<'picked' | 'all'>('picked')
    const ready = picks.filter((pick) => pick.ready)
    const shown = filter === 'picked' && ready.length ? ready : picks

    return (
        <div className="@container flex flex-col gap-5 max-w-[72rem] py-2">
            <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-semibold mb-0">Emails that fit your app</h2>
                <SignupsLine />
            </div>
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <LemonSegmentedButton
                    size="small"
                    value={filter}
                    onChange={setFilter}
                    options={[
                        { value: 'picked', label: `Picked for your data (${ready.length})` },
                        { value: 'all', label: 'Everything for new users' },
                    ]}
                />
                <Link to={urls.workflows('library')} className="text-sm">
                    Browse all {LIBRARY_TEMPLATE_COUNT} templates
                </Link>
            </div>
            <div className="grid grid-cols-1 @2xl:grid-cols-2 @4xl:grid-cols-3 gap-4">
                {shown.map((pick) => (
                    <StarterCard
                        key={pick.starter.id}
                        pick={pick}
                        showThumbnail
                        onSelect={() => selectStarter(pick.starter.id)}
                    />
                ))}
            </div>
            <LemonModal
                isOpen={Boolean(starter)}
                onClose={closeStarter}
                title={starter?.name}
                description={starter?.description}
                width={1180}
            >
                <FlowSteps
                    customizePanel={
                        <>
                            <AiCustomizer />
                            <BrandCard />
                        </>
                    }
                />
            </LemonModal>
        </div>
    )
}
