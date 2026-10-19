import { useState } from 'react'

import { IconArrowUpRight, IconExternal, IconInfo } from '@posthog/icons'
import { LemonButton, LemonCard, LemonDivider, LemonTag, Link, Tooltip } from '@posthog/lemon-ui'

import { More } from 'lib/lemon-ui/LemonButton/More'
import { lemonToast } from 'lib/lemon-ui/LemonToast/LemonToast'
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

export function DestinationMoveVariantC({
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
            return <Preview edited={false} onEdit={() => onStepChange('save')} />
        case 'save':
            return <Preview edited onEdit={() => onStepChange('save')} onMoved={() => onStepChange('moved')} />
        default:
            return <Moved />
    }
}

function EntryPoints({ onOpen }: { onOpen: () => void }): JSX.Element {
    return (
        <div className="flex flex-col gap-8">
            <DestinationPageFrame
                hogFunction={DESTINATION}
                actions={
                    <>
                        <More
                            size="small"
                            overlay={
                                <>
                                    <LemonButton
                                        fullWidth
                                        icon={<IconArrowUpRight />}
                                        onClick={onOpen}
                                        data-attr="destination-open-as-workflow"
                                    >
                                        Open as workflow
                                    </LemonButton>
                                    <LemonButton fullWidth>Duplicate</LemonButton>
                                    <LemonDivider />
                                    <LemonButton status="danger" fullWidth>
                                        Delete
                                    </LemonButton>
                                </>
                            }
                        />
                        <LemonDivider vertical />
                        <LemonButton type="primary" size="small" disabledReason="No changes to save">
                            Save
                        </LemonButton>
                    </>
                }
                configuration={
                    <div className="flex flex-col gap-3">
                        <LemonButton
                            type="tertiary"
                            size="small"
                            className="border border-dashed"
                            fullWidth
                            icon={<IconArrowUpRight />}
                            onClick={onOpen}
                            tooltip="Preview this destination on the Workflows canvas. Nothing changes until you save."
                        >
                            <span className="flex flex-1 flex-wrap items-center gap-1">
                                Open as workflow
                                <span className="font-normal text-muted">
                                    to add waits, conditions and more steps after the Slack message
                                </span>
                            </span>
                        </LemonButton>
                        <DestinationConfigurationStub />
                    </div>
                }
            />
            <div className="flex flex-col gap-2">
                <h3 className="mb-0">Blocked destination: the strip explains why</h3>
                <DestinationPageFrame
                    hogFunction={BLOCKED_DESTINATION}
                    actions={
                        <LemonButton type="primary" size="small" disabledReason="No changes to save">
                            Save
                        </LemonButton>
                    }
                    configuration={
                        <LemonButton
                            type="tertiary"
                            size="small"
                            className="border border-dashed"
                            fullWidth
                            icon={<IconArrowUpRight />}
                            disabledReason={`${BLOCKED_REASON} (${BLOCKED_REASON_SOURCE})`}
                        >
                            <span className="flex flex-1 flex-wrap items-center gap-1">
                                Open as workflow
                                <span className="font-normal text-muted">{BLOCKED_REASON}</span>
                            </span>
                        </LemonButton>
                    }
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

function Preview({
    edited,
    onEdit,
    onMoved,
}: {
    edited: boolean
    onEdit: () => void
    onMoved?: () => void
}): JSX.Element {
    const [moving, setMoving] = useState(false)
    return (
        <SceneContent className="h-full flex flex-col grow">
            <SceneTitleSection
                name={DESTINATION.name}
                nameSuffix={
                    edited ? (
                        <LemonTag type="warning">1 change, not saved</LemonTag>
                    ) : (
                        <Tooltip title="Nothing has changed. The destination keeps sending until you make a change here and save it.">
                            <LemonTag type="muted" icon={<IconInfo />}>
                                Preview, nothing changed yet
                            </LemonTag>
                        </Tooltip>
                    )
                }
                description={DESTINATION.description}
                resourceType={{ type: 'workflows' }}
                canEdit={false}
                actions={
                    <>
                        <LemonButton type="secondary" size="small" to={urls.hogFunction(DESTINATION.id)}>
                            Back
                        </LemonButton>
                        <div className="flex flex-col items-end gap-0.5">
                            <LemonButton
                                type="primary"
                                size="small"
                                loading={moving}
                                disabledReason={
                                    edited ? undefined : 'Make a change to move this destination to Workflows'
                                }
                                onClick={() => {
                                    setMoving(true)
                                    setTimeout(() => {
                                        setMoving(false)
                                        lemonToast.success(
                                            `${DESTINATION.name} now runs as a workflow. The destination is disabled.`,
                                            {
                                                button: { label: 'Re-enable destination', action: () => undefined },
                                            }
                                        )
                                        onMoved?.()
                                    }, 600)
                                }}
                                data-attr="destination-preview-save-and-move"
                            >
                                Save and move
                            </LemonButton>
                            {edited && (
                                <span className="text-xs text-muted">
                                    {PRICE_LINE} ({PRICE_LINE_SOURCE})
                                </span>
                            )}
                        </div>
                    </>
                }
            />
            <div className="relative flex min-h-0 flex-1 flex-col">
                <PreviewCanvas workflowId={PREVIEW_WORKFLOW_ID} />
                <LemonCard
                    hoverEffect={false}
                    className="absolute bottom-4 right-4 z-10 flex w-72 flex-col gap-2 shadow-lg"
                    data-attr="destination-preview-ai-card"
                >
                    <strong className="text-sm">Not sure what to add?</strong>
                    <p className="mb-0 text-xs text-muted">
                        Describe what should happen after the Slack message and let AI build the steps.
                    </p>
                    <AiEscapeHatch stacked />
                    {!edited && (
                        <LemonButton type="tertiary" size="xsmall" onClick={onEdit} className="self-start">
                            Simulate an edit (prototype only)
                        </LemonButton>
                    )}
                </LemonCard>
            </div>
        </SceneContent>
    )
}

function Moved(): JSX.Element {
    const workflowUrl = urls.workflow(MOVED_WORKFLOW_ID, 'workflow')
    return (
        <div className="flex flex-col gap-8">
            <DestinationPageFrame
                hogFunction={MOVED_DESTINATION}
                nameSuffix={<MovedTag />}
                actions={
                    <>
                        <More
                            size="small"
                            overlay={
                                <>
                                    <LemonButton
                                        fullWidth
                                        tooltip="Both the workflow and the destination send until you disable one of them"
                                    >
                                        Send from here again
                                    </LemonButton>
                                    <LemonDivider />
                                    <LemonButton status="danger" fullWidth>
                                        Delete
                                    </LemonButton>
                                </>
                            }
                        />
                        <LemonDivider vertical />
                        <LemonButton
                            type="primary"
                            size="small"
                            icon={<IconExternal />}
                            to={workflowUrl}
                            data-attr="moved-destination-open-workflow"
                        >
                            Open workflow
                        </LemonButton>
                    </>
                }
                configuration={
                    <div className="relative">
                        <div className="pointer-events-none select-none opacity-40">
                            <DestinationConfigurationStub disabled />
                        </div>
                        <div className="absolute inset-0 flex items-start justify-center pt-12">
                            <LemonCard hoverEffect={false} className="flex max-w-md flex-col gap-2 shadow-lg">
                                <strong>Moved to Workflows on {MOVE_DATE}</strong>
                                <p className="mb-0 text-sm">
                                    Edit the Slack message and everything after it in the workflow{' '}
                                    <Link to={workflowUrl}>{DESTINATION.name}</Link>. This page stays as a record of
                                    what the destination used to do.
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    <LemonButton type="primary" size="small" to={workflowUrl} icon={<IconExternal />}>
                                        Open workflow
                                    </LemonButton>
                                    <LemonButton
                                        type="secondary"
                                        size="small"
                                        tooltip="Both the workflow and the destination send until you disable one of them"
                                    >
                                        Send from here again
                                    </LemonButton>
                                </div>
                            </LemonCard>
                        </div>
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
                                  rowClassName: 'opacity-60',
                                  nameSuffix: <MovedTag size="small" />,
                                  status: (
                                      <Link to={workflowUrl} className="whitespace-nowrap text-xs">
                                          Open workflow <IconExternal />
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
