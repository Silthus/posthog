import { useActions, useValues } from 'kea'

import { openWorkflowSavedViewDialog } from './openWorkflowSavedViewDialog'
import { WorkflowSavedViewActions } from './WorkflowSavedViewActions'
import { WorkflowSavedViewTabsRow } from './WorkflowSavedViewTabsRow'
import { workflowsSavedViewsLogic } from './workflowsSavedViewsLogic'

export function WorkflowSavedViewTabs(): JSX.Element | null {
    const {
        available,
        views,
        activeViewId,
        viewCounts,
        isModified,
        activeViewChanges,
        activeView,
        canUpdateActiveView,
        saving,
        sharedSaveDisabledReason,
        writeDisabledReason,
    } = useValues(workflowsSavedViewsLogic)
    const { applyView, resetView, updateActiveView, deleteView } = useActions(workflowsSavedViewsLogic)
    if (!available) {
        return null
    }
    const saveRoom = isModified ? (canUpdateActiveView ? 2 : 1) : 0
    const rowProps = { views, activeViewId, viewCounts, isModified, activeViewChanges, onApplyView: applyView }
    return (
        <div className="@container/saved-views">
            <div className="flex flex-col @min-[42rem]/saved-views:flex-row @min-[42rem]/saved-views:items-end gap-2">
                <div className="flex-1 min-w-0">
                    <div className="@4xl:hidden">
                        <WorkflowSavedViewTabsRow {...rowProps} max={3} />
                    </div>
                    <div className="hidden @4xl:block @6xl:hidden">
                        <WorkflowSavedViewTabsRow {...rowProps} max={5 - Math.min(saveRoom, 1)} />
                    </div>
                    <div className="hidden @6xl:block">
                        <WorkflowSavedViewTabsRow {...rowProps} max={7 - saveRoom} />
                    </div>
                </div>
                <WorkflowSavedViewActions
                    activeView={activeView}
                    isModified={isModified}
                    canUpdateActiveView={canUpdateActiveView}
                    activeViewChanges={activeViewChanges}
                    saving={saving}
                    sharedSaveDisabledReason={sharedSaveDisabledReason}
                    loadingReason={writeDisabledReason}
                    onReset={resetView}
                    onSaveAs={() =>
                        openWorkflowSavedViewDialog(
                            async (name) => await workflowsSavedViewsLogic.asyncActions.saveViewAs(name)
                        )
                    }
                    onSave={updateActiveView}
                    onRename={() =>
                        openWorkflowSavedViewDialog(
                            async (name) => await workflowsSavedViewsLogic.asyncActions.renameView(activeView.id, name),
                            activeView.name
                        )
                    }
                    onDelete={() => deleteView(activeView.id)}
                />
            </div>
        </div>
    )
}
