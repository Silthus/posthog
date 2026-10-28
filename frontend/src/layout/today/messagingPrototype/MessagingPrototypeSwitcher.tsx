// PROTOTYPE, never merged: Silthus/personal#212. Rendered only by the prototype story, never by the app.
import { useValues } from 'kea'
import { router } from 'kea-router'
import { useEffect } from 'react'

import { IconChevronLeft, IconChevronRight } from '@posthog/icons'

import {
    MESSAGING_PROTOTYPE_VARIANTS,
    MessagingPrototypeVariant,
    messagingPrototypeLogic,
    switchVariant,
} from './messagingPrototypeLogic'

export const VARIANT_LABELS: Record<MessagingPrototypeVariant, string> = {
    A: 'A (Side menu) · muscle memory: Broadcasts row, Channels, Templates · low use: Suppression',
    B: 'B (Overview) · muscle memory: Workflows row, Broadcasts row, Channels · low use: Suppression',
    C: 'C (Messaging pane) · muscle memory: Broadcasts row, Channels, Templates · low use: Suppression',
}

function step(current: MessagingPrototypeVariant, by: number): MessagingPrototypeVariant {
    const index = MESSAGING_PROTOTYPE_VARIANTS.indexOf(current)
    const count = MESSAGING_PROTOTYPE_VARIANTS.length
    return MESSAGING_PROTOTYPE_VARIANTS[(index + by + count) % count]
}

function isEditable(target: EventTarget | null): boolean {
    return (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    )
}

export function MessagingPrototypeSwitcher(): JSX.Element {
    const { variant } = useValues(messagingPrototypeLogic)
    const current = variant ?? 'A'
    const { location } = useValues(router)

    // The Messaging row sits low in All products, so bring the active row into view for whoever opens the link.
    useEffect(() => {
        // The products pane loads lazily, so keep looking for the active row for a few seconds.
        let tries = 0
        const interval = window.setInterval(() => {
            const row = document.querySelector('[data-attr="today-tool"][aria-current="page"]')
            row?.scrollIntoView({ block: 'center' })
            if (row || ++tries > 20) {
                window.clearInterval(interval)
            }
        }, 300)
        return () => window.clearInterval(interval)
    }, [location.pathname, current])

    useEffect(() => {
        const onKey = (event: KeyboardEvent): void => {
            if (isEditable(event.target) || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) {
                return
            }
            switchVariant(step(current, event.key === 'ArrowLeft' ? -1 : 1))
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [current])

    return (
        <div
            className="fixed bottom-4 left-1/2 z-[9999] flex -translate-x-1/2 items-center gap-1 rounded-full border-2 border-[#f54e00] bg-[#151515] px-1 py-1 text-white shadow-lg"
            data-attr="prototype-variant-switcher"
        >
            <button
                type="button"
                aria-label="Previous variant"
                className="flex size-7 items-center justify-center rounded-full hover:bg-white/15"
                onClick={() => switchVariant(step(current, -1))}
            >
                <IconChevronLeft />
            </button>
            <span className="max-w-[60vw] px-2 text-center text-xs font-semibold">
                Prototype · {VARIANT_LABELS[current]}
            </span>
            <button
                type="button"
                aria-label="Next variant"
                className="flex size-7 items-center justify-center rounded-full hover:bg-white/15"
                onClick={() => switchVariant(step(current, 1))}
            >
                <IconChevronRight />
            </button>
        </div>
    )
}
