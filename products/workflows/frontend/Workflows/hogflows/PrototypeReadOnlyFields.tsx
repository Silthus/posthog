// PROTOTYPE ONLY. Throwaway way to lock every field in the node configuration panel without
// touching each step component: walk the rendered subtree and set readOnly or disabled on it.

import { useEffect, useRef } from 'react'

import type { PrototypeReadOnlyMode } from './prototypeReadOnlyMode'

type LockableField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement

const FIELD_SELECTOR = 'input, textarea, select, button'

export function PrototypeReadOnlyFields({
    enabled,
    panelInputs,
    reason,
    children,
}: {
    enabled: boolean
    panelInputs: PrototypeReadOnlyMode['panelInputs']
    reason: string
    children: React.ReactNode
}): JSX.Element {
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const container = containerRef.current
        if (!enabled || !container) {
            return
        }

        const lock = (): void => {
            container.querySelectorAll<LockableField>(FIELD_SELECTOR).forEach((field) => {
                if (field.dataset.prototypeReadOnlyExempt === 'true') {
                    return
                }
                field.title = reason
                if (panelInputs === 'readOnly') {
                    // A text field can be readOnly and still selectable, so a value stays copyable.
                    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
                        field.readOnly = true
                    } else if (field instanceof HTMLSelectElement) {
                        field.disabled = true
                    }
                    // Buttons stay live in this mode, so sections still expand and values stay readable.
                    return
                }
                field.disabled = true
                field.setAttribute('aria-disabled', 'true')
            })
        }

        lock()
        const observer = new MutationObserver(lock)
        observer.observe(container, { childList: true, subtree: true })
        return () => observer.disconnect()
    }, [enabled, panelInputs, reason])

    return (
        <div ref={containerRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {children}
        </div>
    )
}
