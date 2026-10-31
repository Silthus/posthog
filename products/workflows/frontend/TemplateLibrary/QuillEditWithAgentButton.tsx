import { useActions, useValues } from 'kea'
import { KeyboardEvent, useRef } from 'react'

import { IconChevronDown, IconCopy } from '@posthog/icons'
import {
    Button,
    ButtonGroup,
    ButtonGroupSeparator,
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    Field,
    FieldError,
    FieldLabel,
    Popover,
    PopoverContent,
    PopoverTrigger,
    Text,
    Textarea,
} from '@posthog/quill'

import { MessageTemplateLogicProps, messageTemplateLogic } from './messageTemplateLogic'

export function QuillEditWithAgentButton(props: MessageTemplateLogicProps): JSX.Element {
    const logic = messageTemplateLogic(props)
    const { agentPromptOpen, templateLoading } = useValues(logic)
    const { setAgentPromptOpen, copyHtmlFile } = useActions(logic)
    const loadingReason = templateLoading ? 'Wait for the template to load' : undefined
    const sentenceRef = useRef<HTMLTextAreaElement>(null)

    return (
        <ButtonGroup>
            <Popover open={agentPromptOpen} onOpenChange={setAgentPromptOpen}>
                <PopoverTrigger
                    render={
                        <Button
                            variant="primary"
                            data-attr="message-template-edit-with-agent"
                            disabledReason={loadingReason}
                        />
                    }
                >
                    Edit with your agent
                </PopoverTrigger>
                <PopoverContent
                    align="end"
                    className="w-96 max-w-full"
                    aria-label="Edit with your agent"
                    initialFocus={() => focusAtEnd(sentenceRef.current)}
                >
                    <QuillAgentPrompt {...props} sentenceRef={sentenceRef} />
                </PopoverContent>
            </Popover>
            <ButtonGroupSeparator />
            <DropdownMenu>
                <DropdownMenuTrigger
                    render={
                        <Button
                            variant="primary"
                            size="icon"
                            aria-label="More ways to copy this template"
                            tooltip="More ways to copy this template"
                            disabledReason={loadingReason}
                            data-attr="message-template-copy-options"
                        />
                    }
                >
                    <IconChevronDown />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem data-attr="message-template-copy-html-file" onClick={copyHtmlFile}>
                        <IconCopy />
                        Copy HTML file
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </ButtonGroup>
    )
}

function focusAtEnd(field: HTMLTextAreaElement | null): HTMLTextAreaElement | null {
    field?.setSelectionRange(field.value.length, field.value.length)
    return field
}

interface QuillAgentPromptProps extends MessageTemplateLogicProps {
    sentenceRef: React.RefObject<HTMLTextAreaElement>
}

function QuillAgentPrompt({ sentenceRef, ...props }: QuillAgentPromptProps): JSX.Element {
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

    const copyOnCmdEnter = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            copyAgentPrompt()
        }
    }

    return (
        <>
            <Field>
                <FieldLabel htmlFor="message-template-change-sentence">Describe the change</FieldLabel>
                <Textarea
                    id="message-template-change-sentence"
                    ref={sentenceRef}
                    value={changeSentence}
                    onChange={(event) => setChangeSentence(event.target.value)}
                    onKeyDown={copyOnCmdEnter}
                    rows={3}
                    data-attr="message-template-change-sentence"
                />
                {changeRunError && (
                    <FieldError>{[changeRunError.detail, changeRunError.fix].filter(Boolean).join(' ')}</FieldError>
                )}
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
                {postHogCodeAvailable && (
                    <Button
                        variant="outline"
                        data-attr="message-template-run-with-posthog-code"
                        onClick={runWithPostHogCode}
                        loading={isRequestingChangeRun}
                        disabledReason={runWithPostHogCodeDisabledReason}
                    >
                        Run with PostHog Code
                    </Button>
                )}
                <Button
                    variant="primary"
                    data-attr="message-template-copy-agent-prompt"
                    onClick={copyAgentPrompt}
                    disabledReason={copyAgentPromptDisabledReason}
                >
                    Copy prompt
                </Button>
            </div>
            <Collapsible>
                <CollapsibleTrigger>Show full prompt</CollapsibleTrigger>
                <CollapsibleContent>
                    <Text
                        size="xs"
                        render={<div />}
                        className="m-0 whitespace-pre-wrap break-words font-mono"
                        data-attr="message-template-agent-prompt"
                    >
                        {agentPrompt}
                    </Text>
                </CollapsibleContent>
            </Collapsible>
        </>
    )
}
