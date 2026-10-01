import { IconCopy, IconEllipsis, IconExternal, IconSparkles } from '@posthog/icons'
import { LemonButton, LemonMenu } from '@posthog/lemon-ui'

import { copyToClipboard } from 'lib/utils/copyToClipboard'

export interface SetupPromptMenuProps {
    prompt: string
    records: string
    pageUrl: string
}

const claudeUrl = (prompt: string): string => `https://claude.ai/new?q=${encodeURIComponent(prompt)}`

export function SetupPromptMenu({ prompt, records, pageUrl }: SetupPromptMenuProps): JSX.Element {
    return (
        <LemonMenu
            items={[
                {
                    label: 'Copy records',
                    icon: <IconCopy />,
                    onClick: () => void copyToClipboard(records, 'DNS records'),
                    'data-attr': 'email-domain-copy-records',
                },
                {
                    label: 'Copy page link',
                    icon: <IconCopy />,
                    onClick: () => void copyToClipboard(pageUrl, 'page link'),
                    'data-attr': 'email-domain-copy-page-link',
                },
                {
                    label: 'Copy as prompt',
                    icon: <IconSparkles />,
                    tooltip: 'A prompt for your coding agent with the records and the PostHog MCP tools to use',
                    onClick: () => void copyToClipboard(prompt, 'setup prompt'),
                    'data-attr': 'email-domain-copy-prompt',
                },
                {
                    label: 'Open in Claude',
                    icon: <IconExternal />,
                    to: claudeUrl(prompt),
                    targetBlank: true,
                    'data-attr': 'email-domain-open-in-claude',
                },
            ]}
        >
            <LemonButton size="small" icon={<IconEllipsis />} tooltip="More ways to add the records" />
        </LemonMenu>
    )
}
