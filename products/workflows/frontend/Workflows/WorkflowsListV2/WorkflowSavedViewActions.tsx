import { IconEllipsis } from '@posthog/icons'
import { LemonButton, LemonMenu } from '@posthog/lemon-ui'

import { WorkflowSavedView } from './workflowSavedViews'

export interface WorkflowSavedViewActionsProps {
    activeView: WorkflowSavedView
    isModified: boolean
    canUpdateActiveView: boolean
    activeViewChanges: string[]
    saving: boolean
    loadingReason?: string
    sharedSaveDisabledReason?: string
    onReset: () => void
    onSaveAs: () => void
    onSave: () => void
    onRename: () => void
    onDelete: () => void
}

export function WorkflowSavedViewActions({
    activeView,
    isModified,
    canUpdateActiveView,
    activeViewChanges,
    saving,
    loadingReason,
    sharedSaveDisabledReason,
    onReset,
    onSaveAs,
    onSave,
    onRename,
    onDelete,
}: WorkflowSavedViewActionsProps): JSX.Element {
    const changed = activeViewChanges.join(', ')
    return (
        <div className="flex flex-wrap items-center gap-1 pb-2 shrink-0" data-attr="workflows-combined-view-actions">
            {isModified && (
                <>
                    <LemonButton
                        size="small"
                        type="tertiary"
                        onClick={onReset}
                        disabledReason={saving ? 'A view is being saved' : undefined}
                        tooltip={`Discard your changes and go back to ${activeView.name}`}
                        data-attr="workflows-combined-reset-view"
                    >
                        Reset
                    </LemonButton>
                    <LemonButton
                        size="small"
                        type={canUpdateActiveView ? 'secondary' : 'primary'}
                        onClick={onSaveAs}
                        disabledReason={saving ? 'A view is being saved' : loadingReason}
                        tooltip={
                            canUpdateActiveView
                                ? `Keep ${activeView.name} as it was and save your changes as a new tab`
                                : `${activeView.name} is built in and can't change. Save your changes (${changed}) as a new tab.`
                        }
                        data-attr="workflows-combined-save-as-new"
                    >
                        Save as new view
                    </LemonButton>
                    {canUpdateActiveView && (
                        <LemonButton
                            size="small"
                            type="primary"
                            onClick={onSave}
                            loading={saving}
                            disabledReason={sharedSaveDisabledReason ?? loadingReason}
                            tooltip={`Update ${activeView.name} for everyone in this project. Changed: ${changed}.`}
                            data-attr="workflows-combined-save-for-everyone"
                        >
                            Save for everyone
                        </LemonButton>
                    )}
                </>
            )}
            {canUpdateActiveView && (
                <LemonMenu
                    placement="bottom-end"
                    buttonSize="medium"
                    items={[
                        { label: 'Rename view', onClick: onRename },
                        { label: 'Delete view', status: 'danger', onClick: onDelete },
                    ]}
                >
                    <LemonButton
                        size="small"
                        type="tertiary"
                        icon={<IconEllipsis />}
                        loading={saving && !isModified}
                        disabledReason={saving ? 'A view is being saved' : loadingReason}
                        data-attr="workflows-combined-view-more"
                        aria-label="More options"
                    />
                </LemonMenu>
            )}
        </div>
    )
}
