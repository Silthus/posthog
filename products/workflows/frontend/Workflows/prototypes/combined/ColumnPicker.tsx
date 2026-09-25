// PROTOTYPE (throwaway): pick the list's columns. The set belongs to the view, so changing it marks the view modified.
import { useActions, useValues } from 'kea'
import { useState } from 'react'

import { IconColumns } from '@posthog/icons'
import { LemonButton, LemonCheckbox, Popover } from '@posthog/lemon-ui'

import { COLUMN_LABELS, COLUMN_ORDER, DEFAULT_COLUMNS } from './combinedStore'
import { combinedVariantLogic } from './combinedVariantLogic'

export function ColumnPicker(): JSX.Element {
    const { columns } = useValues(combinedVariantLogic)
    const { toggleColumn, setColumns } = useActions(combinedVariantLogic)
    const [open, setOpen] = useState(false)
    const isDefault = columns.join(',') === DEFAULT_COLUMNS.join(',')

    return (
        <Popover
            visible={open}
            onClickOutside={() => setOpen(false)}
            placement="bottom-end"
            overlay={
                <div className="flex flex-col gap-1 p-2 w-52" data-attr="workflows-combined-column-picker">
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
                        className="mt-1"
                        onClick={() => setColumns(DEFAULT_COLUMNS)}
                        disabledReason={isDefault ? 'These are the default columns' : undefined}
                    >
                        Reset to default columns
                    </LemonButton>
                </div>
            }
        >
            <LemonButton
                size="small"
                type="tertiary"
                icon={<IconColumns />}
                onClick={() => setOpen(!open)}
                tooltip="Choose columns"
                data-attr="workflows-combined-columns"
            >
                <span className="hidden @4xl:inline">Columns</span>
            </LemonButton>
        </Popover>
    )
}
