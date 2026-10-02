// PROTOTYPE (throwaway): a scaled, sandboxed render of the email html.
import { cn } from 'lib/utils/css-classes'

interface EmailFrameProps {
    html: string
    scale?: number
    height?: number
    className?: string
}

export function EmailFrame({ html, scale = 1, height = 760, className }: EmailFrameProps): JSX.Element {
    return (
        <span
            className={cn('block overflow-hidden bg-[#f4f4f5]', className)}
            style={{ width: 680 * scale, height: height * scale }}
        >
            <iframe
                srcDoc={html}
                sandbox=""
                title="Email preview"
                tabIndex={-1}
                style={{ width: 680, height, transform: `scale(${scale})`, transformOrigin: 'top left' }}
                className="border-0 pointer-events-none ph-no-capture"
            />
        </span>
    )
}
