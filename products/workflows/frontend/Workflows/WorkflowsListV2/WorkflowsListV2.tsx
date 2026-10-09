import { useActions, useValues } from 'kea'

import { IconFolder } from '@posthog/icons'
import { LemonButton } from '@posthog/lemon-ui'

import { FEATURE_FLAGS } from 'lib/constants'
import { useOnMountEffect } from 'lib/hooks/useOnMountEffect'
import { LemonTable } from 'lib/lemon-ui/LemonTable'
import { featureFlagLogic } from 'lib/logic/featureFlagLogic'

import { ProjectTree } from '~/layout/panel-layout/ProjectTree/ProjectTree'

import { AutomationEmptyState } from '../../setupGuide/AutomationEmptyState'
import { AutomationSuggestionBanner } from '../../setupGuide/AutomationSuggestionBanner'
import { MessagingSetupReminderBanner } from '../../setupGuide/MessagingSetupReminderBanner'
import { workflowLogic } from '../workflowLogic'
import { serializeFacetQuery } from './FacetSearchBar/facetQuery'
import { FacetSearchBar } from './FacetSearchBar/FacetSearchBar'
import { workflowFoldersLogic } from './workflowFoldersLogic'
import { WorkflowSavedViewTabs } from './WorkflowSavedViewTabs'
import { buildWorkflowsListV2Columns } from './workflowsListV2Columns'
import { workflowsListV2Logic } from './workflowsListV2Logic'

const PAGE_SIZE = 100

export function WorkflowsListV2(): JSX.Element {
    const { featureFlags } = useValues(featureFlagLogic)
    const guidedOnboardingEnabled = !!featureFlags[FEATURE_FLAGS.WORKFLOWS_GUIDED_ONBOARDING]
    const {
        projectFilesEnabled,
        rows,
        filteredRows,
        facets,
        matchesText,
        value,
        listLoaded,
        workflowsLoading,
        loadFailed,
        shownColumns,
        metricsLoading,
        serverSearchStatus,
        folderScopeLoading,
        folderScopeFailed,
        isUnfilteredAutomationView,
        hasHealthFilter,
        metricsLoaded,
    } = useValues(workflowsListV2Logic)
    const { setValue, loadWorkflows, clearFilters, loadMetrics, reloadFolderScope } = useActions(workflowsListV2Logic)
    const { currentFolder } = useValues(workflowFoldersLogic)
    const { openFolder } = useActions(workflowFoldersLogic)
    const showAutomationEmptyState = guidedOnboardingEnabled && isUnfilteredAutomationView

    useOnMountEffect(() => {
        // Leaving the new-workflow scene keeps its logic mounted, so drop it here as WorkflowsTable does.
        workflowLogic.findMounted({ id: 'new' })?.unmount()
    })

    const renderBody = (): JSX.Element => {
        if (folderScopeFailed) {
            return (
                <div className="border rounded p-8 text-center">
                    <span>Couldn't load this project folder</span>
                    <LemonButton onClick={reloadFolderScope} loading={folderScopeLoading}>
                        Retry
                    </LemonButton>
                </div>
            )
        }
        if (loadFailed) {
            return (
                <div className="flex flex-col items-center gap-2 border rounded p-8 text-center">
                    <span className="font-semibold">Couldn't load workflows</span>
                    <LemonButton
                        type="secondary"
                        size="small"
                        loading={workflowsLoading}
                        onClick={loadWorkflows}
                        data-attr="workflows-list-v2-retry"
                    >
                        Retry
                    </LemonButton>
                </div>
            )
        }
        const searchPending = serverSearchStatus === 'pending'
        const healthPending = hasHealthFilter && !metricsLoaded
        if (listLoaded && healthPending && !metricsLoading) {
            return (
                <div className="flex flex-col items-center gap-2 border rounded p-8 text-center">
                    <span>Couldn't load run metrics for these health filters</span>
                    <LemonButton
                        type="secondary"
                        size="small"
                        loading={metricsLoading}
                        onClick={loadMetrics}
                        data-attr="workflows-list-v2-metrics-retry"
                    >
                        Retry
                    </LemonButton>
                </div>
            )
        }
        if (
            listLoaded &&
            filteredRows.length === 0 &&
            showAutomationEmptyState &&
            !searchPending &&
            !folderScopeLoading
        ) {
            return <AutomationEmptyState />
        }
        if (
            listLoaded &&
            rows.length > 0 &&
            filteredRows.length === 0 &&
            !searchPending &&
            !healthPending &&
            !folderScopeLoading
        ) {
            return (
                <div className="flex flex-col items-center gap-2 border rounded p-8 text-center">
                    <span>
                        {currentFolder === null
                            ? 'No workflows match these filters'
                            : 'No workflows in this folder match these filters'}
                    </span>
                    <LemonButton
                        type="secondary"
                        size="small"
                        onClick={clearFilters}
                        data-attr="workflows-list-v2-clear-filters"
                    >
                        Clear filters
                    </LemonButton>
                </div>
            )
        }
        return (
            <LemonTable
                // A new filter starts again on page one, as the flag-off list does.
                key={`${serializeFacetQuery(value.filters)}\n${value.text}`}
                size="small"
                dataSource={filteredRows}
                // Until the server search answers, a match in an email body can still add rows.
                loading={!listLoaded || searchPending || folderScopeLoading || healthPending}
                rowKey="id"
                columns={buildWorkflowsListV2Columns(shownColumns, metricsLoading)}
                // Client-side pages stay out of the URL; `page` there is an old list param.
                pagination={{ pageSize: PAGE_SIZE, useUrl: false }}
                nouns={['workflow', 'workflows']}
                emptyState="No workflows yet"
            />
        )
    }

    return (
        <div className="flex flex-col gap-3 min-w-0" data-attr="workflows-list-v2">
            {guidedOnboardingEnabled && <MessagingSetupReminderBanner />}
            <div>
                <WorkflowSavedViewTabs />
                <FacetSearchBar
                    facets={facets}
                    items={rows}
                    value={value}
                    onChange={setValue}
                    matchesText={matchesText}
                    placeholder="Search workflows, or filter with status:, owner:, health: and more"
                    dataAttr="workflows-search"
                />
            </div>
            {serverSearchStatus === 'failed' && (
                <div className="text-xs text-secondary" data-attr="workflows-list-v2-search-failed">
                    Couldn't search step names and email content. Showing matches on name and description only.
                </div>
            )}
            {projectFilesEnabled ? (
                <div className="flex flex-col gap-3 @min-[48rem]/main-content:flex-row min-w-0">
                    <nav
                        aria-label="Project files"
                        className="border rounded p-2 @min-[48rem]/main-content:w-56 shrink-0 max-h-96 overflow-y-auto"
                    >
                        <LemonButton
                            fullWidth
                            icon={<IconFolder />}
                            active={currentFolder === null}
                            onClick={() => openFolder(null)}
                            data-attr="workflows-project-root"
                        >
                            Project files
                        </LemonButton>
                        <ProjectTree
                            onlyTree
                            root="project://"
                            logicKey="workflow-project-files"
                            onFolderClicked={(folder) => openFolder(folder.record?.path ?? '')}
                            showRecents={false}
                            shareDragAndDropContext
                        />
                    </nav>
                    <div className="min-w-0 flex-1">{renderBody()}</div>
                </div>
            ) : (
                renderBody()
            )}
            {guidedOnboardingEnabled && <AutomationSuggestionBanner />}
        </div>
    )
}
