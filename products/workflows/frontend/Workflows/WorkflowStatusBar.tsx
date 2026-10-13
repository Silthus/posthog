import clsx from 'clsx'
import { useValues, useActions } from 'kea'

import { IconClock, IconDecisionTree, IconInfo, IconList } from '@posthog/icons'
import { LemonButton, LemonSegmentedButton, LemonSwitch, LemonTag, Spinner, Tooltip } from '@posthog/lemon-ui'

import { LastSavedIndicator } from 'lib/components/LastSavedIndicator'
import { useDebouncedValue } from 'lib/hooks/useDebouncedValue'
import { urls } from 'scenes/urls'

import { SceneDescription } from '~/layout/scenes/components/SceneDescription'
import { SceneName } from '~/layout/scenes/components/SceneTitleSection'

import type { HogFlowEditorLayout } from './hogflows/hogFlowEditorLogic'
import { WorkflowLogicProps, workflowLogic } from './workflowLogic'

type WorkflowStatusBarProps = WorkflowLogicProps & {
    editorLayout: HogFlowEditorLayout
    showEditorLayoutToggle: boolean
    onEditorLayoutChange: (layout: HogFlowEditorLayout) => void
    showTitle?: boolean
    commands?: JSX.Element
}

export function WorkflowStatusBar({
    editorLayout,
    showEditorLayoutToggle,
    onEditorLayoutChange,
    showTitle = false,
    commands,
    ...props
}: WorkflowStatusBarProps): JSX.Element | null {
    const logic = workflowLogic(props)
    const {
        originalWorkflow,
        workflow,
        workflowLoading,
        hasUnsavedChanges,
        hasStagedDraft,
        isAutoSavePending,
        autoSaveEnabled,
        lastSavedAt,
    } = useValues(logic)
    const { setAutoSaveEnabled, setWorkflowValue } = useActions(logic)
    const showSaving = useDebouncedValue(isAutoSavePending || workflowLoading, 1000)

    if (!originalWorkflow) {
        return null
    }

    const showWorkflowStatus = !props.editTemplateId
    const historyWorkflowId = props.id && props.id !== 'new' ? props.id : null
    const isActive = originalWorkflow.status === 'active'
    const isEditingDraftOfLive = isActive && (hasStagedDraft || hasUnsavedChanges)

    const statusTag = showWorkflowStatus ? (
        isEditingDraftOfLive ? (
            <LemonTag type="warning">Editing draft</LemonTag>
        ) : isActive ? (
            <LemonTag type="success">Live</LemonTag>
        ) : (
            <LemonTag>Draft</LemonTag>
        )
    ) : null
    const statusNarration =
        showWorkflowStatus && isActive ? (
            <span className="text-xs text-secondary truncate">
                {isEditingDraftOfLive
                    ? 'The live version keeps running until you publish.'
                    : 'Changes you make save as a draft.'}
            </span>
        ) : null
    const layoutToggle = showEditorLayoutToggle ? (
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
    ) : null

    return (
        <div
            className={clsx(
                'flex justify-between gap-2 px-2 border-b bg-surface-secondary rounded-t-md flex-wrap',
                showTitle ? 'items-start py-2' : 'items-center py-1.5'
            )}
        >
            {showTitle ? (
                <div className="flex min-w-0 flex-1 items-start gap-3">
                    {layoutToggle}
                    <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex min-w-0 items-center gap-2">
                            <div className="min-w-0">
                                <SceneName
                                    name={workflow?.name}
                                    onChange={(name) => setWorkflowValue('name', name)}
                                    canEdit
                                    renameDebounceMs={200}
                                />
                            </div>
                            {statusTag}
                            {statusNarration}
                        </div>
                        <SceneDescription
                            description={workflow?.description}
                            onChange={(description) => setWorkflowValue('description', description)}
                            canEdit
                            renameDebounceMs={200}
                        />
                    </div>
                </div>
            ) : (
                <div className="flex items-center gap-3 min-w-0">
                    {layoutToggle}
                    {statusTag}
                    {statusNarration}
                </div>
            )}
            {/* Interactive controls sit right-anchored with variable-width text leftmost, so the
                toggle and History never shift as the narration or the timestamp changes. */}
            {/* The canvas commands sit last, so their fixed width keeps them still while the timestamp changes. */}
            <div className="flex items-center gap-3 shrink-0">
                {showWorkflowStatus && historyWorkflowId && (
                    <div className="flex items-center gap-3 shrink-0">
                        {autoSaveEnabled && showSaving ? (
                            <span className="text-xs text-tertiary flex items-center gap-1">
                                <Spinner textColored /> Saving…
                            </span>
                        ) : lastSavedAt ? (
                            <LastSavedIndicator timestamp={lastSavedAt} />
                        ) : null}
                        <span className="flex items-center gap-1">
                            <LemonSwitch
                                checked={autoSaveEnabled}
                                onChange={setAutoSaveEnabled}
                                label="Auto-save"
                                size="small"
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
                {commands}
            </div>
        </div>
    )
}
