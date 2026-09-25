// PROTOTYPE (throwaway): previews and applies "Turn name prefixes into folders".
import { useActions, useValues } from 'kea'

import { IconFolder, IconFolderPlus } from '@posthog/icons'
import { LemonButton, LemonCheckbox, LemonModal, LemonTag } from '@posthog/lemon-ui'

import { pluralize } from 'lib/utils/strings'

import { foldersVariantLogic } from './foldersVariantLogic'

const MAX_EXAMPLES = 3

export function PrefixToFoldersModal(): JSX.Element {
    const { prefixModalOpen, prefixPlan, prefixMoveCount, stripPrefixes, applyingPrefixPlan } =
        useValues(foldersVariantLogic)
    const { closePrefixModal, setStripPrefixes, applyPrefixPlan } = useActions(foldersVariantLogic)
    const newFolderCount = prefixPlan.filter((group) => group.isNew).length

    return (
        <LemonModal
            isOpen={prefixModalOpen}
            onClose={closePrefixModal}
            title="Turn name prefixes into folders"
            description={
                prefixMoveCount
                    ? `${pluralize(prefixMoveCount, 'item')} outside a folder have a name like "Billing:: dunning:: Final notice". Each one moves into a folder named after its prefix, under Workflows.`
                    : undefined
            }
            width={640}
            footer={
                <>
                    <LemonButton type="secondary" onClick={closePrefixModal}>
                        Cancel
                    </LemonButton>
                    <LemonButton
                        type="primary"
                        onClick={applyPrefixPlan}
                        loading={applyingPrefixPlan}
                        disabledReason={prefixMoveCount === 0 ? 'Nothing to move' : undefined}
                        data-attr="workflows-folders-apply-prefixes"
                    >
                        {prefixMoveCount ? `Move ${pluralize(prefixMoveCount, 'item')}` : 'Move'}
                    </LemonButton>
                </>
            }
        >
            {prefixMoveCount === 0 ? (
                <p className="text-secondary">Every item with a name prefix is already in a folder.</p>
            ) : (
                <div className="flex flex-col gap-3">
                    <div className="text-secondary">
                        {pluralize(prefixPlan.length, 'folder')}, {newFolderCount} of them new.
                    </div>
                    <div className="border rounded divide-y max-h-[50vh] overflow-y-auto">
                        {prefixPlan.map((group) => (
                            <div key={group.segments.join('/')} className="flex items-start gap-2 px-3 py-2">
                                {group.isNew ? (
                                    <IconFolderPlus className="text-lg text-success shrink-0 mt-0.5" />
                                ) : (
                                    <IconFolder className="text-lg text-secondary shrink-0 mt-0.5" />
                                )}
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-semibold">Workflows / {group.segments.join(' / ')}</span>
                                        {group.isNew && <LemonTag type="success">New</LemonTag>}
                                        <span className="text-secondary text-xs">
                                            {pluralize(group.moves.length, 'item')}
                                        </span>
                                    </div>
                                    <div className="text-xs text-secondary truncate">
                                        {group.moves
                                            .slice(0, MAX_EXAMPLES)
                                            .map((move) => (stripPrefixes ? move.newName : move.row.item.name))
                                            .join(', ')}
                                        {group.moves.length > MAX_EXAMPLES
                                            ? `, and ${group.moves.length - MAX_EXAMPLES} more`
                                            : ''}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <LemonCheckbox
                        checked={stripPrefixes}
                        onChange={setStripPrefixes}
                        label='Remove the prefix from workflow names, so "Billing:: dunning:: Final notice" becomes "Final notice"'
                    />
                </div>
            )}
        </LemonModal>
    )
}
