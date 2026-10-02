// PROTOTYPE (throwaway): the font, picked from email-safe stacks.
import { LemonSelect } from '@posthog/lemon-ui'

import { BrandSimulation, FONT_OPTIONS } from '../simulation'
import { FieldStatus } from './FieldStatus'
import { Section } from './Section'

const firstFamily = (stack: string): string => stack.split(',')[0]

export function FontSection({ sim }: { sim: BrandSimulation }): JSX.Element {
    const { brand } = sim.state
    const fallbacks = brand.fontFamily.split(',').slice(1).join(',').trim()
    return (
        <Section
            title="Font"
            description="Email apps only have a few fonts, so each choice lists what to use when the first one is missing."
        >
            <div className="flex flex-col gap-1.5">
                <LemonSelect
                    value={brand.fontFamily}
                    onChange={(value) => sim.actions.setField('fontFamily', value)}
                    options={FONT_OPTIONS.map((stack) => ({
                        value: stack,
                        label: firstFamily(stack),
                        labelInMenu: <span style={{ fontFamily: stack }}>{firstFamily(stack)}</span>,
                    }))}
                    className="max-w-80"
                />
                {fallbacks && <span className="text-xs text-secondary">Falls back to {fallbacks}</span>}
                <div className="text-lg truncate py-1" style={{ fontFamily: brand.fontFamily, color: brand.textColor }}>
                    Welcome to {brand.name || 'your brand'}
                </div>
                <FieldStatus
                    sim={sim}
                    field="fontFamily"
                    emptyHint="A safe default for now. Change it, or detect it from GitHub."
                />
            </div>
        </Section>
    )
}
