// PROTOTYPE (throwaway): a hex color input with a native swatch picker.
import { LemonInput } from '@posthog/lemon-ui'

interface ColorFieldProps {
    value: string
    onChange: (value: string) => void
    size?: 'small' | 'medium'
    className?: string
}

export function ColorField({ value, onChange, size = 'small', className }: ColorFieldProps): JSX.Element {
    return (
        <div className={`flex items-center gap-1.5 ${className ?? ''}`}>
            <label
                className="relative w-7 h-7 rounded border shrink-0 cursor-pointer overflow-hidden"
                style={{ background: value }}
            >
                <input
                    type="color"
                    value={value}
                    onChange={(e) => onChange(e.target.value.toUpperCase())}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    aria-label="Pick color"
                />
            </label>
            <LemonInput
                size={size}
                value={value}
                onChange={(next) => onChange(next.toUpperCase())}
                className="w-28 font-mono"
            />
        </div>
    )
}
