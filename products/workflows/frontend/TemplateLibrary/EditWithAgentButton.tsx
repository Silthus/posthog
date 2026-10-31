import { useActions, useValues } from 'kea'
import { RefObject, useEffect, useRef } from 'react'

import { IconCopy } from '@posthog/icons'
import { LemonBanner, LemonButton, LemonCollapse, LemonLabel, LemonTextArea, Popover } from '@posthog/lemon-ui'

import { LemonMenuOverlay } from 'lib/lemon-ui/LemonMenu/LemonMenu'

import { MessageTemplateLogicProps, messageTemplateLogic } from './messageTemplateLogic'

export function EditWithAgentButton(props: MessageTemplateLogicProps): JSX.Element {
    const logic = messageTemplateLogic(props)
    const { agentPromptOpen, templateLoading } = useValues(logic)
    const { setAgentPromptOpen, copyHtmlFile } = useActions(logic)
    const loadingReason = templateLoading ? 'Wait for the template to load' : undefined
    const promptRef = useRef<HTMLDivElement>(null)
    const triggerRef = useFocusBackOnClose(agentPromptOpen, promptRef)

    return (
        <Popover
            visible={agentPromptOpen}
            onClickOutside={(event) => {
                if (!isPressOnTrigger(event, triggerRef)) {
                    setAgentPromptOpen(false)
                }
            }}
            placement="bottom-end"
            fallbackPlacements={['bottom-start', 'top-end']}
            overlay={<AgentPrompt {...props} containerRef={promptRef} />}
        >
            <LemonButton
                ref={triggerRef}
                aria-haspopup="dialog"
                aria-expanded={agentPromptOpen}
                data-attr="message-template-edit-with-agent"
                type="primary"
                size="small"
                onClick={() => setAgentPromptOpen(!agentPromptOpen)}
                disabledReason={loadingReason}
                sideAction={{
                    'data-attr': 'message-template-copy-options',
                    'aria-label': 'More ways to copy this template',
                    disabledReason: loadingReason,
                    dropdown: {
                        placement: 'bottom-end',
                        overlay: (
                            <LemonMenuOverlay
                                items={[
                                    {
                                        label: 'Copy HTML file',
                                        icon: <IconCopy />,
                                        onClick: copyHtmlFile,
                                        'data-attr': 'message-template-copy-html-file',
                                    },
                                ]}
                            />
                        ),
                    },
                }}
            >
                Edit with your agent
            </LemonButton>
        </Popover>
    )
}

function isPressOnTrigger(event: Event, triggerRef: RefObject<HTMLButtonElement>): boolean {
    return !(event instanceof KeyboardEvent) && !!triggerRef.current?.contains(event.target as Node)
}

function useFocusBackOnClose(open: boolean, promptRef: RefObject<HTMLElement>): RefObject<HTMLButtonElement> {
    const triggerRef = useRef<HTMLButtonElement>(null)
    const wasOpen = useRef(open)
    useEffect(() => {
        const focused = document.activeElement
        if (wasOpen.current && !open && (focused === document.body || promptRef.current?.contains(focused))) {
            triggerRef.current?.focus()
        }
        wasOpen.current = open
    }, [open, promptRef])
    return triggerRef
}

interface AgentPromptProps extends MessageTemplateLogicProps {
    containerRef: RefObject<HTMLDivElement>
}

function AgentPrompt({ containerRef, ...props }: AgentPromptProps): JSX.Element {
    const logic = messageTemplateLogic(props)
    const {
        changeSentence,
        agentPrompt,
        copyAgentPromptDisabledReason,
        postHogCodeAvailable,
        runWithPostHogCodeDisabledReason,
        isRequestingChangeRun,
        changeRunError,
    } = useValues(logic)
    const { setChangeSentence, copyAgentPrompt, runWithPostHogCode } = useActions(logic)
    const sentenceRef = useRef<HTMLTextAreaElement>(null)

    useEffect(() => {
        const sentence = sentenceRef.current
        if (sentence) {
            sentence.focus()
            sentence.setSelectionRange(sentence.value.length, sentence.value.length)
        }
    }, [])

    return (
        <div
            ref={containerRef}
            role="dialog"
            aria-label="Edit with your agent"
            className="flex flex-col gap-2 p-1 w-96 max-w-full"
        >
            <LemonLabel htmlFor="message-template-change-sentence">Describe the change</LemonLabel>
            <LemonTextArea
                id="message-template-change-sentence"
                ref={sentenceRef}
                value={changeSentence}
                onChange={setChangeSentence}
                onPressCmdEnter={copyAgentPrompt}
                minRows={3}
                data-attr="message-template-change-sentence"
            />
            {changeRunError && (
                <LemonBanner type="error" className="shrink-0">
                    <p className="m-0 break-words">{changeRunError.detail}</p>
                    {changeRunError.fix && <p className="m-0 mt-1 break-words">{changeRunError.fix}</p>}
                </LemonBanner>
            )}
            <div className="flex flex-wrap justify-end gap-2">
                {postHogCodeAvailable && (
                    <LemonButton
                        data-attr="message-template-run-with-posthog-code"
                        type="secondary"
                        size="small"
                        onClick={runWithPostHogCode}
                        loading={isRequestingChangeRun}
                        disabledReason={runWithPostHogCodeDisabledReason}
                    >
                        Run with PostHog Code
                    </LemonButton>
                )}
                <LemonButton
                    data-attr="message-template-copy-agent-prompt"
                    type="primary"
                    size="small"
                    onClick={copyAgentPrompt}
                    disabledReason={copyAgentPromptDisabledReason}
                >
                    Copy prompt
                </LemonButton>
            </div>
            <LemonCollapse
                size="small"
                panels={[
                    {
                        key: 'prompt',
                        header: 'Show full prompt',
                        content: (
                            <div
                                className="whitespace-pre-wrap break-words font-mono text-xs"
                                data-attr="message-template-agent-prompt"
                            >
                                {agentPrompt}
                            </div>
                        ),
                    },
                ]}
            />
        </div>
    )
}
