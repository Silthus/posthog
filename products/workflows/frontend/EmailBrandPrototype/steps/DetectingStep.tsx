// PROTOTYPE (throwaway): step three, files stream past as PostHog reads them and the brand fills in as values turn up.
import { IconCheckCircle, IconCircleDashed } from '@posthog/icons'
import { Spinner } from '@posthog/lemon-ui'

import { cn } from 'lib/utils/css-classes'

import { HedgehogMagnifyingGlass, HedgehogStampApproved } from '../shared/hoggies'
import { logoDataUrl } from '../shared/logos'
import { BRAND_FIELD_LABELS, BRAND_FIELD_ORDER, BrandFieldKey, BrandSimulation, DetectionStep } from '../simulation'
import { StepScreen } from './StepScreen'

const SWATCH_KEYS = ['primaryColor', 'accentColor', 'textColor', 'backgroundColor'] as const

function StatusIcon({ status }: { status: DetectionStep['status'] }): JSX.Element {
    if (status === 'reading') {
        return <Spinner className="text-base" />
    }
    if (status === 'found') {
        return <IconCheckCircle className="text-success text-base" />
    }
    return <IconCircleDashed className={cn('text-base', status === 'empty' ? 'text-secondary' : 'text-tertiary')} />
}

function DetectionRow({ step, foundKeys }: { step: DetectionStep; foundKeys: BrandFieldKey[] }): JSX.Element {
    return (
        <li className={cn('flex items-start gap-2.5 py-1.5', step.status === 'todo' && 'opacity-50')}>
            <span className="pt-0.5 shrink-0">
                <StatusIcon status={step.status} />
            </span>
            <span className="grow min-w-0 flex flex-col">
                <span className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-mono text-sm truncate">{step.file}</span>
                    <span className="text-xs text-secondary">{step.label}</span>
                </span>
                {step.status === 'found' && foundKeys.length > 0 && (
                    <span className="text-xs text-success">
                        Found {foundKeys.map((key) => BRAND_FIELD_LABELS[key].toLowerCase()).join(', ')}
                    </span>
                )}
                {step.status === 'empty' && <span className="text-xs text-tertiary">Nothing useful here</span>}
            </span>
        </li>
    )
}

function BrandForming({ sim }: { sim: BrandSimulation }): JSX.Element {
    const { brand, sources } = sim.state
    const has = (key: BrandFieldKey): boolean => !!sources[key]
    return (
        <div
            className="rounded-lg border bg-surface-primary p-4 flex flex-col gap-3"
            data-attr="email-brand-steps-forming"
        >
            <div className="text-xs font-semibold text-secondary">Your brand so far</div>
            <div className="flex items-center gap-3 min-h-10">
                {has('logo') && brand.logo ? (
                    <img
                        src={logoDataUrl(brand.logo)}
                        alt={brand.name || 'Logo'}
                        className="h-8 max-w-40 object-contain"
                    />
                ) : (
                    <span className="h-8 w-24 rounded border border-dashed" />
                )}
                <span className={cn('font-bold text-lg truncate', !has('name') && 'text-tertiary')}>
                    {has('name') ? brand.name : 'Name'}
                </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
                {SWATCH_KEYS.map((key) => (
                    <span
                        key={key}
                        title={BRAND_FIELD_LABELS[key]}
                        className={cn('w-8 h-8 rounded-full border transition-colors', !has(key) && 'border-dashed')}
                        style={has(key) ? { background: brand[key] } : undefined}
                    />
                ))}
                <span
                    className={cn('text-sm ml-1', !has('fontFamily') && 'text-tertiary')}
                    style={has('fontFamily') ? { fontFamily: brand.fontFamily } : undefined}
                >
                    {has('fontFamily') ? brand.fontFamily.split(',')[0] : 'Font'}
                </span>
            </div>
        </div>
    )
}

export function DetectingStep({ sim }: { sim: BrandSimulation }): JSX.Element {
    const { detectionSteps, sources, selectedRepo } = sim.state
    const { detectionDone, detectionProgress, foundCount } = sim.derived
    const foundKeysFor = (step: DetectionStep): BrandFieldKey[] =>
        BRAND_FIELD_ORDER.filter((key) => sources[key]?.file === step.file)
    return (
        <StepScreen
            phase="detecting"
            hoggie={detectionDone && foundCount > 0 ? HedgehogStampApproved : HedgehogMagnifyingGlass}
            title={
                detectionDone
                    ? foundCount > 0
                        ? `Found ${foundCount} of ${BRAND_FIELD_ORDER.length}`
                        : 'Nothing found'
                    : `Reading ${selectedRepo}`
            }
            subtitle={detectionDone ? 'Opening your Email brand…' : 'Looking for your name, logo, colors and font.'}
        >
            <div className="flex flex-col gap-4">
                <div className="h-1.5 rounded-full bg-border overflow-hidden">
                    <div
                        className="h-full bg-accent transition-all duration-500"
                        style={{ width: `${Math.round(detectionProgress * 100)}%` }}
                    />
                </div>
                <ul className="m-0 p-0 list-none flex flex-col">
                    {detectionSteps.map((step) => (
                        <DetectionRow key={step.file} step={step} foundKeys={foundKeysFor(step)} />
                    ))}
                </ul>
                <BrandForming sim={sim} />
            </div>
        </StepScreen>
    )
}
