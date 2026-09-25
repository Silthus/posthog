// PROTOTYPE (throwaway): saved views as tabs above the search bar. A view is the pills, the free text, an optional
// folder and the flat and compact toggles. Tabs that don't fit the width move into a "More" menu.
import { useActions, useValues } from 'kea'

import { IconChevronDown, IconPlus } from '@posthog/icons'
import { LemonButton, LemonCheckbox, LemonDialog, LemonInput, LemonMenu } from '@posthog/lemon-ui'

import { More } from 'lib/lemon-ui/LemonButton/More'
import { LemonField } from 'lib/lemon-ui/LemonField'
import { LemonTabs } from 'lib/lemon-ui/LemonTabs'

import { serializeFilters } from '../shared/workflowFacets'
import { workflowsPrototypeLogic } from '../shared/workflowsPrototypeLogic'
import { CombinedView } from './combinedStore'
import {
    combinedVariantLogic,
    currentSegments,
    isTemplatesLocation,
    locationToViewFolder,
} from './combinedVariantLogic'

const UNSAVED = '__unsaved__'
const MORE = '__more__'

/** Keeps the first `max` tabs, and swaps the active one in when it would otherwise hide in the menu. */
function splitViews(views: CombinedView[], max: number, activeId: string | null): [CombinedView[], CombinedView[]] {
    if (views.length <= max) {
        return [views, []]
    }
    const visible = views.slice(0, max)
    const active = views.find((view) => view.id === activeId)
    if (active && !visible.includes(active)) {
        visible[visible.length - 1] = active
    }
    return [visible, views.filter((view) => !visible.includes(view))]
}

function ViewTabsRow({ max }: { max: number }): JSX.Element {
    const { views, activeViewId, viewCounts, store } = useValues(combinedVariantLogic)
    const { applyView } = useActions(combinedVariantLogic)
    const [visible, overflow] = splitViews(views, max, activeViewId)

    const label = (view: CombinedView): JSX.Element => (
        <span className="whitespace-nowrap">
            <span>{view.name}&nbsp;</span>
            <span className="text-secondary" translate="no">
                {viewCounts[view.id] ?? ''}
            </span>
        </span>
    )

    return (
        <LemonTabs
            size="small"
            activeKey={activeViewId ?? UNSAVED}
            onChange={(key) => {
                const view = views.find((candidate) => candidate.id === key)
                view && applyView(view)
            }}
            data-attr="workflows-combined-views"
            tabs={[
                ...visible.map((view) => ({ key: view.id, label: label(view) })),
                overflow.length
                    ? {
                          key: MORE,
                          label: (
                              <LemonMenu
                                  items={overflow.map((view) => ({
                                      label: label(view),
                                      onClick: () => applyView(view),
                                  }))}
                              >
                                  <span
                                      className="inline-flex items-center gap-0.5"
                                      data-attr="workflows-combined-views-more"
                                  >
                                      More ({overflow.length}) <IconChevronDown />
                                  </span>
                              </LemonMenu>
                          ),
                      }
                    : null,
                activeViewId === null && store
                    ? { key: UNSAVED, label: <span className="italic text-secondary">Unsaved view</span> }
                    : null,
            ]}
        />
    )
}

export function CombinedViewTabs(): JSX.Element {
    const { views, activeViewId, store, location, flat, compact, creatingWorkflow } = useValues(combinedVariantLogic)
    const { saveView, deleteView, applyView, createWorkflowHere } = useActions(combinedVariantLogic)
    const { filters, search } = useValues(workflowsPrototypeLogic)
    const activeView = views.find((view) => view.id === activeViewId) ?? null
    const folderLabel = isTemplatesLocation(location)
        ? 'Workflow templates'
        : ['Workflows', ...currentSegments(location)].join(' / ')
    const atRoot = !isTemplatesLocation(location) && currentSegments(location).length === 0

    const openSaveDialog = (existing: CombinedView | null): void => {
        LemonDialog.openForm({
            title: existing ? 'Rename view' : 'Save view',
            description: existing
                ? undefined
                : 'Saves the current filters, search text and display options as a tab everyone in this project sees.',
            initialValues: { name: existing?.name ?? '', pinFolder: !atRoot },
            content: (
                <div className="flex flex-col gap-2">
                    <LemonField name="name">
                        <LemonInput placeholder="For example: Webinar emails" autoFocus />
                    </LemonField>
                    {!existing && (
                        <LemonField name="pinFolder">
                            {({ value, onChange }) => (
                                <LemonCheckbox
                                    checked={!!value}
                                    onChange={onChange}
                                    label={`Always open in ${folderLabel}`}
                                />
                            )}
                        </LemonField>
                    )}
                </div>
            ),
            errors: { name: (name: string) => (!name?.trim() ? 'Give the view a name' : undefined) },
            onSubmit: ({ name, pinFolder }) =>
                saveView(
                    existing
                        ? { ...existing, name: name.trim() }
                        : {
                              id: `view-${Date.now().toString(36)}`,
                              name: name.trim(),
                              q: serializeFilters(filters),
                              text: search.trim(),
                              folder: pinFolder ? locationToViewFolder(location) : null,
                              flat,
                              compact,
                          }
                ),
        })
    }

    return (
        <div className="flex items-end gap-2">
            <div className="flex-1 min-w-0">
                <div className="@4xl:hidden">
                    <ViewTabsRow max={2} />
                </div>
                <div className="hidden @4xl:block @6xl:hidden">
                    <ViewTabsRow max={5} />
                </div>
                <div className="hidden @6xl:block">
                    <ViewTabsRow max={6} />
                </div>
            </div>
            <div className="flex items-center gap-1 pb-2 shrink-0">
                <LemonButton
                    size="small"
                    type="tertiary"
                    icon={<IconPlus />}
                    onClick={() => openSaveDialog(null)}
                    disabledReason={
                        !store
                            ? 'Saved views are still loading'
                            : activeView
                              ? `This is already the ${activeView.name} view`
                              : undefined
                    }
                    data-attr="workflows-combined-save-view"
                >
                    Save view
                </LemonButton>
                {activeView && !activeView.builtIn && (
                    <More
                        size="small"
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
                                        applyView(views[0])
                                    }}
                                >
                                    Delete view
                                </LemonButton>
                            </>
                        }
                    />
                )}
                <LemonButton
                    size="small"
                    type="primary"
                    onClick={createWorkflowHere}
                    loading={creatingWorkflow}
                    tooltip={`Creates a draft workflow in ${atRoot || isTemplatesLocation(location) ? 'Workflows' : folderLabel}`}
                    data-attr="workflows-combined-new-workflow"
                >
                    New workflow
                </LemonButton>
            </div>
        </div>
    )
}
