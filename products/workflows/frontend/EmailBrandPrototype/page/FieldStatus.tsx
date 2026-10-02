// PROTOTYPE (throwaway): what sits under every brand value: where it came from, or a hint, or a conflict to resolve.
import { IconWarning } from '@posthog/icons'
import { LemonButton, Spinner } from '@posthog/lemon-ui'

import { PrototypeLogo } from '../shared/logos'
import { SourceTag } from '../shared/SourceTag'
import { BrandFieldKey, BrandSimulation, FieldConflict } from '../simulation'

interface FieldStatusProps {
    sim: BrandSimulation
    field: BrandFieldKey
    emptyHint: string
}

export function FieldStatus({ sim, field, emptyHint }: FieldStatusProps): JSX.Element {
    const { sources, edited, conflicts, detectionRuns, phase } = sim.state
    const source = sources[field]
    const isEdited = edited.includes(field)
    const conflict = conflicts.find((c) => c.key === field)
    const untouched = !source && !isEdited

    return (
        <div className="flex flex-col items-start gap-1.5">
            {untouched && phase === 'detecting' ? (
                <span className="flex items-center gap-1.5 text-xs text-secondary">
                    <Spinner className="text-sm" /> Looking in your repo
                </span>
            ) : untouched && detectionRuns === 0 ? (
                <span className="text-xs text-secondary">{emptyHint}</span>
            ) : (
                <SourceTag source={source} edited={isEdited} />
            )}
            {conflict && <ConflictRow sim={sim} conflict={conflict} />}
        </div>
    )
}

function ConflictRow({ sim, conflict }: { sim: BrandSimulation; conflict: FieldConflict }): JSX.Element {
    return (
        <div className="flex flex-wrap items-center gap-2 rounded border border-warning bg-warning-highlight px-2 py-1.5 text-xs w-full">
            <IconWarning className="text-warning text-sm shrink-0" />
            <span className="flex flex-wrap items-center gap-1">
                Detected <ConflictValue value={conflict.detected} /> in <code>{conflict.file.split('/').pop()}</code>
            </span>
            <div className="flex gap-1 ml-auto">
                <LemonButton
                    size="xsmall"
                    type="secondary"
                    onClick={() => sim.actions.resolveConflict(conflict.key, 'keep')}
                >
                    Keep mine
                </LemonButton>
                <LemonButton
                    size="xsmall"
                    type="primary"
                    onClick={() => sim.actions.resolveConflict(conflict.key, 'detected')}
                >
                    Use detected
                </LemonButton>
            </div>
        </div>
    )
}

function ConflictValue({ value }: { value: string | PrototypeLogo | null }): JSX.Element {
    if (value === null) {
        return <strong>no logo</strong>
    }
    if (typeof value !== 'string') {
        return <strong>{value.label}</strong>
    }
    if (value.startsWith('#')) {
        return (
            <span className="inline-flex items-center gap-1 font-mono font-semibold">
                <span className="inline-block w-3 h-3 rounded-sm border" style={{ background: value }} />
                {value}
            </span>
        )
    }
    return <strong>{value.split(',')[0]}</strong>
}
