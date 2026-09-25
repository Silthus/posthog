// PROTOTYPE (throwaway): saved views as tabs above the search bar. Changing a filter, the search, the folder or the
// columns keeps the tab and marks it modified with a dot. Then, as in Notion, "Reset" discards the changes and "Save for
// everyone" writes them into the view. "Save as new view" keeps the view and makes a new tab. Built-in views can't
// change, so they only offer Reset and "Save as new view". Tabs that don't fit move into a "More" menu.
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
    const scopeLabel = scope.join(' / ')
    const loadingReason = !store ? 'Saved views are still loading' : undefined

    const openSaveDialog = (): void =>
        LemonDialog.openForm({
            title: 'Save as new view',
            description: 'The filters, search and columns become a new tab that everyone in this project sees.',
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

    const changed = activeViewChanges.join(', ')

    return (
        <div className="flex items-center gap-1 pb-2 shrink-0" data-attr="workflows-combined-view-actions">
            {isModified && (
                <>
                    <LemonButton
                        size="small"
                        type="tertiary"
                        onClick={resetView}
                        tooltip={`Discard your changes and go back to ${activeView.name}`}
                        data-attr="workflows-combined-reset-view"
                    >
                        Reset
                    </LemonButton>
                    <LemonButton
                        size="small"
                        type={canUpdateActiveView ? 'secondary' : 'primary'}
                        onClick={openSaveDialog}
                        disabledReason={loadingReason}
                        tooltip={
                            canUpdateActiveView
                                ? `Keep ${activeView.name} as it was and save your changes as a new tab`
                                : `${activeView.name} is built in and can't change. Save your changes (${changed}) as a new tab.`
                        }
                        data-attr="workflows-combined-save-as-new"
                    >
                        Save as new view
                    </LemonButton>
                    {canUpdateActiveView && (
                        <LemonButton
                            size="small"
                            type="primary"
                            onClick={updateActiveView}
                            disabledReason={loadingReason}
                            tooltip={`Update ${activeView.name} for everyone in this project. Changed: ${changed}.`}
                            data-attr="workflows-combined-save-for-everyone"
                        >
                            Save for everyone
                        </LemonButton>
                    )}
                </>
            )}
            {canUpdateActiveView && (
                <More
                    size="small"
                    data-attr="workflows-combined-view-more"
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
    const { isModified, canUpdateActiveView } = useValues(combinedVariantLogic)
    const saveRoom = isModified ? (canUpdateActiveView ? 2 : 1) : 0
    return (
        <div className="flex items-end gap-2">
            <div className="flex-1 min-w-0">
                <div className="@4xl:hidden">
                    <ViewTabsRow max={3} />
                </div>
                <div className="hidden @4xl:block @6xl:hidden">
                    <ViewTabsRow max={5 - Math.min(saveRoom, 1)} />
                </div>
                <div className="hidden @6xl:block">
                    <ViewTabsRow max={7 - saveRoom} />
                </div>
            </div>
            <ViewActions />
        </div>
    )
}
