// PROTOTYPE (throwaway): saved views as tabs above the search bar. Changing a filter, the folder or a display option
// keeps the tab and marks it modified with a dot. "Save view" then turns primary: save as a new view, or update your
// own view. "Reset" goes back to what the view saved. Tabs that don't fit move into a "More" menu.
import { useActions, useValues } from 'kea'

import { IconChevronDown } from '@posthog/icons'
import { LemonButton, LemonCheckbox, LemonDialog, LemonInput, LemonMenu } from '@posthog/lemon-ui'

import { More } from 'lib/lemon-ui/LemonButton/More'
import { LemonField } from 'lib/lemon-ui/LemonField'
import { LemonTabs } from 'lib/lemon-ui/LemonTabs'

import { CombinedView } from './combinedStore'
import { combinedVariantLogic } from './combinedVariantLogic'

const MORE = '__more__'

/** Keeps the first `max` tabs, and swaps the active one in when it would otherwise hide in the menu. */
function splitViews(views: CombinedView[], max: number, activeId: string): [CombinedView[], CombinedView[]] {
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
    const { views, activeViewId, viewCounts, isModified, activeViewChanges } = useValues(combinedVariantLogic)
    const { applyView } = useActions(combinedVariantLogic)
    const [visible, overflow] = splitViews(views, max, activeViewId)

    const label = (view: CombinedView): JSX.Element => (
        <span className="inline-flex items-center whitespace-nowrap">
            <span>{view.name}&nbsp;</span>
            <span className="text-secondary" translate="no">
                {viewCounts[view.id] ?? ''}
            </span>
            {view.id === activeViewId && isModified && (
                <span
                    className="ml-1.5 size-1.5 rounded-full bg-accent"
                    title={`Modified: ${activeViewChanges.join(', ')}`}
                    aria-label="Modified"
                    data-attr="workflows-combined-view-modified"
                />
            )}
        </span>
    )

    return (
        <LemonTabs
            size="small"
            activeKey={activeViewId}
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
            ]}
        />
    )
}

export function ViewActions(): JSX.Element {
    const { activeView, store, scope, isModified, canUpdateActiveView, activeViewChanges } =
        useValues(combinedVariantLogic)
    const { saveViewAs, updateActiveView, resetView, renameView, deleteView } = useActions(combinedVariantLogic)
    const scopeLabel = ['Workflows', ...scope].join(' / ')

    const openSaveDialog = (): void =>
        LemonDialog.openForm({
            title: 'Save as new view',
            description:
                'Saves the filters, search text, columns and display options as a tab everyone in this project sees.',
            initialValues: { name: '', pinScope: scope.length > 0 },
            content: (
                <div className="flex flex-col gap-2">
                    <LemonField name="name">
                        <LemonInput
                            placeholder="For example: Webinar emails"
                            autoFocus
                            data-attr="workflows-combined-view-name"
                        />
                    </LemonField>
                    {scope.length > 0 && (
                        <LemonField name="pinScope">
                            {({ value, onChange }) => (
                                <LemonCheckbox checked={!!value} onChange={onChange} label={`Only in ${scopeLabel}`} />
                            )}
                        </LemonField>
                    )}
                </div>
            ),
            errors: { name: (name: string) => (!name?.trim() ? 'Give the view a name' : undefined) },
            onSubmit: ({ name, pinScope }) => saveViewAs(name.trim(), !!pinScope),
        })

    const openRenameDialog = (): void =>
        LemonDialog.openForm({
            title: 'Rename view',
            initialValues: { name: activeView.name },
            content: (
                <LemonField name="name">
                    <LemonInput autoFocus />
                </LemonField>
            ),
            errors: { name: (name: string) => (!name?.trim() ? 'Give the view a name' : undefined) },
            onSubmit: ({ name }) => renameView(activeView.id, name.trim()),
        })

    return (
        <div className="flex items-center gap-1 pb-2 shrink-0">
            {isModified && (
                <LemonButton
                    size="small"
                    type="tertiary"
                    onClick={resetView}
                    tooltip={`Go back to what ${activeView.name} saved`}
                    data-attr="workflows-combined-reset-view"
                >
                    Reset
                </LemonButton>
            )}
            <LemonMenu
                items={[
                    {
                        label: 'Save as new view…',
                        onClick: openSaveDialog,
                        'data-attr': 'workflows-combined-save-as-new',
                    },
                    canUpdateActiveView
                        ? {
                              label: `Update ${activeView.name}`,
                              onClick: updateActiveView,
                              disabledReason: isModified ? undefined : 'Nothing changed yet',
                              'data-attr': 'workflows-combined-update-view',
                          }
                        : null,
                ]}
            >
                <LemonButton
                    size="small"
                    type={isModified ? 'primary' : 'tertiary'}
                    sideIcon={<IconChevronDown />}
                    disabledReason={!store ? 'Saved views are still loading' : undefined}
                    tooltip={isModified ? `Changed: ${activeViewChanges.join(', ')}` : undefined}
                    data-attr="workflows-combined-save-view"
                >
                    Save view
                </LemonButton>
            </LemonMenu>
            {canUpdateActiveView && (
                <More
                    size="small"
                    overlay={
                        <>
                            <LemonButton fullWidth onClick={openRenameDialog}>
                                Rename view
                            </LemonButton>
                            <LemonButton fullWidth status="danger" onClick={() => deleteView(activeView.id)}>
                                Delete view
                            </LemonButton>
                        </>
                    }
                />
            )}
        </div>
    )
}

export function ViewTabs(): JSX.Element {
    return (
        <div className="flex items-end gap-2">
            <div className="flex-1 min-w-0">
                <div className="@4xl:hidden">
                    <ViewTabsRow max={3} />
                </div>
                <div className="hidden @4xl:block @6xl:hidden">
                    <ViewTabsRow max={5} />
                </div>
                <div className="hidden @6xl:block">
                    <ViewTabsRow max={7} />
                </div>
            </div>
            <ViewActions />
        </div>
    )
}
