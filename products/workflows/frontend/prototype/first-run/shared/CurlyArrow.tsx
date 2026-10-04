// PROTOTYPE ONLY (silthus/posthog#212). A hand-drawn arrow from an anchor to a target element, drawn on top of
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
    return { from: { x: a.left + a.width / 2, y: a.top }, to: { x: t.left + t.width / 2, y: t.bottom + 6 } }
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
    const loopX = from.x - 70
    const path = `M ${from.x} ${from.y} C ${from.x} ${from.y - 40}, ${loopX} ${from.y - 30}, ${loopX + 10} ${from.y - 55} S ${to.x + 30} ${to.y + 40}, ${to.x} ${to.y}`
    const angle = Math.atan2(to.y - (to.y + 40), to.x - (to.x + 30))
    const head = (offset: number): string =>
        `${to.x + 12 * Math.cos(angle + Math.PI + offset)},${to.y + 12 * Math.sin(angle + Math.PI + offset)}`

    return (
        <svg className="fixed inset-0 w-screen h-screen pointer-events-none z-[1001] text-warning" aria-hidden>
            <path
                d={path}
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeDasharray="1 0"
            />
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
