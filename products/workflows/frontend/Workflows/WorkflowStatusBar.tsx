import { useValues, useActions } from 'kea'

import { IconClock, IconDecisionTree, IconInfo, IconList } from '@posthog/icons'
import { LemonButton, LemonSegmentedButton, LemonSwitch, LemonTag, Spinner, Tooltip } from '@posthog/lemon-ui'

import { LastSavedIndicator } from 'lib/components/LastSavedIndicator'
import { useDebouncedValue } from 'lib/hooks/useDebouncedValue'
import { urls } from 'scenes/urls'

import { CodeManagedTag } from './CodeManagedTag'
import type { HogFlowEditorLayout } from './hogflows/hogFlowEditorLogic'
import { useWorkflowReadOnly } from './hogflows/prototypeReadOnlyMode'
import { WorkflowSourceInline } from './prototype/WorkflowSourceRow'
import { WorkflowLogicProps, workflowLogic } from './workflowLogic'

type WorkflowStatusBarProps = WorkflowLogicProps & {
    editorLayout: HogFlowEditorLayout
    showEditorLayoutToggle: boolean
    onEditorLayoutChange: (layout: HogFlowEditorLayout) => void
}

export function WorkflowStatusBar({
    editorLayout,
    showEditorLayoutToggle,
    onEditorLayoutChange,
    ...props
}: WorkflowStatusBarProps): JSX.Element | null {
    const logic = workflowLogic(props)
    const {
        originalWorkflow,
        workflowLoading,
        hasUnsavedChanges,
        hasStagedDraft,
        isAutoSavePending,
        autoSaveEnabled,
        lastSavedAt,
    } = useValues(logic)
    const { setAutoSaveEnabled } = useActions(logic)
    const {
        readOnly,
        reason,
        mode: { autosave },
    } = useWorkflowReadOnly()
    const hideAutoSave = readOnly && autosave === 'hidden'
    const showSaving = useDebouncedValue(isAutoSavePending || workflowLoading, 1000)

    if (!originalWorkflow) {
        return null
    }

    const showWorkflowStatus = !props.editTemplateId
    const historyWorkflowId = props.id && props.id !== 'new' ? props.id : null
    const isActive = originalWorkflow.status === 'active'
    const isEditingDraftOfLive = isActive && (hasStagedDraft || hasUnsavedChanges)

    return (
        <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b bg-surface-secondary rounded-t-md flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
                {showEditorLayoutToggle && (
                    <LemonSegmentedButton
                        value={editorLayout}
                        onChange={onEditorLayoutChange}
                        size="small"
                        options={[
                            {
                                value: 'simple',
                                icon: <IconList />,
                                tooltip: 'List view',
                                'data-attr': 'workflow-switch-to-simple-view',
                            },
                            {
                                value: 'advanced',
                                icon: <IconDecisionTree />,
                                tooltip: 'Graph view',
                                'data-attr': 'workflow-switch-to-advanced-view',
                            },
                        ]}
                    />
                )}
                {showWorkflowStatus &&
                    (isEditingDraftOfLive ? (
                        <LemonTag type="warning">Editing draft</LemonTag>
                    ) : isActive ? (
                        <LemonTag type="success">Live</LemonTag>
                    ) : (
                        <LemonTag>Draft</LemonTag>
                    ))}
                {readOnly ? (
                    // The editor header is where a person watches for the draft state, so the same
                    // source link the scene header and the revisions table show belongs here too.
                    <div className="flex min-w-0 items-center gap-2">
                        <CodeManagedTag workflow={originalWorkflow} />
                        <WorkflowSourceInline workflow={originalWorkflow} />
                    </div>
                ) : (
                    showWorkflowStatus &&
                    isActive && (
                        <span className="text-xs text-secondary truncate">
                            {isEditingDraftOfLive
                                ? 'The live version keeps running until you publish.'
                                : 'Changes you make save as a draft.'}
                        </span>
                    )
                )}
            </div>
            {/* Interactive controls sit right-anchored with variable-width text leftmost, so the
                toggle and History never shift as the narration or the timestamp changes. */}
            {showWorkflowStatus && historyWorkflowId && (
                <div className="flex items-center gap-3 shrink-0">
                    {hideAutoSave ? null : autoSaveEnabled && showSaving ? (
                        <span className="text-xs text-tertiary flex items-center gap-1">
                            <Spinner textColored /> Saving…
                        </span>
                    ) : lastSavedAt ? (
                        <LastSavedIndicator timestamp={lastSavedAt} />
                    ) : null}
                    {!hideAutoSave && (
                        <span className="flex items-center gap-1">
                            <LemonSwitch
                                checked={autoSaveEnabled && !readOnly}
                                onChange={setAutoSaveEnabled}
                                label="Auto-save"
                                size="small"
                                disabledReason={readOnly ? reason : undefined}
                            />
                            <Tooltip
                                title={
                                    isActive
                                        ? 'Auto-save stores your changes as a draft. Nothing goes live until you publish.'
                                        : 'Draft workflows auto-save as you edit.'
                                }
                                placement="bottom"
                            >
                                <IconInfo className="text-tertiary size-4" />
                            </Tooltip>
                        </span>
                    )}
                    <LemonButton
                        type="tertiary"
                        size="small"
                        icon={<IconClock />}
                        to={urls.workflow(historyWorkflowId, 'history')}
                        tooltip="See and restore previous versions"
                    >
                        History
                    </LemonButton>
                </div>
            )}
        </div>
    )
}
