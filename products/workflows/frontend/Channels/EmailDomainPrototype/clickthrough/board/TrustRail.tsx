// PROTOTYPE (throwaway): the sticky "Sender trust" rail of the Board variant.
import clsx from 'clsx'

import { DnsRecordKind, PrototypeDnsRecord, RECORD_KIND_LABEL } from '../../prototypeData'
import { SenderSecurityLadder } from '../../SenderSecurityLadder'
import { HedgehogClimber, HedgehogExplorer } from '../shared/hoggies'
import { SetupSimulation } from '../simulation'

interface KindSummary {
    kind: DnsRecordKind
    found: number
    total: number
    missing: boolean
}

const summarizeKinds = (records: PrototypeDnsRecord[]): KindSummary[] => {
    const byKind = new Map<DnsRecordKind, KindSummary>()
    for (const record of records) {
        const entry = byKind.get(record.kind) ?? { kind: record.kind, found: 0, total: 0, missing: false }
        entry.total += 1
        entry.found += record.status === 'found' || record.status === 'verified' ? 1 : 0
        entry.missing = entry.missing || record.status === 'missing'
        byKind.set(record.kind, entry)
    }
    return [...byKind.values()]
}

function SettingLine({ summary }: { summary: KindSummary }): JSX.Element {
    const done = summary.found === summary.total
    return (
        <li className="flex items-start gap-2 text-sm">
            <span
                className={clsx(
                    'mt-1.5 size-2.5 rounded-full shrink-0 border',
                    done
                        ? 'bg-success border-success'
                        : summary.missing
                          ? 'bg-danger border-danger'
                          : 'bg-fill-primary border-primary'
                )}
                aria-hidden
            />
            <span className={clsx('min-w-0', done ? 'text-primary' : summary.missing ? 'text-danger' : 'text-muted')}>
                {RECORD_KIND_LABEL[summary.kind]}
                {summary.total > 1 && (
                    <span className="text-xs text-secondary">
                        {' '}
                        {summary.found} of {summary.total}
                    </span>
                )}
            </span>
        </li>
    )
}

export function TrustRail({ sim }: { sim: SetupSimulation }): JSX.Element {
    const { state, derived } = sim
    if (!state.rootDomain) {
        return (
            <section className="rounded-lg border bg-surface-primary p-5 flex flex-col items-center text-center gap-3">
                <span className="text-xs uppercase tracking-wide text-muted self-start">Sender trust</span>
                <HedgehogExplorer className="w-28" />
                <p className="m-0 text-sm text-secondary">Pick a domain and Max starts climbing.</p>
            </section>
        )
    }
    return (
        <div className="flex flex-col gap-3">
            <span className="text-xs uppercase tracking-wide text-muted">Sender trust</span>
            {derived.ladderLevel === 0 && (
                <div className="flex items-center gap-3 rounded-lg border bg-surface-primary p-3">
                    <HedgehogClimber className="w-14 shrink-0" />
                    <span className="text-sm text-secondary">
                        Max is waiting at the bottom. The first two levels come free once your settings are verified.
                    </span>
                </div>
            )}
            <SenderSecurityLadder level={derived.ladderLevel} />
            <section className="rounded-lg border bg-surface-primary p-4 flex flex-col gap-2">
                <h3 className="m-0 text-sm font-semibold">What each setting does</h3>
                <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
                    {summarizeKinds(derived.records).map((summary) => (
                        <SettingLine key={summary.kind} summary={summary} />
                    ))}
                </ul>
            </section>
        </div>
    )
}
