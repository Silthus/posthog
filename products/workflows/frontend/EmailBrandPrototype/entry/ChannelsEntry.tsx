// PROTOTYPE (throwaway): the Channels page with an Email brand section as the other way in.
import { IconCheck, IconGithub, IconLetter, IconMagicWand, IconPalette } from '@posthog/icons'
import { LemonButton, LemonTag } from '@posthog/lemon-ui'

import { logoDataUrl } from '../shared/logos'
import { BrandValues } from '../simulation'

interface ChannelsEntryProps {
    onStart: () => void
    brandSaved: boolean
    brand: BrandValues
}

export function ChannelsEntry({ onStart, brandSaved, brand }: ChannelsEntryProps): JSX.Element {
    return (
        <div className="p-6 flex flex-col gap-6 max-w-4xl">
            <div>
                <h1 className="m-0 text-2xl font-bold">Channels</h1>
                <p className="m-0 text-secondary">Where your messages go out from.</p>
            </div>
            <section className="flex flex-col gap-2">
                <h2 className="m-0 text-lg font-semibold flex items-center gap-2">
                    <IconLetter /> Email
                </h2>
                <div className="rounded border bg-surface-primary p-4 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                        <div className="font-semibold">mail.acme.com</div>
                        <div className="text-xs text-secondary">hello@mail.acme.com</div>
                    </div>
                    <LemonTag type="success" icon={<IconCheck />}>
                        Verified
                    </LemonTag>
                </div>
            </section>
            <section className="flex flex-col gap-2">
                <h2 className="m-0 text-lg font-semibold flex items-center gap-2">
                    <IconPalette /> Email brand
                </h2>
                {brandSaved ? (
                    <div
                        className="rounded border bg-surface-primary p-4 flex items-center gap-4 flex-wrap"
                        data-attr="email-brand-channels-card"
                    >
                        {brand.logo && <img src={logoDataUrl(brand.logo)} alt={brand.name} className="h-8" />}
                        <div className="flex gap-1">
                            {[brand.primaryColor, brand.accentColor, brand.textColor, brand.backgroundColor].map(
                                (color) => (
                                    <span
                                        key={color}
                                        className="w-6 h-6 rounded border"
                                        style={{ background: color }}
                                    />
                                )
                            )}
                        </div>
                        <div className="text-sm text-secondary">{brand.fontFamily.split(',')[0]}</div>
                        <LemonButton className="ml-auto" type="secondary" onClick={onStart}>
                            Edit
                        </LemonButton>
                    </div>
                ) : (
                    <div
                        className="rounded border bg-surface-primary p-4 flex items-center gap-4 flex-wrap"
                        data-attr="email-brand-channels-card"
                    >
                        <div className="grow">
                            <div className="font-semibold">No Email brand yet</div>
                            <div className="text-sm text-secondary">
                                Your logo, colors and font, used by every starter email. PostHog can read them from your
                                GitHub repo.
                            </div>
                        </div>
                        <LemonButton
                            type="primary"
                            icon={<IconGithub />}
                            onClick={onStart}
                            sideIcon={<IconMagicWand />}
                        >
                            Detect from GitHub
                        </LemonButton>
                    </div>
                )}
            </section>
        </div>
    )
}
