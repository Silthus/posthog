// PROTOTYPE (graph-first lane, Silthus/personal#35). Throwaway code, never merged.
import { BindLogic, useValues } from 'kea'

import { IconSparkles } from '@posthog/icons'
import { LemonButton, LemonTag, SpinnerOverlay } from '@posthog/lemon-ui'

import { workflowLogic } from '../../../workflowLogic'
import { SceneActionsSlot } from './CanvasCommands'
import { PrototypeGraphFirstEditor } from './PrototypeGraphFirstEditor'

type EditorProps = React.ComponentProps<typeof PrototypeGraphFirstEditor>

const SCENE_TABS = ['Workflow', 'Invocations', 'Metrics', 'Assets', 'History']

function SceneChromeMock(): JSX.Element {
    const { originalWorkflow } = useValues(workflowLogic)
    return (
        <div className="shrink-0 border-b bg-surface-primary px-4 pt-3">
            <div className="flex items-center gap-2">
                <div className="flex min-w-0 flex-col">
                    <div className="flex items-center gap-2">
                        <h1 className="m-0 text-lg font-semibold">{originalWorkflow?.name}</h1>
                        <LemonTag type="muted">Draft</LemonTag>
                    </div>
                    {originalWorkflow?.description && (
                        <div className="flex items-center gap-1 text-[13px] text-secondary">
                            <IconSparkles className="shrink-0 text-[#7c3aed]" />
                            {originalWorkflow.description}
                        </div>
                    )}
                </div>
                <div className="flex-1" />
                <SceneActionsSlot />
                <LemonButton size="small" type="secondary">
                    Save draft
                </LemonButton>
                <LemonButton size="small" type="primary">
                    Publish
                </LemonButton>
            </div>
            <div className="mt-2 flex gap-4 text-sm">
                {SCENE_TABS.map((tab, index) => (
                    <span
                        key={tab}
                        className={
                            index === 0
                                ? 'border-b-2 border-[var(--color-accent)] pb-1.5 font-semibold'
                                : 'pb-1.5 text-secondary'
                        }
                    >
                        {tab}
                    </span>
                ))}
            </div>
        </div>
    )
}

function AiPanelMock({ ask, answer }: { ask: string; answer: string }): JSX.Element {
    return (
        <aside className="flex w-[420px] shrink-0 flex-col border-l bg-surface-primary">
            <div className="flex items-center gap-2 border-b px-4 py-3 font-semibold">
                <IconSparkles /> PostHog AI
            </div>
            <div className="flex flex-1 flex-col gap-3 overflow-hidden p-4 text-sm">
                <div className="self-end rounded-lg bg-surface-secondary px-3 py-2">{ask}</div>
                <div className="rounded-lg border px-3 py-2 leading-relaxed">{answer}</div>
                <div className="mt-auto rounded-lg border px-3 py-2 text-secondary">Ask a follow-up…</div>
            </div>
        </aside>
    )
}

const DEFAULT_CHAT = {
    ask: 'Build a launch flow for the Larkspur boot that tests three emails.',
    answer: 'I built a workflow with three email variants. Each person gets one launch email in a weekday morning window, then a follow-up if they have not bought within five days.',
}

export function Frame({
    id,
    aiPanel,
    chat = DEFAULT_CHAT,
    editor,
}: {
    id: string
    aiPanel?: boolean
    chat?: { ask: string; answer: string }
    editor?: EditorProps
}): JSX.Element {
    return (
        <BindLogic logic={workflowLogic} props={{ id }}>
            <div className="flex h-screen">
                <div className="flex min-w-0 flex-1 flex-col">
                    <SceneChromeMock />
                    <Inner editor={editor} />
                </div>
                {aiPanel && <AiPanelMock {...chat} />}
            </div>
        </BindLogic>
    )
}

function Inner({ editor }: { editor?: EditorProps }): JSX.Element {
    const { originalWorkflow } = useValues(workflowLogic)
    return (
        <div className="flex min-h-0 flex-1 flex-col">
            {originalWorkflow ? (
                <PrototypeGraphFirstEditor key={originalWorkflow.id} {...editor} />
            ) : (
                <SpinnerOverlay />
            )}
        </div>
    )
}
