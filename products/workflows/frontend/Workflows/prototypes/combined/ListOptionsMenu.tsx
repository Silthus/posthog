// PROTOTYPE (throwaway): the list's one options menu. It holds the columns, which belong to the view (so changing them
// marks the view modified), Manage tags, and a way back for shipped views someone deleted.
import { useActions, useValues } from 'kea'
import { useState } from 'react'

import { IconEllipsis, IconPalette, IconUndo } from '@posthog/icons'
import { LemonButton, LemonCheckbox, LemonDivider, Popover } from '@posthog/lemon-ui'

import { COLUMN_LABELS, COLUMN_ORDER, DEFAULT_COLUMNS, SHIPPED_VIEWS } from './combinedStore'
import { combinedVariantLogic } from './combinedVariantLogic'

export function ListOptionsMenu(): JSX.Element {
    const { columns, store } = useValues(combinedVariantLogic)
    const { toggleColumn, setColumns, setManageTagsOpen, restoreShippedViews } = useActions(combinedVariantLogic)
    const removed = SHIPPED_VIEWS.filter((view) => store?.removedShippedViews.includes(view.id))
    const [open, setOpen] = useState(false)
    const isDefault = columns.join(',') === DEFAULT_COLUMNS.join(',')

    return (
        <Popover
            visible={open}
            onClickOutside={() => setOpen(false)}
            placement="bottom-end"
            overlay={
                <div className="flex flex-col gap-1 p-2 w-56" data-attr="workflows-combined-list-options">
                    <span className="text-xs font-semibold text-secondary">Columns in this view</span>
                    <LemonCheckbox checked disabledReason="The name always shows" label="Name" />
                    {COLUMN_ORDER.map((key) => (
                        <LemonCheckbox
                            key={key}
                            checked={columns.includes(key)}
                            onChange={(checked) => toggleColumn(key, checked)}
                            label={COLUMN_LABELS[key]}
                            data-attr="workflows-combined-column-option"
                        />
                    ))}
                    <LemonButton
                        size="xsmall"
                        type="tertiary"
                        onClick={() => setColumns(DEFAULT_COLUMNS)}
                        disabledReason={isDefault ? 'These are the default columns' : undefined}
                    >
                        Reset to default columns
                    </LemonButton>
                    <LemonDivider className="my-1" />
                    <LemonButton
                        size="small"
                        fullWidth
                        icon={<IconPalette />}
                        onClick={() => {
                            setOpen(false)
                            setManageTagsOpen(true)
                        }}
                        data-attr="workflows-combined-manage-tags-open"
                    >
                        Manage tags
                    </LemonButton>
                    {removed.length > 0 && (
                        <LemonButton
                            size="small"
                            fullWidth
                            icon={<IconUndo />}
                            onClick={() => {
                                setOpen(false)
                                restoreShippedViews()
                            }}
                            tooltip="Brings the view back for everyone in this project"
                            data-attr="workflows-combined-restore-shipped-views"
                        >
                            Restore {removed.map((view) => view.name).join(', ')}
                        </LemonButton>
                    )}
                </div>
            }
        >
            <LemonButton
                size="small"
                type="tertiary"
                icon={<IconEllipsis />}
                onClick={() => setOpen(!open)}
                tooltip="Columns, tags and views"
                aria-label="List options"
                data-attr="workflows-combined-list-options-open"
            />
        </Popover>
    )
}
