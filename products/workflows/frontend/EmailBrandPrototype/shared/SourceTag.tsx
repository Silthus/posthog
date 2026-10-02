// PROTOTYPE (throwaway): where a brand value came from, as a small chip with the matching line on hover.
import { IconCode, IconPencil, IconQuestion } from '@posthog/icons'
import { LemonTag, Tooltip } from '@posthog/lemon-ui'

import { BrandSignal } from '../simulation'

interface SourceTagProps {
    source?: BrandSignal
    edited?: boolean
    size?: 'small' | 'medium'
}

export function SourceTag({ source, edited, size = 'small' }: SourceTagProps): JSX.Element {
    if (edited) {
        return (
            <LemonTag size={size} type="highlight" icon={<IconPencil />}>
                Edited by you
            </LemonTag>
        )
    }
    if (!source) {
        return (
            <LemonTag size={size} type="muted" icon={<IconQuestion />}>
                Not found in repo
            </LemonTag>
        )
    }
    const fileName = source.file.split('/').pop()
    return (
        <Tooltip
            title={
                <div className="flex flex-col gap-1">
                    <span className="font-mono text-xs">{source.file}</span>
                    {source.snippet && (
                        <code className="text-xs bg-fill-primary px-1 py-0.5 rounded">{source.snippet}</code>
                    )}
                </div>
            }
        >
            <LemonTag size={size} type="completion" icon={<IconCode />}>
                from {fileName}
            </LemonTag>
        </Tooltip>
    )
}
