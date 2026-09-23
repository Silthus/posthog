import { useActions, useValues } from 'kea'
import { useEffect } from 'react'

import { IconChevronLeft, IconChevronRight, IconX } from '@posthog/icons'

import { osVariantLogic } from './osVariantLogic'
import { OS_VARIANTS, cycleOsVariant } from './osVariants'

function isTypingTarget(target: EventTarget | null): boolean {
    return (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
    )
}

/**
 * PROTOTYPE: the floating switcher between OS shell designs. Not part of any design.
 */
export function OsVariantBar(): JSX.Element {
    const { variant } = useValues(osVariantLogic)
    const { setVariant, leavePreview } = useActions(osVariantLogic)
    const current = OS_VARIANTS.find(({ key }) => key === variant) ?? OS_VARIANTS[0]

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent): void => {
            // Bare arrows only, and only when nothing else would use them: menus and inputs keep theirs.
            const bare = !event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey
            const onPage = document.activeElement === document.body || document.activeElement === null
            if (!bare || !onPage || isTypingTarget(event.target) || event.defaultPrevented) {
                return
            }
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault()
                setVariant(cycleOsVariant(variant, event.key === 'ArrowLeft' ? -1 : 1))
            }
        }
        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
    }, [variant, setVariant])

    return (
        <div
            className={`fixed right-4 ${variant === 'b' ? 'bottom-24' : 'bottom-4'} z-[2147483000] flex items-center gap-1 rounded-full bg-black text-white shadow-lg px-1.5 py-1 text-xs font-sans`}
            role="toolbar"
            aria-label="Design preview"
            data-attr="os-variant-bar"
        >
            <button
                type="button"
                className="rounded-full p-1.5 hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white"
                aria-label="Previous design"
                onClick={() => setVariant(cycleOsVariant(variant, -1))}
                data-attr="os-variant-previous"
            >
                <IconChevronLeft className="size-4" />
            </button>
            <div className="flex items-center gap-1" role="radiogroup" aria-label="Design">
                {OS_VARIANTS.map(({ key, label, description }) => (
                    <button
                        key={key}
                        type="button"
                        role="radio"
                        aria-checked={key === variant}
                        title={description}
                        className={
                            key === variant
                                ? 'rounded-full px-2.5 py-1 bg-white text-black font-semibold'
                                : 'rounded-full px-2.5 py-1 hover:bg-white/20'
                        }
                        onClick={() => setVariant(key)}
                        data-attr={`os-variant-${key}`}
                    >
                        {key.toUpperCase()} <span className="font-normal">{label}</span>
                    </button>
                ))}
            </div>
            <button
                type="button"
                className="rounded-full p-1.5 hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white"
                aria-label="Next design"
                onClick={() => setVariant(cycleOsVariant(variant, 1))}
                data-attr="os-variant-next"
            >
                <IconChevronRight className="size-4" />
            </button>
            <span className="px-2 text-white/70 max-w-72 truncate">{current.description}</span>
            <button
                type="button"
                className="rounded-full p-1.5 hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white"
                aria-label="Leave the design preview"
                title="Leave the design preview and use the default design"
                onClick={leavePreview}
                data-attr="os-variant-leave"
            >
                <IconX className="size-4" />
            </button>
        </div>
    )
}
