// PROTOTYPE ONLY (silthus/posthog#212). Variant F: no choice up front. The email that fits the project best is
// already open in the team's brand, with the other picks one click away, then the three steps.
import { useActions, useValues } from 'kea'
import { useEffect, useState } from 'react'

import { LemonButton, Link } from '@posthog/lemon-ui'

import { urls } from 'scenes/urls'

import { firstRunPrototypeLogic } from '../firstRunPrototypeLogic'
import { AiCustomizer } from '../shared/AiCustomizer'
import { BrandCard } from '../shared/BrandCard'
import { DraftFields } from '../shared/DraftFields'
import { FlowSteps } from '../shared/FlowSteps'
import { SignupsLine } from '../shared/SignupsLine'
import { LIBRARY_TEMPLATE_COUNT } from '../starterEmails'

export function HomeExampleFirst(): JSX.Element {
    const { picks, starterId } = useValues(firstRunPrototypeLogic)
    const { selectStarter } = useActions(firstRunPrototypeLogic)
    const [editByHand, setEditByHand] = useState(false)

    useEffect(() => {
        if (!starterId) {
            selectStarter(picks[0].starter.id)
        }
    }, [starterId, picks, selectStarter])

    const others = picks.filter((pick) => pick.ready && pick.starter.id !== starterId)

    return (
        <div className="flex flex-col gap-5 max-w-[72rem] py-2">
            <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-semibold mb-0">Your first email is ready to make yours</h2>
                <SignupsLine />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-secondary">Picked from your data:</span>
                {picks
                    .filter((pick) => pick.starter.id === starterId)
                    .map((pick) => (
                        <span key={pick.starter.id} className="font-semibold">
                            {pick.starter.name}
                            <span className="font-normal text-secondary"> · {pick.reason}</span>
                        </span>
                    ))}
                {others.length > 0 && <span className="text-secondary">· Or start with</span>}
                {others.map((pick) => (
                    <LemonButton
                        key={pick.starter.id}
                        size="xsmall"
                        type="secondary"
                        onClick={() => selectStarter(pick.starter.id)}
                    >
                        {pick.starter.name}
                    </LemonButton>
                ))}
                <Link to={urls.workflows('library')}>All {LIBRARY_TEMPLATE_COUNT} templates</Link>
            </div>
            <FlowSteps
                customizePanel={
                    <>
                        <BrandCard />
                        <AiCustomizer />
                        <LemonButton size="small" type="tertiary" onClick={() => setEditByHand(!editByHand)}>
                            {editByHand ? 'Hide the text fields' : 'Edit the text yourself'}
                        </LemonButton>
                        {editByHand && <DraftFields />}
                    </>
                }
            />
        </div>
    )
}
