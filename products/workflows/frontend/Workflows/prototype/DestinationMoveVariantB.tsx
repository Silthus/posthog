import { useState } from 'react'

import { IconArrowUpRight, IconCheckCircle, IconExternal } from '@posthog/icons'
import { LemonButton, LemonCard, LemonDivider, LemonTag, Link } from '@posthog/lemon-ui'

import { More } from 'lib/lemon-ui/LemonButton/More'
import { lemonToast } from 'lib/lemon-ui/LemonToast/LemonToast'
import { HogFunctionIcon } from 'scenes/hog-functions/configuration/HogFunctionIcon'
import { urls } from 'scenes/urls'

import { SceneContent } from '~/layout/scenes/components/SceneContent'
import { SceneTitleSection } from '~/layout/scenes/components/SceneTitleSection'

import { AiEscapeHatch } from './AiEscapeHatch'
import { DestinationListFrame, MovedTag, openAsWorkflowMenuItem } from './DestinationListFrame'
import {
    BLOCKED_DESTINATION,
    BLOCKED_REASON,
    BLOCKED_REASON_SOURCE,
    DESTINATION,
    MOVE_DATE,
    MOVED_DESTINATION,
    MOVED_WORKFLOW_ID,
    PREVIEW_WORKFLOW_ID,
    PRICE_LINE,
    PRICE_LINE_SOURCE,
} from './destinationMoveFixtures'
import { DestinationConfigurationStub, DestinationPageFrame } from './DestinationPageFrame'
import { PreviewCanvas } from './PreviewCanvas'
import { MoveStep } from './PrototypeSwitcher'

export function DestinationMoveVariantB({
    step,
    onStepChange,
}: {
    step: MoveStep
    onStepChange: (step: MoveStep) => void
}): JSX.Element {
    switch (step) {
        case 'entry':
            return <EntryPoints onOpen={() => onStepChange('preview')} />
        case 'preview':
            return <Preview onSave={() => onStepChange('save')} />
        case 'save':
            return <Preview confirming onSave={() => onStepChange('save')} onMoved={() => onStepChange('moved')} />
        default:
            return <Moved />
    }
}

function EntryPoints({ onOpen }: { onOpen: () => void }): JSX.Element {
    const openButton = (blocked: boolean): JSX.Element => (
        <LemonButton
            type="secondary"
            size="small"
            icon={<IconArrowUpRight />}
            onClick={onOpen}
            disabledReason={blocked ? `${BLOCKED_REASON} (${BLOCKED_REASON_SOURCE})` : undefined}
            tooltip={
                blocked
                    ? undefined
                    : 'Preview this destination on the Workflows canvas. Nothing changes until you save.'
            }
            data-attr="destination-open-as-workflow"
        >
            Open as workflow
        </LemonButton>
    )
    return (
        <div className="flex flex-col gap-8">
            <DestinationPageFrame
                hogFunction={DESTINATION}
                actions={
                    <>
                        <More size="small" overlay={<LemonButton fullWidth>Duplicate</LemonButton>} />
                        <LemonDivider vertical />
                        {openButton(false)}
                        <LemonButton type="primary" size="small" disabledReason="No changes to save">
                            Save
                        </LemonButton>
                    </>
                }
                aboveTabs={
                    <LemonCard hoverEffect={false} className="flex flex-wrap items-center gap-3 py-2">
                        <IconArrowUpRight className="text-xl text-muted" />
                        <div className="flex-1 text-sm">
                            <strong>This destination can run as a workflow.</strong> Add waits, conditions and more
                            steps after the Slack message.
                        </div>
                        <LemonButton type="secondary" size="small" onClick={onOpen}>
                            See the preview
                        </LemonButton>
                    </LemonCard>
                }
            />
            <div className="flex flex-col gap-2">
                <h3 className="mb-0">Blocked destination header</h3>
                <DestinationPageFrame
                    hogFunction={BLOCKED_DESTINATION}
                    actions={
                        <>
                            {openButton(true)}
                            <LemonButton type="primary" size="small" disabledReason="No changes to save">
                                Save
                            </LemonButton>
                        </>
                    }
                    configuration={<div className="text-muted text-sm">Configuration omitted in the prototype.</div>}
                />
            </div>
            <div className="flex flex-col gap-2">
                <h3 className="mb-0">Row menu on the Real-time tab</h3>
                <DestinationListFrame
                    decorate={(hogFunction) => ({
                        menuItems: [
                            openAsWorkflowMenuItem(hogFunction, onOpen),
                            { label: 'Pause' },
                            { label: 'Delete', status: 'danger' },
                        ],
                    })}
                />
            </div>
        </div>
    )
}

function RailRow({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
    return (
        <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase text-muted">{label}</span>
            <div className="text-sm">{children}</div>
        </div>
    )
}

function Preview({
    confirming = false,
    onSave,
    onMoved,
}: {
    confirming?: boolean
    onSave: () => void
    onMoved?: () => void
}): JSX.Element {
    const [moving, setMoving] = useState(false)
    return (
        <SceneContent className="h-full flex flex-col grow">
            <SceneTitleSection
                name={DESTINATION.name}
                nameSuffix={<LemonTag type="highlight">Not saved</LemonTag>}
                description={DESTINATION.description}
                resourceType={{ type: 'workflows' }}
                canEdit={false}
                actions={
                    <LemonButton type="secondary" size="small" to={urls.hogFunction(DESTINATION.id)}>
                        Back to the destination
                    </LemonButton>
                }
            />
            <div className="flex min-h-0 flex-1 flex-col gap-4 @[64rem]/main-content:flex-row">
                <LemonCard
                    hoverEffect={false}
                    className="flex w-full shrink-0 flex-col gap-4 @[64rem]/main-content:w-80"
                    data-attr="destination-move-rail"
                >
                    <h3 className="mb-0">Move to Workflows</h3>
                    <RailRow label="From">
                        <span className="flex items-center gap-2">
                            <HogFunctionIcon src={DESTINATION.icon_url} size="small" />
                            {DESTINATION.name}
                            <LemonTag type="success">Active</LemonTag>
                        </span>
                    </RailRow>
                    <RailRow label="To">
                        <span className="flex items-center gap-2">
                            {DESTINATION.name}
                            <LemonTag type="highlight">Not saved</LemonTag>
                        </span>
                    </RailRow>
                    <RailRow label="What changes">
                        Nothing yet. The destination keeps sending. When you save, the workflow takes over and the
                        destination is disabled.
                    </RailRow>
                    <RailRow label="Price">
                        {PRICE_LINE} <span className="text-muted">({PRICE_LINE_SOURCE})</span>
                    </RailRow>
                    <RailRow label="Want more steps?">
                        <p className="mb-2 text-muted">
                            Describe what else should happen after the Slack message and let AI build it.
                        </p>
                        <AiEscapeHatch stacked />
                    </RailRow>
                    <LemonDivider />
                    {confirming ? (
                        <div className="flex flex-col gap-2">
                            <p className="mb-0 text-sm">
                                <strong>Ready to move?</strong> The workflow starts right away and the destination stops
                                sending. You can re-enable the destination by hand later.
                            </p>
                            <LemonButton
                                type="primary"
                                fullWidth
                                loading={moving}
                                onClick={() => {
                                    setMoving(true)
                                    setTimeout(() => {
                                        setMoving(false)
                                        lemonToast.success(
                                            `${DESTINATION.name} now runs as a workflow. The destination is disabled.`
                                        )
                                        onMoved?.()
                                    }, 600)
                                }}
                                data-attr="destination-move-confirm"
                            >
                                Move now
                            </LemonButton>
                            <LemonButton type="secondary" fullWidth>
                                Keep editing
                            </LemonButton>
                        </div>
                    ) : (
                        <LemonButton
                            type="primary"
                            fullWidth
                            onClick={onSave}
                            data-attr="destination-preview-save-and-move"
                        >
                            Save and move
                        </LemonButton>
                    )}
                </LemonCard>
                <PreviewCanvas workflowId={PREVIEW_WORKFLOW_ID} />
            </div>
        </SceneContent>
    )
}

function Moved(): JSX.Element {
    const workflowUrl = urls.workflow(MOVED_WORKFLOW_ID, 'workflow')
    const [showConfiguration, setShowConfiguration] = useState(false)
    return (
        <div className="flex flex-col gap-8">
            <DestinationPageFrame
                hogFunction={MOVED_DESTINATION}
                nameSuffix={<MovedTag />}
                actions={
                    <LemonButton
                        type="primary"
                        size="small"
                        icon={<IconExternal />}
                        to={workflowUrl}
                        data-attr="moved-destination-open-workflow"
                    >
                        Open workflow
                    </LemonButton>
                }
                configuration={
                    <div className="flex flex-col gap-4">
                        <LemonCard hoverEffect={false} className="flex max-w-2xl flex-col gap-3">
                            <div className="flex items-center gap-2">
                                <IconCheckCircle className="text-xl text-success" />
                                <h3 className="mb-0">This destination now lives in Workflows</h3>
                            </div>
                            <p className="mb-0 text-sm">
                                Moved on {MOVE_DATE}. The workflow <Link to={workflowUrl}>{DESTINATION.name}</Link>{' '}
                                sends the Slack message now, and this destination is disabled. Metrics and invocations
                                from before the move stay here.
                            </p>
                            <div className="flex flex-wrap gap-2">
                                <LemonButton type="primary" to={workflowUrl} icon={<IconExternal />}>
                                    Open workflow
                                </LemonButton>
                                <LemonButton type="secondary" onClick={() => setShowConfiguration(!showConfiguration)}>
                                    {showConfiguration ? 'Hide the old configuration' : 'Show the old configuration'}
                                </LemonButton>
                                <LemonButton
                                    type="tertiary"
                                    tooltip="Both the workflow and the destination send until you disable one of them"
                                >
                                    Send from here again
                                </LemonButton>
                            </div>
                        </LemonCard>
                        {showConfiguration && <DestinationConfigurationStub disabled />}
                    </div>
                }
            />
            <div className="flex flex-col gap-2">
                <h3 className="mb-0">Row on the Real-time tab</h3>
                <DestinationListFrame
                    movedDestination={MOVED_DESTINATION}
                    decorate={(hogFunction) =>
                        hogFunction.id === DESTINATION.id
                            ? {
                                  status: (
                                      <Link to={workflowUrl}>
                                          <LemonTag type="completion" icon={<IconExternal />}>
                                              Moved
                                          </LemonTag>
                                      </Link>
                                  ),
                                  menuItems: [
                                      { label: 'Open workflow', to: workflowUrl },
                                      { label: 'Send from here again' },
                                      { label: 'Delete', status: 'danger' },
                                  ],
                              }
                            : {
                                  menuItems: [
                                      openAsWorkflowMenuItem(hogFunction, () => undefined),
                                      { label: 'Pause' },
                                      { label: 'Delete', status: 'danger' },
                                  ],
                              }
                    }
                />
            </div>
        </div>
    )
}
