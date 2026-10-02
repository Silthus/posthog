// PROTOTYPE (throwaway): the email template editor, as it looks once the branded starter template opens in it.
import {
    IconArrowLeft,
    IconCheck,
    IconImage,
    IconLetter,
    IconPin,
    IconMinus,
    IconSend,
    IconTextWidth,
} from '@posthog/icons'
import { LemonButton, LemonInput, LemonTag, lemonToast } from '@posthog/lemon-ui'

import { BrandSimulation } from '../simulation'
import { buildStarterEmailHtml } from './brandEmail'
import { EmailFrame } from './EmailFrame'
import { SourceTag } from './SourceTag'

const BLOCKS = [
    { icon: <IconImage />, label: 'Logo' },
    { icon: <IconTextWidth />, label: 'Heading' },
    { icon: <IconLetter />, label: 'Text' },
    { icon: <IconPin />, label: 'Button' },
    { icon: <IconMinus />, label: 'Divider' },
]

export function EditorStandIn({ sim, onBack }: { sim: BrandSimulation; onBack?: () => void }): JSX.Element {
    const { brand } = sim.state
    const html = buildStarterEmailHtml(brand)
    return (
        <div className="flex flex-col h-full min-h-screen bg-primary" data-attr="email-brand-editor">
            <div className="flex items-center gap-3 px-4 py-2 border-b bg-surface-primary flex-wrap">
                {onBack && (
                    <LemonButton
                        size="small"
                        icon={<IconArrowLeft />}
                        onClick={onBack}
                        tooltip="Back to the Email brand"
                    />
                )}
                <LemonInput
                    value={sim.state.templateName}
                    onChange={sim.actions.setTemplateName}
                    size="small"
                    className="w-64 font-semibold"
                />
                <LemonTag type="success" icon={<IconCheck />}>
                    Created from your Email brand
                </LemonTag>
                <div className="ml-auto flex gap-2">
                    <LemonButton
                        size="small"
                        type="secondary"
                        icon={<IconSend />}
                        onClick={() => lemonToast.success('Test email sent to jane@acme.com')}
                    >
                        Send test
                    </LemonButton>
                    <LemonButton size="small" type="primary" onClick={() => lemonToast.success('Template saved')}>
                        Save
                    </LemonButton>
                </div>
            </div>
            <div className="flex grow min-h-0">
                <aside className="w-56 shrink-0 border-r bg-surface-primary p-3 flex flex-col gap-3 @md:flex hidden">
                    <div className="text-xs font-semibold text-secondary uppercase tracking-wide">Blocks</div>
                    <div className="grid grid-cols-2 gap-2">
                        {BLOCKS.map((block) => (
                            <div
                                key={block.label}
                                className="flex flex-col items-center gap-1 border rounded p-2 text-xs cursor-grab bg-surface-secondary"
                            >
                                <span className="text-lg">{block.icon}</span>
                                {block.label}
                            </div>
                        ))}
                    </div>
                    <div className="text-xs font-semibold text-secondary uppercase tracking-wide mt-2">Brand</div>
                    <div className="text-xs text-secondary">
                        A snapshot of the Email brand. Changing the brand later never changes this template.
                    </div>
                    <div className="flex flex-col gap-1.5 text-xs">
                        {(['primaryColor', 'accentColor', 'textColor', 'backgroundColor'] as const).map((key) => (
                            <div key={key} className="flex items-center gap-2">
                                <span className="w-4 h-4 rounded border" style={{ background: brand[key] }} />
                                <span className="font-mono">{brand[key]}</span>
                            </div>
                        ))}
                        <div className="truncate" title={brand.fontFamily}>
                            {brand.fontFamily.split(',')[0]}
                        </div>
                        <SourceTag
                            source={sim.state.sources.primaryColor}
                            edited={sim.state.edited.includes('primaryColor')}
                        />
                    </div>
                </aside>
                <main className="grow overflow-auto flex justify-center p-6 bg-[#e9e9eb]">
                    <EmailFrame html={html} scale={1} height={720} className="rounded shadow-lg" />
                </main>
            </div>
        </div>
    )
}
