import { useEffect, useRef, useState } from 'react'

/**
 * Opens after the pointer rests for `openDelayMs`, so passing over a tile does not flash a card. `mounted`
 * turns on first and `open` a frame later, which lets a CSS transition run from the closed state.
 */
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
