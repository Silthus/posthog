// PROTOTYPE (ticket #78). Throwaway.
import type { Meta, StoryFn } from '@storybook/react'

import { LemonButton, lemonToast } from '@posthog/lemon-ui'

import type { HogFlow } from '../hogflows/types'
import { PrototypeWorkflowHeader } from './PrototypeWorkflowHeader'

const meta: Meta = {
    title: 'Products/Workflows/Prototype/Scene',
    parameters: { layout: 'fullscreen', mockDate: '2026-09-21 12:00:00' },
}
export default meta

function workflow(overrides: Partial<HogFlow> = {}): HogFlow {
    return {
        id: 'wf-1',
        name: 'Welcome sequence',
        description: 'Emails a new account for the first two weeks.',
        team_id: 1,
        version: 12,
        status: 'active',
        exit_condition: 'exit_only_at_end',
        actions: [],
        edges: [],
        trigger: { type: 'event', filters: {} } as HogFlow['trigger'],
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-21T10:00:00Z',
        managed_by: 'code',
        source_repository: 'github.com/acme/flows',
        source_path: 'workflows/welcome.ts',
        source_ref: '4f1c2ab9e3d5a7c1b2f8e0d4a6c9b3e1f7d2a5c8',
        ...overrides,
    } as HogFlow
}

const Narrow = ({ children }: { children: JSX.Element }): JSX.Element => (
    <div className="w-[520px] max-w-full border-r">{children}</div>
)

/** Q3 and Q4: the source row under the title, and the control inventory. */
export const Header: StoryFn = () => <PrototypeWorkflowHeader workflow={workflow()} />
export const HeaderNarrow: StoryFn = () => (
    <Narrow>
        <PrototypeWorkflowHeader workflow={workflow()} />
    </Narrow>
)

/** Q5 alternative: the release control in the source row rather than the scene panel. */
export const ReleaseControlInSourceRow: StoryFn = () => (
    <PrototypeWorkflowHeader workflow={workflow()} releaseControlPlacement="source-row" />
)

/** Q13: a host the link composer does not know falls back to copyable plain text. */
export const UnknownHost: StoryFn = () => (
    <PrototypeWorkflowHeader
        workflow={workflow({ source_repository: 'git.acme-internal.example.com/platform/flows', source_ref: 'main' })}
    />
)
export const UnknownHostNarrow: StoryFn = () => (
    <Narrow>
        <PrototypeWorkflowHeader
            workflow={workflow({
                source_repository: 'git.acme-internal.example.com/platform/flows',
                source_ref: 'main',
            })}
        />
    </Narrow>
)

/** Q12: claimed by code, but no push has written the pointer yet. */
export const MissingPointer: StoryFn = () => (
    <PrototypeWorkflowHeader
        workflow={workflow({ source_repository: null, source_path: null, source_ref: null } as Partial<HogFlow>)}
    />
)

/** Q14: released back to the UI. Everything unlocks, the source row demotes to history. */
export const ReleasedToTheUi: StoryFn = () => <PrototypeWorkflowHeader workflow={workflow({ managed_by: 'gui' })} />
export const ReleasedToTheUiNarrow: StoryFn = () => (
    <Narrow>
        <PrototypeWorkflowHeader workflow={workflow({ managed_by: 'gui' })} />
    </Narrow>
)

/**
 * Q9: nothing is refused in the UI, because the affordances are gone. This is the race path, when a
 * push lands while the scene is open and the server refuses a write that was already in flight. The
 * strings are the server's own `detail` and `extra.fix`, not invented here.
 */
export const RefusalToast: StoryFn = () => (
    <div className="p-4">
        <LemonButton
            type="secondary"
            onClick={() =>
                lemonToast.error(
                    <div className="flex flex-col gap-1">
                        <span>
                            This workflow is managed by code, in workflows/welcome.ts in github.com/acme/flows. Change
                            it there and push, or release it first.
                        </span>
                        <span className="text-xs">
                            Edit the workflow in its file and push it. To hand it back to the UI, send a PATCH whose
                            only field is managed_by: gui - the next push claims it again.
                        </span>
                    </div>
                )
            }
        >
            Show the refusal toast
        </LemonButton>
    </div>
)
