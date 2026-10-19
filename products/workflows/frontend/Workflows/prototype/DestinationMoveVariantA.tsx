import { useState } from 'react'

import { IconArrowUpRight, IconExternal } from '@posthog/icons'
import { LemonBanner, LemonButton, LemonDivider, LemonModal, LemonTag, Link } from '@posthog/lemon-ui'

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

export function DestinationMoveVariantA({
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
            return (
                <Preview
                    confirming
                    onSave={() => onStepChange('save')}
                    onCancel={() => onStepChange('preview')}
                    onMoved={() => onStepChange('moved')}
                />
            )
        default:
            return <Moved />
    }
}

function OpenAsWorkflowButton({ blocked, onClick }: { blocked?: boolean; onClick: () => void }): JSX.Element {
    return (
        <LemonButton
            type="secondary"
            size="small"
            icon={<IconArrowUpRight />}
            onClick={onClick}
            tooltip="Preview this destination on the Workflows canvas. Nothing changes until you save."
            disabledReason={blocked ? `${BLOCKED_REASON} (${BLOCKED_REASON_SOURCE})` : undefined}
            data-attr="destination-open-as-workflow"
        >
            Open as workflow
        </LemonButton>
    )
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
                                    <LemonButton fullWidth>Duplicate</LemonButton>
                                    <LemonDivider />
                                    <LemonButton status="danger" fullWidth>
                                        Delete
                                    </LemonButton>
                                </>
                            }
                        />
                        <LemonDivider vertical />
                        <OpenAsWorkflowButton onClick={onOpen} />
                        <LemonButton type="primary" size="small" disabledReason="No changes to save">
                            Save
                        </LemonButton>
                    </>
                }
            />
            <div className="flex flex-col gap-2">
                <h3 className="mb-0">Blocked destination header</h3>
                <DestinationPageFrame
                    hogFunction={BLOCKED_DESTINATION}
                    actions={
                        <>
                            <OpenAsWorkflowButton blocked onClick={onOpen} />
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
                            { label: hogFunction.enabled ? 'Pause' : 'Unpause' },
                            { label: 'Delete', status: 'danger' },
                        ],
                    })}
                />
            </div>
        </div>
    )
}

function Preview({
    confirming = false,
    onSave,
    onCancel,
    onMoved,
}: {
    confirming?: boolean
    onSave: () => void
    onCancel?: () => void
    onMoved?: () => void
}): JSX.Element {
    const [moving, setMoving] = useState(false)
    return (
        <SceneContent className="h-full flex flex-col grow">
            <SceneTitleSection
                name={DESTINATION.name}
                nameSuffix={<LemonTag type="highlight">Preview</LemonTag>}
                description={DESTINATION.description}
                resourceType={{ type: 'workflows' }}
                canEdit={false}
                actions={
                    <>
                        <AiEscapeHatch />
                        <LemonDivider vertical />
                        <LemonButton type="secondary" size="small" to={urls.hogFunction(DESTINATION.id)}>
                            Discard preview
                        </LemonButton>
                        <LemonButton
                            type="primary"
                            size="small"
                            onClick={onSave}
                            data-attr="destination-preview-save-and-move"
                        >
                            Save and move
                        </LemonButton>
                    </>
                }
            />
            <LemonBanner type="info" data-attr="destination-preview-banner">
                <strong>This is a preview of {DESTINATION.name} as a workflow.</strong> Nothing has changed yet, and the
                destination keeps sending. Edit the steps if you want, then save: that creates the workflow and disables
                the destination.
            </LemonBanner>
            <PreviewCanvas workflowId={PREVIEW_WORKFLOW_ID} />
            <LemonModal
                isOpen={confirming}
                onClose={onCancel}
                title={`Move ${DESTINATION.name} to Workflows?`}
                description="Saving this preview creates the workflow and disables the destination in one step, so no event sends twice."
                footer={
                    <>
                        <LemonButton type="secondary" onClick={onCancel}>
                            Cancel
                        </LemonButton>
                        <LemonButton
                            type="primary"
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
                            Move to Workflows
                        </LemonButton>
                    </>
                }
            >
                <ul className="list-disc pl-5 flex flex-col gap-1">
                    <li>
                        A workflow named <strong>{DESTINATION.name}</strong> is created and enabled.
                    </li>
                    <li>
                        The destination is disabled and keeps a link to the workflow. You can re-enable it by hand at
                        any time.
                    </li>
                    <li>
                        {PRICE_LINE} <span className="text-muted">({PRICE_LINE_SOURCE})</span>
                    </li>
                </ul>
            </LemonModal>
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
                                        Re-enable here
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
                aboveTabs={
                    <LemonBanner type="success" action={{ children: 'Open workflow', to: workflowUrl }}>
                        This destination moved to Workflows on {MOVE_DATE} and no longer sends from here. Edit it as the
                        workflow <Link to={workflowUrl}>{DESTINATION.name}</Link>.
                    </LemonBanner>
                }
                configuration={<DestinationConfigurationStub disabled />}
            />
            <div className="flex flex-col gap-2">
                <h3 className="mb-0">Row on the Real-time tab</h3>
                <DestinationListFrame
                    movedDestination={MOVED_DESTINATION}
                    decorate={(hogFunction) =>
                        hogFunction.id === DESTINATION.id
                            ? {
                                  nameSuffix: <MovedTag size="small" />,
                                  menuItems: [
                                      { label: 'Open workflow', to: workflowUrl },
                                      { label: 'Re-enable here' },
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
