// PROTOTYPE, never merged: Silthus/personal#212. Hovering a template's name shows the email, so the list keeps the
// preview the old card grid gave without its height.
import { PreviewCard } from '@base-ui/react/preview-card'

import { Card, Text } from '@posthog/quill'

import { TemplatePreview } from 'products/workflows/frontend/MessagingPrototype/prototypeData'

export function TemplatePeek({ preview, children }: { preview?: TemplatePreview; children: JSX.Element }): JSX.Element {
    if (!preview) {
        return children
    }
    return (
        <PreviewCard.Root>
            <PreviewCard.Trigger delay={150} render={<span className="block cursor-default" />}>
                {children}
            </PreviewCard.Trigger>
            <PreviewCard.Portal>
                <PreviewCard.Positioner
                    data-quill
                    data-quill-portal="popover"
                    side="right"
                    align="start"
                    sideOffset={12}
                >
                    <PreviewCard.Popup>
                        <Card size="sm" className="w-96 overflow-hidden p-0 shadow-lg">
                            <div className="flex flex-col gap-0.5 border-b border-border px-4 py-3">
                                <Text size="xs" variant="muted" className="m-0 truncate">
                                    {preview.from}
                                </Text>
                                <Text size="sm" weight="semibold" className="m-0 truncate">
                                    {preview.subject}
                                </Text>
                                <Text size="xs" variant="muted" className="m-0 truncate">
                                    {preview.preheader}
                                </Text>
                            </div>
                            <div className="flex flex-col gap-2 bg-white px-6 py-5 text-[#151515]">
                                <div className="text-base font-bold">{preview.heading}</div>
                                {preview.body.map((paragraph) => (
                                    <p key={paragraph} className="m-0 text-sm leading-relaxed">
                                        {paragraph}
                                    </p>
                                ))}
                                <span className="mt-2 self-start rounded bg-[#151515] px-3 py-1.5 text-xs font-semibold text-white">
                                    {preview.cta}
                                </span>
                            </div>
                        </Card>
                    </PreviewCard.Popup>
                </PreviewCard.Positioner>
            </PreviewCard.Portal>
        </PreviewCard.Root>
    )
}
