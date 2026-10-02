// PROTOTYPE (throwaway): the four brand colors in a grid.
import { ColorField } from '../shared/ColorField'
import { BRAND_FIELD_LABELS, BrandSimulation } from '../simulation'
import { FieldStatus } from './FieldStatus'
import { Section } from './Section'

const COLOR_FIELDS = [
    { key: 'primaryColor', use: 'Buttons and links' },
    { key: 'accentColor', use: 'The top border and dividers' },
    { key: 'textColor', use: 'Headings and body text' },
    { key: 'backgroundColor', use: 'Behind the email content' },
] as const

export function ColorsSection({ sim }: { sim: BrandSimulation }): JSX.Element {
    return (
        <Section title="Colors">
            <div className="grid grid-cols-1 @md:grid-cols-2 gap-x-4 gap-y-5">
                {COLOR_FIELDS.map(({ key, use }) => (
                    <div key={key} className="flex flex-col gap-1.5 min-w-0">
                        <div className="flex flex-col">
                            <span className="text-sm font-medium">{BRAND_FIELD_LABELS[key]}</span>
                            <span className="text-xs text-secondary">{use}</span>
                        </div>
                        <ColorField
                            value={sim.state.brand[key]}
                            onChange={(value) => sim.actions.setField(key, value)}
                        />
                        <FieldStatus
                            sim={sim}
                            field={key}
                            emptyHint="A default for now. Change it, or detect it from GitHub."
                        />
                    </div>
                ))}
            </div>
        </Section>
    )
}
