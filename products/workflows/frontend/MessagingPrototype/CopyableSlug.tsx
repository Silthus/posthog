// PROTOTYPE, never merged: Silthus/personal#212.
import { useEffect, useRef, useState } from 'react'

import { IconCopy } from '@posthog/icons'
import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@posthog/quill'

import { copyToClipboard } from 'lib/utils/copyToClipboard'

const COPIED_RESET_MS = 1500

/** The ID a transactional email is sent with. It sits behind the name, and one click copies it. */
export function CopyableSlug({ slug }: { slug: string }): JSX.Element {
    const [copied, setCopied] = useState(false)
    const [open, setOpen] = useState(false)
    const copiedTimeout = useRef<ReturnType<typeof setTimeout>>()
    useEffect(() => () => clearTimeout(copiedTimeout.current), [])

    const copy = async (): Promise<void> => {
        if (await copyToClipboard(slug, 'ID', { silent: true })) {
            setCopied(true)
            clearTimeout(copiedTimeout.current)
            copiedTimeout.current = setTimeout(() => setCopied(false), COPIED_RESET_MS)
        }
    }

    return (
        <Tooltip disableHoverablePopup open={open || copied} onOpenChange={setOpen}>
            <TooltipTrigger
                delay={150}
                render={
                    <Button
                        size="xs"
                        onClick={copy}
                        aria-label={`Copy the ID ${slug}`}
                        className="group/slug font-mono text-muted-foreground"
                    />
                }
            >
                {slug}
                <IconCopy className="opacity-0 group-hover/slug:opacity-100 group-focus-visible/slug:opacity-100" />
            </TooltipTrigger>
            <TooltipContent>
                {copied ? <div role="status">Copied</div> : 'Copy the ID your app sends this email with'}
            </TooltipContent>
        </Tooltip>
    )
}
