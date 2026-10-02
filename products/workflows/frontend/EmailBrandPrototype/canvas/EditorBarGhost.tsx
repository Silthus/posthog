// PROTOTYPE (throwaway): the editor toolbar sliding in while the starter template is built, so the editor feels like it was there all along.
import { LemonSkeleton } from '@posthog/lemon-ui'

export function EditorBarGhost({ templateName }: { templateName: string }): JSX.Element {
    return (
        <div className="flex items-center gap-3 px-4 py-2 border-b bg-surface-primary animate-fade-in">
            <LemonSkeleton className="w-7 h-7" />
            <div className="flex items-center h-7 w-64 max-w-full rounded border px-2 text-sm font-semibold truncate">
                {templateName}
            </div>
            <LemonSkeleton className="w-44 h-5 hidden @lg:block" />
            <div className="ml-auto flex gap-2">
                <LemonSkeleton className="w-24 h-7 hidden @md:block" />
                <LemonSkeleton className="w-14 h-7" />
            </div>
        </div>
    )
}
