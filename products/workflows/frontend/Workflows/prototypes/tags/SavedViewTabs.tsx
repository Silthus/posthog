// PROTOTYPE (throwaway): saved views as quick tabs. A view is a name plus the pills, the free text and the grouping.
import { useActions, useValues } from 'kea'

import { IconPlus } from '@posthog/icons'
import { LemonButton, LemonDialog, LemonInput } from '@posthog/lemon-ui'

import { More } from 'lib/lemon-ui/LemonButton/More'
import { LemonField } from 'lib/lemon-ui/LemonField'
import { LemonTabs } from 'lib/lemon-ui/LemonTabs'

import { serializeFilters } from '../shared/workflowFacets'
import { workflowsPrototypeLogic } from '../shared/workflowsPrototypeLogic'
import { workflowsTagsVariantLogic } from './workflowsTagsVariantLogic'
import type { SavedView } from './workflowTagsStore'

const UNSAVED = '__unsaved__'

export function SavedViewTabs(): JSX.Element {
    const { views, activeViewId, viewCounts, groupBy, store } = useValues(workflowsTagsVariantLogic)
    const { applyView, saveView, deleteView } = useActions(workflowsTagsVariantLogic)
    const { filters, search, workflowItems, templateItems } = useValues(workflowsPrototypeLogic)
    const activeView = views.find((view) => view.id === activeViewId) ?? null

    const openSaveDialog = (existing: SavedView | null): void => {
        LemonDialog.openForm({
            title: existing ? 'Rename view' : 'Save view',
            description: existing
                ? undefined
                : 'Saves the current filters and grouping as a tab everyone in this project sees.',
            initialValues: { name: existing?.name ?? '' },
            content: (
                <LemonField name="name">
                    <LemonInput placeholder="For example: My active emails" autoFocus />
                </LemonField>
            ),
            errors: { name: (name) => (!name?.trim() ? 'Give the view a name' : undefined) },
            onSubmit: ({ name }) =>
                saveView(
                    existing
                        ? { ...existing, name: name.trim() }
                        : {
                              id: `view-${Date.now().toString(36)}`,
                              name: name.trim(),
                              q: serializeFilters(filters),
                              text: search,
                              group: groupBy.key,
                          }
                ),
        })
    }

    return (
        <LemonTabs
            size="small"
            activeKey={activeViewId ?? UNSAVED}
            onChange={(key) => (key === UNSAVED ? undefined : applyView(views.find((view) => view.id === key) ?? null))}
            data-attr="workflows-tags-saved-views"
            tabs={[
                {
                    key: 'all',
                    label: (
                        <span>
                            <span>All&nbsp;</span>
                            <span className="text-secondary" translate="no">
                                {workflowItems.length + templateItems.length}
                            </span>
                        </span>
                    ),
                },
                ...views.map((view) => ({
                    key: view.id,
                    label: (
                        <span>
                            <span>{view.name}&nbsp;</span>
                            <span className="text-secondary" translate="no">
                                {viewCounts[view.id] ?? ''}
                            </span>
                        </span>
                    ),
                })),
                activeViewId === null && store
                    ? { key: UNSAVED, label: <span className="italic text-secondary">Unsaved view</span> }
                    : null,
            ]}
            rightSlot={
                <div className="flex items-center gap-1">
                    <LemonButton
                        size="xsmall"
                        type="tertiary"
                        icon={<IconPlus />}
                        onClick={() => openSaveDialog(null)}
                        disabledReason={
                            !store
                                ? 'Saved views are still loading'
                                : activeViewId === 'all'
                                  ? 'Add a filter or a grouping first'
                                  : activeView
                                    ? 'This view is already saved'
                                    : undefined
                        }
                        data-attr="workflows-tags-save-view"
                    >
                        Save view
                    </LemonButton>
                    {activeView && (
                        <More
                            size="xsmall"
                            overlay={
                                <>
                                    <LemonButton fullWidth onClick={() => openSaveDialog(activeView)}>
                                        Rename view
                                    </LemonButton>
                                    <LemonButton
                                        fullWidth
                                        status="danger"
                                        onClick={() => {
                                            deleteView(activeView.id)
                                            applyView(null)
                                        }}
                                    >
                                        Delete view
                                    </LemonButton>
                                </>
                            }
                        />
                    )}
                </div>
            }
        />
    )
}
