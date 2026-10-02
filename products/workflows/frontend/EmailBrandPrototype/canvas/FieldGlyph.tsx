// PROTOTYPE (throwaway): a tiny visual for a brand value: a swatch, the font, or an icon.
import { IconImage, IconTextWidth } from '@posthog/icons'

import { BrandFieldKey, BrandValues } from '../simulation'

export function FieldGlyph({ fieldKey, brand }: { fieldKey: BrandFieldKey; brand: BrandValues }): JSX.Element {
    if (fieldKey === 'logo') {
        return <IconImage className="text-sm text-secondary shrink-0" />
    }
    if (fieldKey === 'name') {
        return <IconTextWidth className="text-sm text-secondary shrink-0" />
    }
    if (fieldKey === 'fontFamily') {
        return (
            <span className="text-xs font-semibold leading-none shrink-0" style={{ fontFamily: brand.fontFamily }}>
                Aa
            </span>
        )
    }
    return <span className="w-3 h-3 rounded-full border shrink-0" style={{ background: brand[fieldKey] }} />
}
