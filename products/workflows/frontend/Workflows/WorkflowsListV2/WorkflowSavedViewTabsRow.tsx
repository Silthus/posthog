import { IconChevronDown } from '@posthog/icons'
import { LemonMenu } from '@posthog/lemon-ui'

import { LemonTabs } from 'lib/lemon-ui/LemonTabs'

import { WorkflowSavedView } from './workflowSavedViews'

export interface WorkflowSavedViewTabsRowProps {
    views: WorkflowSavedView[]
    activeViewId: string
    viewCounts: Record<string, number>
    isModified: boolean
    activeViewChanges: string[]
    onApplyView: (view: WorkflowSavedView) => void
    max: number
}

export function WorkflowSavedViewTabsRow({
    views,
    activeViewId,
    viewCounts,
    isModified,
    activeViewChanges,
    onApplyView,
    max,
}: WorkflowSavedViewTabsRowProps): JSX.Element {
    const visible = views.slice(0, max)
    const active = views.find((view) => view.id === activeViewId)
    if (views.length > max && active && !visible.includes(active)) {
        visible[visible.length - 1] = active
    }
    const overflow = views.filter((view) => !visible.includes(view))
    const label = (view: WorkflowSavedView): JSX.Element => (
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
                if (view) {
                    onApplyView(view)
                }
            }}
            data-attr="workflows-combined-views"
            tabs={[
                ...visible.map((view) => ({ key: view.id, label: label(view) })),
                overflow.length
                    ? {
                          key: '__more__',
                          label: (
                              <LemonMenu
                                  items={overflow.map((view) => ({
                                      label: label(view),
                                      onClick: () => onApplyView(view),
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
