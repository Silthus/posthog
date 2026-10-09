import { useActions, useValues } from 'kea'

import { IconDrag } from '@posthog/icons'
import { LemonButton, LemonTag, Tooltip } from '@posthog/lemon-ui'

import { FEATURE_FLAGS } from 'lib/constants'
import { LemonTableLink } from 'lib/lemon-ui/LemonTable/LemonTableLink'
import { TreeNodeDraggable } from 'lib/lemon-ui/LemonTree/LemonTreeUtils'
import { featureFlagLogic } from 'lib/logic/featureFlagLogic'
import { urls } from 'scenes/urls'

import { projectTreeDataLogic } from '~/layout/panel-layout/ProjectTree/projectTreeDataLogic'
import { getItemId } from '~/layout/panel-layout/ProjectTree/utils'

import { WorkflowListRow } from './workflowListRows'

export function WorkflowListNameCell({ row }: { row: WorkflowListRow }): JSX.Element {
    const { featureFlags } = useValues(featureFlagLogic)
    const { itemsByRef } = useValues(projectTreeDataLogic)
    const { syncTypeAndRef } = useActions(projectTreeDataLogic)
    const candidate = itemsByRef[`hog_flow::${row.id}`]
    const entry = candidate?.shortcut ? undefined : candidate
    const enabled = !!featureFlags[FEATURE_FLAGS.WORKFLOWS_PROJECT_FILES]
    const canMove = enabled && !['viewer', 'none'].includes(row.workflow.user_access_level ?? '')
    const archived = row.workflow.status === 'archived'
    const name = (
        <span data-attr="workflows-list-v2-name" className={archived ? 'truncate text-muted' : 'truncate'}>
            {row.name || 'Untitled'}
        </span>
    )
    const description = row.workflow.description ? (
        <Tooltip title={row.workflow.description}>
            <span data-attr="workflows-list-v2-description" className="block truncate">
                {row.workflow.description}
            </span>
        </Tooltip>
    ) : undefined
    const title = (
        <span className="flex items-center gap-2 flex-wrap min-w-0 w-full">
            {name}
            {featureFlags[FEATURE_FLAGS.SELF_OPTIMISING_WORKFLOWS] &&
                row.workflow.status === 'active' &&
                row.workflow.suggestions_enabled && (
                    <LemonTag
                        type={row.workflow.pending_suggestions ? 'completion' : 'option'}
                        data-attr="workflow-list-suggestions"
                    >
                        {!row.workflow.pending_suggestions
                            ? 'Self-driving'
                            : row.workflow.pending_suggestions === 1
                              ? '1 suggestion'
                              : `${row.workflow.pending_suggestions} suggestions`}
                    </LemonTag>
                )}
        </span>
    )
    if (!enabled) {
        return (
            <LemonTableLink
                to={archived ? undefined : urls.workflow(row.id, 'workflow')}
                title={archived ? <Tooltip title="Restore this workflow to make changes">{name}</Tooltip> : title}
                description={description}
                truncateTitle
            />
        )
    }
    return (
        <div
            className="flex items-center min-w-0"
            onMouseEnter={() => !entry && canMove && syncTypeAndRef('hog_flow', row.id)}
            onFocus={() => !entry && canMove && syncTypeAndRef('hog_flow', row.id)}
        >
            <TreeNodeDraggable
                id={entry ? getItemId(entry) : row.id}
                scope="workflow-project-files"
                enableDragging={!!entry && canMove}
                className="max-w-8 shrink-0"
            >
                <LemonButton
                    size="small"
                    icon={<IconDrag />}
                    aria-label={`Drag workflow ${row.name}`}
                    disabled={!entry || !canMove}
                />
            </TreeNodeDraggable>
            <div className="flex-1 min-w-0">
                <LemonTableLink
                    to={archived ? undefined : urls.workflow(row.id, 'workflow')}
                    title={archived ? <Tooltip title="Restore this workflow to make changes">{name}</Tooltip> : title}
                    description={description}
                    truncateTitle
                />
            </div>
        </div>
    )
}
