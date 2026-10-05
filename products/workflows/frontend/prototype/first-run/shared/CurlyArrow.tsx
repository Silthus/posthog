// PROTOTYPE ONLY (silthus/posthog#212). A curved arrow from an anchor to a target element, drawn on top of
// the page and kept in place as the layout moves.
import { useEffect, useState } from 'react'

interface Points {
    from: { x: number; y: number }
    to: { x: number; y: number }
}

function measure(anchor: HTMLElement | null, targetSelector: string): Points | null {
    const target = document.querySelector(targetSelector)
    if (!anchor || !target) {
        return null
    }
    const a = anchor.getBoundingClientRect()
    const t = target.getBoundingClientRect()
    const to = { x: t.left + t.width / 2, y: t.bottom + 6 }
    if (to.x < a.left - 16) {
        return { from: { x: a.left - 6, y: a.top + a.height / 2 }, to }
    }
    if (to.x > a.right + 16) {
        return { from: { x: a.right + 6, y: a.top + a.height / 2 }, to }
    }
    return { from: { x: to.x, y: a.top - 4 }, to }
}

export function CurlyArrow({
    anchor,
    targetSelector,
}: {
    anchor: HTMLElement | null
    targetSelector: string
}): JSX.Element | null {
    const [points, setPoints] = useState<Points | null>(null)

    useEffect(() => {
        const update = (): void => setPoints(measure(anchor, targetSelector))
        update()
        const timer = window.setInterval(update, 300)
        window.addEventListener('resize', update)
        return () => {
            window.clearInterval(timer)
            window.removeEventListener('resize', update)
        }
    }, [anchor, targetSelector])

    if (!points) {
        return null
    }
    const { from, to } = points
    const control = { x: to.x, y: from.y }
    const path = `M ${from.x} ${from.y} Q ${control.x} ${control.y}, ${to.x} ${to.y}`
    const angle = Math.atan2(to.y - control.y, to.x - control.x)
    const head = (offset: number): string =>
        `${to.x - 12 * Math.cos(angle + offset)},${to.y - 12 * Math.sin(angle + offset)}`

    return (
        <svg className="fixed inset-0 w-screen h-screen pointer-events-none z-[1001] text-warning" aria-hidden>
            <path d={path} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
            <polyline
                points={`${head(0.45)} ${to.x},${to.y} ${head(-0.45)}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    )
}
