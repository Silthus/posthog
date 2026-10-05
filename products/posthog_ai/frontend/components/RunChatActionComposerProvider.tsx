import { useActions, useValues } from 'kea'
import { type ReactNode, useMemo } from 'react'

import { type RunInteractionLogicProps, runInteractionLogic } from '../logics/runInteractionLogic'
import { type ChatActionComposer, ChatActionComposerProvider } from './ChatActionComposerContext'

/**
 * Wires the suggested-action buttons to the runner's composer. Kept as its own component so the draft
 * subscription re-renders this provider only: React skips the memoized `children` element, and only the
 * button rows that consume the context update per keystroke.
 */
export function RunChatActionComposerProvider({
    logicProps,
    children,
}: {
    logicProps: RunInteractionLogicProps
    children: ReactNode
}): JSX.Element {
    const logic = runInteractionLogic(logicProps)
    const { composerForm, cancellationState, stagedAttachments, isSubmitting } = useValues(logic)
    const { setComposerFormValues, setComposerFocused, submitComposerForm } = useActions(logic)
    const draft: string = composerForm.draft
    const composerOccupied = draft.trim().length > 0 || stagedAttachments.length > 0
    const value = useMemo<ChatActionComposer>(
        () => ({
            insert: (message) => {
                const current = currentDraft(logic, logicProps)
                setComposerFormValues({ draft: current.trim() ? `${current.trimEnd()}\n${message}` : message })
                setComposerFocused(true)
            },
            send: (message) => {
                setComposerFormValues({ draft: message })
                submitComposerForm()
            },
            sendDisabledReason: sendBlockedReason({ cancelling: !!cancellationState, isSubmitting, composerOccupied }),
        }),
        [
            logic,
            logicProps,
            composerOccupied,
            cancellationState,
            isSubmitting,
            setComposerFormValues,
            setComposerFocused,
            submitComposerForm,
        ]
    )
    return <ChatActionComposerProvider value={value}>{children}</ChatActionComposerProvider>
}

/** Read at click time, after the composer pushes its debounced keystrokes, so none of them is lost. */
function currentDraft(logic: ReturnType<typeof runInteractionLogic>, logicProps: RunInteractionLogicProps): string {
    logicProps.flushDraft?.()
    return logic.values.composerForm.draft
}

function sendBlockedReason({
    cancelling,
    isSubmitting,
    composerOccupied,
}: {
    cancelling: boolean
    isSubmitting: boolean
    composerOccupied: boolean
}): string | null {
    if (cancelling) {
        return 'Wait for the run to stop'
    }
    if (isSubmitting) {
        return 'Wait for your message to send'
    }
    if (composerOccupied) {
        return 'Send or clear your draft first'
    }
    return null
}
