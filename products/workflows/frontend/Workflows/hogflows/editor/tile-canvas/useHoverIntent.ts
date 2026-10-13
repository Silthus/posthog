import { useEffect, useRef, useState } from 'react'

/** `open` turns on a frame after `mounted`, so the card's CSS transition runs from its closed state. */
export function useHoverIntent(
    enabled: boolean,
    openDelayMs: number,
    closeMs: number
): { mounted: boolean; open: boolean; onMouseEnter: () => void; onMouseLeave: () => void } {
    const [mounted, setMounted] = useState(false)
    const [open, setOpen] = useState(false)
    const timer = useRef<number>()

    useEffect(() => () => window.clearTimeout(timer.current), [])
    useEffect(() => {
        if (!enabled) {
            window.clearTimeout(timer.current)
            setOpen(false)
            setMounted(false)
        }
    }, [enabled])

    return {
        mounted: enabled && mounted,
        open: enabled && open,
        onMouseEnter: () => {
            if (!enabled) {
                return
            }
            window.clearTimeout(timer.current)
            timer.current = window.setTimeout(
                () => {
                    setMounted(true)
                    requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)))
                },
                mounted ? 0 : openDelayMs
            )
        },
        onMouseLeave: () => {
            window.clearTimeout(timer.current)
            setOpen(false)
            timer.current = window.setTimeout(() => setMounted(false), closeMs)
        },
    }
}
