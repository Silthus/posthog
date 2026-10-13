import { useActions, useValues } from 'kea'

import { LemonButton } from '@posthog/lemon-ui'

import { tileCanvasLogic } from './tileCanvasLogic'

export function TileCanvasLayoutError({ message }: { message: string }): JSX.Element {
    const { canShowListView } = useValues(tileCanvasLogic)
    const { setEditorLayout, retryLayout } = useActions(tileCanvasLogic)
    return (
        <div
            className="absolute inset-0 z-10 flex items-center justify-center p-6"
            data-attr="workflow-tile-layout-error"
        >
            <div className="flex max-w-120 flex-col gap-3 rounded-lg border bg-surface-primary p-5 shadow">
                <h3 className="m-0 text-base font-semibold">The canvas couldn't draw this workflow</h3>
                <p className="m-0 text-sm text-secondary">
                    Laying out its steps failed. Your workflow is saved and nothing in it changed.
                </p>
                <code className="block break-words rounded bg-surface-secondary px-2 py-1 text-xs">{message}</code>
                <div className="flex justify-end gap-2">
                    {canShowListView ? (
                        <LemonButton type="primary" onClick={() => setEditorLayout('simple')}>
                            Show it as a list
                        </LemonButton>
                    ) : (
                        <LemonButton type="primary" onClick={retryLayout}>
                            Try again
                        </LemonButton>
                    )}
                </div>
            </div>
        </div>
    )
}
