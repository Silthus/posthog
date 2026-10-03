// PROTOTYPE ONLY: marks where an in-flight feature (domain wizard, Audience, Email brand) plugs in.
import { ReactNode } from 'react'

import { LemonTag } from '@posthog/lemon-ui'

export function PlugInSlot({
    name,
    does,
    children,
}: {
    name: string
    does: string
    children?: ReactNode
}): JSX.Element {
    return (
        <div className="rounded border border-dashed border-primary bg-surface-secondary p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
                <LemonTag type="highlight" size="small">
                    In flight
                </LemonTag>
                <span className="font-semibold text-sm">{name}</span>
                <span className="text-xs text-secondary">plugs in here: {does}</span>
            </div>
            {children}
        </div>
    )
}
