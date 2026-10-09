import { useActions, useValues } from 'kea'

import { ObjectTags } from 'lib/components/ObjectTags/ObjectTags'
import { toAccessControlLevel, userHasAccess } from 'lib/utils/accessControlUtils'

import { tagsModel } from '~/models/tagsModel'
import { AccessControlLevel, AccessControlResourceType } from '~/types'

import { WorkflowLibraryRow } from './workflowListRows'
import { workflowsListV2Logic } from './workflowsListV2Logic'

export function WorkflowTagsCell({ row }: { row: WorkflowLibraryRow }): JSX.Element {
    const { pendingRowActions, workflows, emailTemplates, value } = useValues(workflowsListV2Logic)
    const { updateWorkflowTags, setValue } = useActions(workflowsListV2Logic)
    const { tags } = useValues(tagsModel)
    const { loadTags } = useActions(tagsModel)
    const object =
        row.kind === 'email_template'
            ? (emailTemplates?.find((template) => template.id === row.id) ?? row.template)
            : (workflows?.find((workflow) => workflow.id === row.id) ?? row.workflow)
    const canEdit = userHasAccess(
        AccessControlResourceType.Workflow,
        AccessControlLevel.Editor,
        row.kind === 'workflow' ? toAccessControlLevel(row.workflow.user_access_level) : undefined
    )
    return (
        <ObjectTags
            tags={object.tags ?? []}
            tagType="default"
            saving={!!pendingRowActions[row.id]}
            {...(canEdit
                ? { onChange: (tags: string[]) => updateWorkflowTags(row, tags), tagsAvailable: tags }
                : { staticOnly: true as const })}
            onEdit={loadTags}
            inputPlaceholder="Add tags"
            onTagClick={(tag) =>
                setValue({
                    ...value,
                    filters: [
                        ...value.filters.filter(
                            (filter) => !(filter.facet === 'tag' && filter.value === tag && !filter.negated)
                        ),
                        { facet: 'tag', value: tag, negated: false },
                    ],
                })
            }
            wrap
            maxVisibleTags={2}
            data-attr="workflow-row-tags"
        />
    )
}
