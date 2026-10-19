import { useState } from 'react'

import { IconExternal } from '@posthog/icons'
import { LemonBanner, LemonButton, LemonModal, LemonSwitch, LemonTag, Link } from '@posthog/lemon-ui'

import { urls } from 'scenes/urls'

import { SceneContent } from '~/layout/scenes/components/SceneContent'
import { SceneTitleSection } from '~/layout/scenes/components/SceneTitleSection'

import {
    AI_DRAFT_WORKFLOW,
    AI_DRAFT_WORKFLOW_ID,
    DESTINATION,
    PRICE_LINE,
    PRICE_LINE_SOURCE,
} from './destinationMoveFixtures'
import { PreviewCanvas } from './PreviewCanvas'
import { AiDraftOutcome as Outcome } from './PrototypeSwitcher'

const OUTCOME_SUMMARY: Record<Outcome, string> = {
    plain: 'The AI saved a plain new workflow. Nothing links it to the destination. Only the preview’s own save moves a destination, so the user disables the destination by hand when the draft is ready.',
    offer: 'The AI draft remembers the destination it came from (a new field). Enabling the draft offers to disable the destination in the same step, which completes the move.',
    block: 'The AI draft remembers the destination it came from (a new field). It cannot be enabled while the destination still sends, so events never send twice.',
}

export function AiDraftOutcome({ outcome }: { outcome: Outcome }): JSX.Element {
    const [enabling, setEnabling] = useState(false)
    const destinationUrl = urls.hogFunction(DESTINATION.id)
    return (
        <SceneContent className="h-full flex flex-col grow">
            <LemonBanner type="ai" hideIcon>
                <strong>What you are looking at:</strong> the saved draft PostHog AI made from the preview, as the user
                sees it after the AI finishes. {OUTCOME_SUMMARY[outcome]}
            </LemonBanner>
            <SceneTitleSection
                name={AI_DRAFT_WORKFLOW.name}
                nameSuffix={<LemonTag type="default">Draft</LemonTag>}
                description={AI_DRAFT_WORKFLOW.description}
                resourceType={{ type: 'workflows' }}
                canEdit={false}
                actions={
                    <>
                        <LemonButton type="secondary" size="small">
                            Test
                        </LemonButton>
                        <LemonButton
                            type="primary"
                            size="small"
                            onClick={() => setEnabling(true)}
                            disabledReason={
                                outcome === 'block'
                                    ? `Disable the destination ${DESTINATION.name} first, so events send once`
                                    : undefined
                            }
                            data-attr="ai-draft-enable"
                        >
                            Enable
                        </LemonButton>
                    </>
                }
            />
            {outcome === 'plain' && (
                <LemonBanner type="info" dismissKey="prototype-ai-draft-plain">
                    Built from the destination <Link to={destinationUrl}>{DESTINATION.name}</Link>, which still sends.
                    When this workflow is ready, disable the destination so events send once.
                </LemonBanner>
            )}
            {outcome === 'offer' && (
                <LemonBanner type="info">
                    Built from the destination <Link to={destinationUrl}>{DESTINATION.name}</Link>, which still sends.
                    Enabling this workflow can disable the destination for you.
                </LemonBanner>
            )}
            {outcome === 'block' && (
                <LemonBanner
                    type="warning"
                    action={{
                        children: 'Disable destination',
                        onClick: () => undefined,
                        'data-attr': 'ai-draft-disable-destination',
                    }}
                >
                    Built from the destination <Link to={destinationUrl}>{DESTINATION.name}</Link>, which still sends.
                    Disable it to enable this workflow. Nothing sends twice.
                </LemonBanner>
            )}
            <PreviewCanvas workflowId={AI_DRAFT_WORKFLOW_ID} />
            <LemonModal
                isOpen={enabling && outcome === 'offer'}
                onClose={() => setEnabling(false)}
                title="Enable this workflow?"
                description={`It came from the destination ${DESTINATION.name}. Disable the destination at the same time so events send once.`}
                footer={
                    <>
                        <LemonButton type="secondary" onClick={() => setEnabling(false)}>
                            Cancel
                        </LemonButton>
                        <LemonButton
                            type="primary"
                            onClick={() => setEnabling(false)}
                            data-attr="ai-draft-enable-confirm"
                        >
                            Enable workflow
                        </LemonButton>
                    </>
                }
            >
                <div className="flex flex-col gap-3">
                    <LemonSwitch
                        checked
                        onChange={() => undefined}
                        label={`Disable the destination ${DESTINATION.name}`}
                        bordered
                        fullWidth
                    />
                    <p className="mb-0 text-sm text-muted">
                        {PRICE_LINE} ({PRICE_LINE_SOURCE})
                    </p>
                </div>
            </LemonModal>
            <LemonModal
                isOpen={enabling && outcome === 'plain'}
                onClose={() => setEnabling(false)}
                title="Enable this workflow?"
                description="It starts running for new events right away."
                footer={
                    <>
                        <LemonButton type="secondary" onClick={() => setEnabling(false)}>
                            Cancel
                        </LemonButton>
                        <LemonButton type="primary" onClick={() => setEnabling(false)} icon={<IconExternal />}>
                            Enable workflow
                        </LemonButton>
                    </>
                }
            />
        </SceneContent>
    )
}
