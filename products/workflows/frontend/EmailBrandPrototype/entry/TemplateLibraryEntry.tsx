// PROTOTYPE (throwaway): the template library with a "Create from your brand" card as one way in.
import { IconLetter, IconMagicWand, IconPlus, IconSparkles } from '@posthog/icons'
import { LemonButton, LemonTag } from '@posthog/lemon-ui'

import { HedgehogDeskWizard } from '../shared/hoggies'

const EXISTING = ['Welcome email', 'Weekly digest', 'Password reset', 'Trial ending soon']

export function TemplateLibraryEntry({
    onStart,
    brandSaved,
}: {
    onStart: () => void
    brandSaved: boolean
}): JSX.Element {
    return (
        <div className="p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                    <h1 className="m-0 text-2xl font-bold">Templates</h1>
                    <p className="m-0 text-secondary">Reusable emails for your workflows and broadcasts.</p>
                </div>
                <div className="flex gap-2">
                    <LemonButton type="secondary" icon={<IconSparkles />}>
                        Write with AI
                    </LemonButton>
                    <LemonButton type="primary" icon={<IconPlus />}>
                        New template
                    </LemonButton>
                </div>
            </div>
            <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]">
                <button
                    type="button"
                    onClick={onStart}
                    data-attr="email-brand-library-card"
                    className="flex flex-col text-left rounded border-2 border-dashed border-accent bg-accent-highlight-secondary hover:bg-accent-highlight-primary cursor-pointer p-4 gap-2 min-h-44"
                >
                    <div className="flex items-start justify-between">
                        <HedgehogDeskWizard className="w-16" />
                        <LemonTag type="highlight">{brandSaved ? 'Brand saved' : 'New'}</LemonTag>
                    </div>
                    <div className="font-semibold text-base flex items-center gap-1.5">
                        <IconMagicWand /> Create from your brand
                    </div>
                    <div className="text-xs text-secondary">
                        {brandSaved
                            ? 'A starter email styled with your saved Email brand.'
                            : 'PostHog reads your logo, colors and font from GitHub and builds a starter email.'}
                    </div>
                </button>
                {EXISTING.map((name) => (
                    <div
                        key={name}
                        className="flex flex-col rounded border bg-surface-primary overflow-hidden min-h-44"
                    >
                        <div className="h-24 bg-surface-secondary flex items-center justify-center text-3xl text-secondary border-b">
                            <IconLetter />
                        </div>
                        <div className="p-3 flex flex-col gap-1">
                            <div className="font-semibold text-sm">{name}</div>
                            <div className="text-xs text-secondary">Edited 3 days ago</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
