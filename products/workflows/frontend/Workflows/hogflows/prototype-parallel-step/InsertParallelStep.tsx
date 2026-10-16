// PROTOTYPE (throwaway, never merged): ticket Silthus/posthog#495, branch prototype/parallel-step-editor.
import { useState } from 'react'
import type { Dispatch } from 'react'

import { IconPlus } from '@posthog/icons'
import { LemonButton, LemonMenu } from '@posthog/lemon-ui'

import { Action, MAX_PATHS, MIN_PATHS, STEP_KIND_LABEL, StepKind } from './parallelPrototypeModel'
import { ParallelIcon, STEP_ICON } from './ParallelPrototypeShared'

/** The "+" between trigger and the rest. Picking "Parallel step" asks for the number of paths. */
export function InsertParallelStep({ dispatch }: { dispatch: Dispatch<Action> }): JSX.Element {
    const [askingForCount, setAskingForCount] = useState(false)
    const kinds: StepKind[] = ['ai_task', 'delay', 'email', 'webhook', 'conditional_branch']
    if (askingForCount) {
        return (
            <div className="flex flex-col items-center gap-2 rounded border border-dashed border-primary bg-surface-primary p-3">
                <div className="flex items-center gap-1 font-semibold">
                    <ParallelIcon /> How many paths run at once?
                </div>
                <div className="flex gap-1">
                    {Array.from({ length: MAX_PATHS - MIN_PATHS + 1 }, (_, i) => i + MIN_PATHS).map((count) => (
                        <LemonButton
                            key={count}
                            type="secondary"
                            size="small"
                            onClick={() => {
                                setAskingForCount(false)
                                dispatch({ type: 'addParallel', pathCount: count })
                            }}
                        >
                            {count}
                        </LemonButton>
                    ))}
                </div>
                <span className="text-xs text-muted">You can add or remove paths later. 2 to 5.</span>
                <LemonButton size="xsmall" type="tertiary" onClick={() => setAskingForCount(false)}>
                    Cancel
                </LemonButton>
            </div>
        )
    }
    return (
        <LemonMenu
            items={[
                {
                    title: 'Run paths at once',
                    items: [
                        {
                            label: 'Parallel step',
                            icon: <ParallelIcon />,
                            onClick: () => setAskingForCount(true),
                            sideIcon: <span className="text-xs text-muted">2 to 5 paths + join</span>,
                        },
                    ],
                },
                {
                    title: 'Steps',
                    items: kinds.map((kind) => ({ label: STEP_KIND_LABEL[kind], icon: STEP_ICON[kind] })),
                },
            ]}
        >
            <LemonButton type="secondary" size="small" icon={<IconPlus />} data-attr="proto-insert-step">
                Add step
            </LemonButton>
        </LemonMenu>
    )
}
