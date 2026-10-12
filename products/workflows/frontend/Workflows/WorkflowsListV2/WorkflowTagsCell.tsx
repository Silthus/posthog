import clsx from 'clsx'
import { useActions, useValues } from 'kea'
import { useState } from 'react'

import { IconPencil } from '@posthog/icons'
import { LemonButton, LemonInputSelect } from '@posthog/lemon-ui'

import { ObjectTags } from 'lib/components/ObjectTags/ObjectTags'
import { OrganizationMembershipLevel } from 'lib/constants'
import { toAccessControlLevel, userHasAccess } from 'lib/utils/accessControlUtils'
import { organizationLogic } from 'scenes/organizationLogic'

import { tagsModel } from '~/models/tagsModel'
import { AccessControlLevel, AccessControlResourceType } from '~/types'

import { WorkflowLibraryRow } from './workflowListRows'
import { workflowsListV2Logic } from './workflowsListV2Logic'

export function WorkflowTagsCell({ row }: { row: WorkflowLibraryRow }): JSX.Element {
    const [editing, setEditing] = useState(false)
    const { pendingRowActions, workflows, emailTemplates, value } = useValues(workflowsListV2Logic)
    const { updateWorkflowTags, setValue, openTagRename } = useActions(workflowsListV2Logic)
    const { currentOrganization } = useValues(organizationLogic)
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
    const saving = !!pendingRowActions[row.id]
    return (
        <div
            className="flex items-center gap-1 h-8 w-40 @min-[48rem]/main-content:w-64 min-w-0"
            data-attr="workflow-row-tags"
        >
            {editing ? (
                <LemonInputSelect
                    mode="multiple"
                    displayMode="count"
                    size="small"
                    fullWidth
                    autoFocus
                    allowCustomValues
                    disableEditing={(currentOrganization?.membership_level ?? 0) < OrganizationMembershipLevel.Admin}
                    onEditValue={(tag) => {
                        setEditing(false)
                        openTagRename(tag)
                    }}
                    value={object.tags ?? []}
                    options={tags.map((tag) => ({ key: tag, label: tag }))}
                    onChange={(tags) => {
                        if (!saving) {
                            updateWorkflowTags(row, tags)
                        }
                    }}
                    onBlur={() => setEditing(false)}
                    loading={saving}
                    data-attr="new-tag-input"
                    placeholder="Add tags"
                    popoverClassName="click-outside-block"
                />
            ) : (
                <>
                    <ObjectTags
                        tags={object.tags ?? []}
                        tagType="default"
                        staticOnly
                        truncateTags
                        maxVisibleTags={2}
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
                    />
                    {canEdit && (
                        <LemonButton
                            icon={<IconPencil />}
                            size="xsmall"
                            type="tertiary"
                            aria-label={(object.tags ?? []).length ? 'Edit tags' : 'Add tag'}
                            data-attr="button-add-tag"
                            className={clsx(
                                'shrink-0 group-hover:opacity-100 focus-visible:opacity-100',
                                !saving && 'opacity-0'
                            )}
                            loading={saving}
                            onClick={() => {
                                loadTags()
                                setEditing(true)
                            }}
                        />
                    )}
                </>
            )}
        </div>
    )
}
