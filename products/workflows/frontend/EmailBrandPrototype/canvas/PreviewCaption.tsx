// PROTOTYPE (throwaway): one line above the email saying what is happening to it right now.
import { IconLetter, IconPencil } from '@posthog/icons'
import { Spinner } from '@posthog/lemon-ui'

import { BrandSimulation } from '../simulation'

function captionFor(sim: BrandSimulation): { icon: JSX.Element; text: string } {
    const { phase, detectionSteps } = sim.state
    if (phase === 'detecting') {
        const reading = detectionSteps.find((step) => step.status === 'reading')
        return {
            icon: <Spinner className="text-sm" />,
            text: reading ? `Reading ${reading.file}` : 'Filling in your email',
        }
    }
    if (phase === 'review') {
        return { icon: <IconPencil />, text: 'Click any part of the email to change it' }
    }
    return { icon: <IconLetter />, text: 'Your starter email. It fills in with your brand.' }
}

export function PreviewCaption({ sim }: { sim: BrandSimulation }): JSX.Element {
    const { icon, text } = captionFor(sim)
    return (
        <div
            key={text}
            className="flex items-center gap-1.5 rounded-full bg-surface-primary border px-3 py-1 text-xs text-secondary shadow-sm animate-fade-in max-w-full"
        >
            <span className="flex shrink-0">{icon}</span>
            <span className="truncate">{text}</span>
        </div>
    )
}
