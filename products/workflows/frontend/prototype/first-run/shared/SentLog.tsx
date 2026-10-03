// PROTOTYPE ONLY: what the simulated backend delivered so far.
import { LemonTag } from '@posthog/lemon-ui'

import { useBackend } from '../prototypeBackend'

export function SentLog(): JSX.Element | null {
    const { state } = useBackend()
    if (state.sentLog.length === 0) {
        return null
    }
    return (
        <div className="rounded border border-primary bg-surface-primary">
            <div className="px-3 py-2 border-b border-primary text-xs font-semibold uppercase text-secondary">
                Delivered so far
            </div>
            <ul className="m-0 p-0 list-none divide-y divide-primary">
                {state.sentLog.map((entry) => (
                    <li key={entry.id} className="px-3 py-2 flex flex-col gap-1 text-sm">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-secondary tabular-nums">min {entry.minute}</span>
                            <strong>{entry.subject}</strong>
                            <LemonTag type={entry.outcome === 'delivered' ? 'success' : 'danger'} size="small">
                                {entry.outcome}
                            </LemonTag>
                            <LemonTag type={entry.via === 'sandbox' ? 'completion' : 'primary'} size="small">
                                {entry.via === 'sandbox' ? 'sandbox sender' : 'your domain'}
                            </LemonTag>
                        </div>
                        <div className="text-xs text-secondary">
                            To {entry.to}
                            {entry.note ? ` · ${entry.note}` : ''}
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    )
}
