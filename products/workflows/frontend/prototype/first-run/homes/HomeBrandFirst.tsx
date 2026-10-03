// PROTOTYPE ONLY (silthus/posthog#212). Variant I: the brand comes first. A generic email next to the same
// email in the team's logo and colors, so the reason to go on is visible. Then pick, change, test, turn on.
import { useActions, useValues } from 'kea'

import { LemonButton, Spinner } from '@posthog/lemon-ui'

import { firstRunPrototypeLogic } from '../firstRunPrototypeLogic'
import { TEAM_BRAND } from '../firstRunScenario'
import { AiCustomizer } from '../shared/AiCustomizer'
import { FlowSteps } from '../shared/FlowSteps'
import { SignupsLine } from '../shared/SignupsLine'
import { StarterCard } from '../shared/StarterCard'
import { STARTERS, emailHtml } from '../starterEmails'

export function HomeBrandFirst(): JSX.Element {
    const { brandStatus, picks, starterId } = useValues(firstRunPrototypeLogic)
    const { selectStarter, setBrandApplied } = useActions(firstRunPrototypeLogic)
    const sample = STARTERS[0].draft

    return (
        <div className="@container flex flex-col gap-6 max-w-[72rem] py-2">
            <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-semibold mb-0">
                    Emails that look like {TEAM_BRAND.name}, not like a template
                </h2>
                <SignupsLine />
            </div>
            <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-4">
                <BrandPane label="A generic template">
                    <iframe
                        title="Generic email"
                        className="w-full h-[18rem] border-0 bg-white rounded"
                        sandbox=""
                        srcDoc={emailHtml({ draft: sample, branded: false, recipientName: 'Ada' })}
                    />
                </BrandPane>
                <BrandPane label={`Yours, from ${TEAM_BRAND.domain}`}>
                    {brandStatus !== 'found' ? (
                        <div className="h-[18rem] flex items-center justify-center gap-2 text-secondary">
                            <Spinner /> Picking up your logo and colors from {TEAM_BRAND.domain}
                        </div>
                    ) : (
                        <iframe
                            title="Branded email"
                            className="w-full h-[18rem] border-0 bg-white rounded"
                            sandbox=""
                            srcDoc={emailHtml({ draft: sample, branded: true, recipientName: 'Ada' })}
                        />
                    )}
                </BrandPane>
            </div>
            {brandStatus === 'found' && (
                <div className="flex items-center gap-2 text-sm">
                    <span className="text-secondary">Every email below uses your brand.</span>
                    <LemonButton size="xsmall" type="tertiary" onClick={() => setBrandApplied(false)}>
                        Not right? Use the plain look
                    </LemonButton>
                </div>
            )}
            <div className="flex flex-col gap-2">
                <h3 className="text-base font-semibold mb-0">Pick the first one to send</h3>
                <div className="grid grid-cols-1 @2xl:grid-cols-3 gap-3">
                    {picks.slice(0, 3).map((pick) => (
                        <StarterCard
                            key={pick.starter.id}
                            pick={pick}
                            selected={pick.starter.id === starterId}
                            onSelect={() => selectStarter(pick.starter.id)}
                        />
                    ))}
                </div>
            </div>
            {starterId && <FlowSteps customizePanel={<AiCustomizer />} />}
        </div>
    )
}

function BrandPane({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
    return (
        <div className="flex flex-col gap-2 rounded border border-primary bg-surface-primary p-3">
            <span className="text-xs font-semibold uppercase text-secondary">{label}</span>
            {children}
        </div>
    )
}
