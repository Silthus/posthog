// PROTOTYPE, never merged: Silthus/personal#212. Navigation data shared by the Messaging home variants.
import {
    IconCalendar,
    IconDecisionTree,
    IconDocument,
    IconLetter,
    IconPeople,
    IconPlug,
    IconPulse,
    IconSend,
} from '@posthog/icons'

import { FileSystemImport, ProductItemCategory } from '~/queries/schema/schema-general'

import {
    MESSAGING_HOME_URL,
    MessagingPrototypeVariant,
    WORKFLOWS_ROW_URL,
    withVariant,
} from './messagingPrototypeLogic'

export type MessagingSection =
    | 'overview'
    | 'broadcasts'
    | 'transactional'
    | 'workflows'
    | 'templates'
    | 'calendar'
    | 'channels'
    | 'recipients'
    | 'deliverability'

export const SEND_SECTIONS: MessagingSection[] = ['broadcasts', 'transactional', 'workflows']
export const CONTENT_SECTIONS: MessagingSection[] = ['templates', 'calendar']
export const SETUP_SECTIONS: MessagingSection[] = ['channels', 'recipients', 'deliverability']

export const SECTION_LABELS: Record<MessagingSection, string> = {
    overview: 'Overview',
    broadcasts: 'Broadcasts',
    transactional: 'Transactional',
    workflows: 'Workflows',
    templates: 'Templates',
    calendar: 'Calendar',
    channels: 'Channels',
    recipients: 'Recipients',
    deliverability: 'Deliverability',
}

export const SECTION_DESCRIPTIONS: Record<MessagingSection, string> = {
    overview: 'What you send, what is scheduled, and whether sending is set up',
    broadcasts: 'One-time or scheduled messages to a group of people',
    transactional: 'Email templates your code sends with one API call',
    workflows: 'Workflows that send messages. Every workflow is on the Workflows page.',
    templates: 'Reusable email content for broadcasts, workflows and transactional emails',
    calendar: 'Everything scheduled to send, across broadcasts and workflows',
    channels: 'Email, SMS, push and Slack. Email setup is your sending domains.',
    recipients: 'Who may receive your messages: topics, opt-outs and the suppression list',
    deliverability: 'Reputation and sending limits',
}

export const SECTION_ICONS: Record<MessagingSection, JSX.Element> = {
    overview: <IconSend />,
    broadcasts: <IconSend />,
    transactional: <IconLetter />,
    workflows: <IconDecisionTree />,
    templates: <IconDocument />,
    calendar: <IconCalendar />,
    channels: <IconPlug />,
    recipients: <IconPeople />,
    deliverability: <IconPulse />,
}

export const ALL_SECTIONS: MessagingSection[] = ['overview', ...SEND_SECTIONS, ...CONTENT_SECTIONS, ...SETUP_SECTIONS]

export function parseMessagingSection(value: string | undefined): MessagingSection | null {
    return ALL_SECTIONS.includes(value as MessagingSection) ? (value as MessagingSection) : null
}

/** Where a click on the Messaging row lands: the overview in B, the first list in A and C. */
export function messagingLandingSection(variant: MessagingPrototypeVariant | null): MessagingSection {
    return variant === 'B' ? 'overview' : 'broadcasts'
}

export function messagingSectionUrl(section: MessagingSection): string {
    return withVariant(`${MESSAGING_HOME_URL}/${section}`)
}

export function workflowsRowUrl(filter?: string): string {
    return withVariant(`${WORKFLOWS_ROW_URL}${filter ? `?type=${filter}` : ''}`)
}

const REPLACED_ROWS = new Set(['/broadcasts', '/transactional', '/workflows'])

/** The Workflows row's category: Messaging in A and C, next to the other automations (CDP) in B. */
function workflowsRowCategory(variant: MessagingPrototypeVariant): string {
    return variant === 'B' ? ProductItemCategory.CDP : ProductItemCategory.MESSAGING
}

/** The Products pane rows with one Messaging row instead of Broadcasts and Transactional. */
export function messagingPrototypeProducts(
    items: FileSystemImport[],
    variant: MessagingPrototypeVariant | null
): FileSystemImport[] {
    if (!variant) {
        return items
    }
    const workflows = items.find((item) => item.href === '/workflows')
    const rest = items.filter((item) => !REPLACED_ROWS.has(item.href ?? ''))
    const messaging: FileSystemImport = {
        path: 'Messaging',
        category: ProductItemCategory.MESSAGING,
        type: 'broadcasts',
        iconType: 'broadcasts',
        iconColor: ['var(--color-product-broadcasts-light)', 'var(--color-product-broadcasts-dark)'],
        href: `${MESSAGING_HOME_URL}/${messagingLandingSection(variant)}?variant=${variant}`,
    }
    const workflowsRow: FileSystemImport = {
        ...(workflows ?? { path: 'Workflows', iconType: 'workflows', type: 'workflows' }),
        category: workflowsRowCategory(variant),
        href: `${WORKFLOWS_ROW_URL}?variant=${variant}`,
    }
    return [...rest, messaging, workflowsRow]
}
