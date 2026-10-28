// PROTOTYPE, never merged: Silthus/personal#212. Section bodies shared by every variant; the variants own the layout.
import { useActions } from 'kea'
import { router } from 'kea-router'
import { useState } from 'react'

import { IconPlus } from '@posthog/icons'
import {
    Badge,
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Heading,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Tabs,
    TabsList,
    TabsTrigger,
    Text,
    toast,
} from '@posthog/quill'

import {
    MessagingSection,
    messagingSectionUrl,
    workflowsRowUrl,
} from '~/layout/today/messagingPrototype/messagingPrototypeNav'
import { startNew } from '~/layout/today/messagingPrototype/NewMessagingMenuItems'
import { TemplatePeek } from '~/layout/today/messagingPrototype/TemplatePeek'

import { NEW_BROADCAST_SUGGESTIONS } from 'products/workflows/frontend/Broadcasts/broadcastAgentContext'
import { SendCalendar } from 'products/workflows/frontend/SendCalendar/SendCalendar'
import { NEW_TEMPLATE_SUGGESTIONS } from 'products/workflows/frontend/TemplateLibrary/templateAgentContext'
import { NEW_WORKFLOW_SUGGESTIONS } from 'products/workflows/frontend/Workflows/workflowAgentContext'

import { MessagingAgentStart } from './MessagingAgentStart'
import { MessagingList } from './MessagingList'
import { MessagingSettingsPage } from './MessagingSettingsPage'
import {
    BROADCASTS,
    BROADCAST_COLUMNS,
    CHANNELS,
    OPT_OUTS,
    SUPPRESSION,
    TEMPLATES,
    TEMPLATE_COLUMNS,
    TOPICS,
    TRANSACTIONAL_COLUMNS,
    TRANSACTIONAL_EMAILS,
    UPCOMING,
    WORKFLOWS,
    WORKFLOW_COLUMNS,
} from './prototypeData'

const TRANSACTIONAL_SUGGESTIONS = [
    {
        title: 'Password reset',
        description: 'A reset link that expires',
        prompt: 'Write a password reset email with a link that expires in one hour',
    },
    {
        title: 'Receipt',
        description: 'Confirm a payment',
        prompt: 'Write a payment receipt email with the amount, the date and a link to the invoice',
    },
    {
        title: 'Sign-in link',
        description: 'A one-time magic link',
        prompt: 'Write a magic link sign-in email',
    },
]

type BadgeVariant = 'default' | 'success' | 'warning'

const CHANNEL_BADGE: Record<string, BadgeVariant> = {
    Verified: 'success',
    Connected: 'success',
    'DNS records missing': 'warning',
}

function prototypeToast(what: string): void {
    toast.info({ title: `Prototype: this opens ${what}.` })
}

/** The one create action of a section, where it has one. It is the page's only primary button. */
export function SectionPrimaryAction({ section }: { section: MessagingSection }): JSX.Element | null {
    switch (section) {
        case 'broadcasts':
            return (
                <Button variant="primary" onClick={() => startNew('broadcasts')}>
                    <IconPlus />
                    New broadcast
                </Button>
            )
        case 'transactional':
            return (
                <Button variant="primary" onClick={() => startNew('transactional')}>
                    <IconPlus />
                    New transactional email
                </Button>
            )
        case 'workflows':
            return (
                <Button variant="primary" onClick={() => startNew('workflows')}>
                    <IconPlus />
                    New workflow
                </Button>
            )
        case 'templates':
            return (
                <Button variant="primary" onClick={() => prototypeToast('the template editor')}>
                    <IconPlus />
                    New template
                </Button>
            )
        case 'channels':
            return (
                <Button variant="primary" onClick={() => prototypeToast('the channel setup')}>
                    <IconPlus />
                    New channel
                </Button>
            )
        default:
            return null
    }
}

function BroadcastsBody(): JSX.Element {
    return (
        <div className="flex flex-col gap-4">
            <MessagingAgentStart
                placeholder="Describe a broadcast and who gets it, and PostHog AI drafts it…"
                suggestions={NEW_BROADCAST_SUGGESTIONS}
            />
            <MessagingList rows={BROADCASTS} columns={BROADCAST_COLUMNS} />
        </div>
    )
}

function TransactionalBody(): JSX.Element {
    return (
        <div className="flex flex-col gap-4">
            <MessagingAgentStart
                placeholder="Describe an email your app sends, and PostHog AI drafts it…"
                suggestions={TRANSACTIONAL_SUGGESTIONS}
            />
            <MessagingList rows={TRANSACTIONAL_EMAILS} columns={TRANSACTIONAL_COLUMNS} />
            <Text size="xs" variant="muted" className="m-0">
                The code under each name is the ID your app sends with. Requests sign in with a project secret API key.
            </Text>
        </div>
    )
}

function WorkflowsBody(): JSX.Element {
    const { push } = useActions(router)
    return (
        <div className="flex flex-col gap-4">
            <MessagingAgentStart
                placeholder="Describe when to message people, and PostHog AI builds the workflow…"
                suggestions={NEW_WORKFLOW_SUGGESTIONS}
            />
            <MessagingList rows={WORKFLOWS.filter((row) => row.view === 'Messaging')} columns={WORKFLOW_COLUMNS} />
            <Text size="xs" variant="muted" className="m-0">
                Shows workflows that send messages. Automations and loops are on the{' '}
                <Button variant="link" size="inline" onClick={() => push(workflowsRowUrl())}>
                    Workflows page
                </Button>
                .
            </Text>
        </div>
    )
}

function TemplatesBody(): JSX.Element {
    return (
        <div className="flex flex-col gap-4">
            <MessagingAgentStart
                placeholder="Describe a template, and PostHog AI designs it…"
                suggestions={NEW_TEMPLATE_SUGGESTIONS}
            />
            <MessagingList
                rows={TEMPLATES}
                columns={TEMPLATE_COLUMNS}
                renderName={(row, name) => <TemplatePeek preview={row.preview}>{name}</TemplatePeek>}
            />
        </div>
    )
}

/** Variant B's overview card: the next few sends. The Calendar section shows the full send calendar. */
export function UpcomingSends(): JSX.Element {
    return (
        <div className="flex flex-col gap-3">
            {UPCOMING.map((day) => (
                <div key={day.day} className="flex flex-col gap-1">
                    <Text size="xs" weight="semibold" variant="muted" className="m-0">
                        {day.day}
                    </Text>
                    {day.items.map((item) => (
                        <div
                            key={item.name}
                            className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2"
                        >
                            <Text size="xs" className="m-0 w-12 shrink-0 font-mono">
                                {item.time}
                            </Text>
                            <Text size="xs" weight="semibold" className="m-0 min-w-0 flex-1 truncate">
                                {item.name}
                            </Text>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    )
}

function ChannelsBody(): JSX.Element {
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Channel</TableHead>
                    <TableHead>Sending domain or account</TableHead>
                    <TableHead>Status</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {CHANNELS.map((row) => (
                    <TableRow key={`${row.name}-${row.detail}`}>
                        <TableCell className="font-semibold">{row.name}</TableCell>
                        <TableCell>{row.detail}</TableCell>
                        <TableCell>
                            <Badge variant={CHANNEL_BADGE[row.status] ?? 'default'}>{row.status}</Badge>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    )
}

type RecipientsTab = 'topics' | 'opt-outs' | 'suppression'

function RecipientsBody(): JSX.Element {
    const [tab, setTab] = useState<RecipientsTab>('topics')
    return (
        <div className="flex flex-col gap-3">
            <Tabs value={tab} onValueChange={(value) => setTab(value as RecipientsTab)}>
                <TabsList>
                    <TabsTrigger value="topics">Topics</TabsTrigger>
                    <TabsTrigger value="opt-outs">Opt-outs</TabsTrigger>
                    <TabsTrigger value="suppression">Suppression list</TabsTrigger>
                </TabsList>
            </Tabs>
            {tab === 'topics' ? (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Topic</TableHead>
                            <TableHead className="text-right">Opted out</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {TOPICS.map((row) => (
                            <TableRow key={row.name}>
                                <TableCell className="font-semibold">{row.name}</TableCell>
                                <TableCell className="text-right">{row.optOuts}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            ) : tab === 'opt-outs' ? (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Person</TableHead>
                            <TableHead>Opted out of</TableHead>
                            <TableHead>When</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {OPT_OUTS.map((row) => (
                            <TableRow key={row.person}>
                                <TableCell className="font-semibold">{row.person}</TableCell>
                                <TableCell>{row.topic}</TableCell>
                                <TableCell>{row.when}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Address</TableHead>
                            <TableHead>Reason</TableHead>
                            <TableHead>Added</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {SUPPRESSION.map((row) => (
                            <TableRow key={row.address}>
                                <TableCell className="font-semibold">{row.address}</TableCell>
                                <TableCell>{row.reason}</TableCell>
                                <TableCell>{row.when}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </div>
    )
}

function DeliverabilityBody(): JSX.Element {
    const { push } = useActions(router)
    const facts = [
        { title: 'Reputation', value: 'Good', description: 'From bounces and complaints over the last 30 days' },
        { title: 'Bounce rate', value: '0.8%', description: 'Keep it under 2%' },
        { title: 'Complaint rate', value: '0.02%', description: 'Keep it under 0.1%' },
    ]
    return (
        <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 @min-[40rem]/main-content:grid-cols-3">
                {facts.map((fact) => (
                    <Card key={fact.title} size="sm">
                        <CardHeader>
                            <CardDescription>{fact.title}</CardDescription>
                            <CardTitle>{fact.value}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Text size="xs" variant="muted" className="m-0">
                                {fact.description}
                            </Text>
                        </CardContent>
                    </Card>
                ))}
            </div>
            <Text size="xs" variant="muted" className="m-0">
                The frequency cap and daily limits are in{' '}
                <Button variant="link" size="inline" onClick={() => push(messagingSectionUrl('settings'))}>
                    Settings
                </Button>
                .
            </Text>
        </div>
    )
}

export function MessagingSectionBody({ section }: { section: MessagingSection }): JSX.Element | null {
    switch (section) {
        case 'broadcasts':
            return <BroadcastsBody />
        case 'transactional':
            return <TransactionalBody />
        case 'workflows':
            return <WorkflowsBody />
        case 'templates':
            return <TemplatesBody />
        case 'calendar':
            return <SendCalendar />
        case 'channels':
            return <ChannelsBody />
        case 'recipients':
            return <RecipientsBody />
        case 'deliverability':
            return <DeliverabilityBody />
        case 'settings':
            return <MessagingSettingsPage />
        default:
            return null
    }
}

/** A section's own title row, for variants whose scene title says "Messaging". */
export function SectionHeading({
    title,
    description,
    action,
}: {
    title: string
    description: string
    action?: JSX.Element | null
}): JSX.Element {
    return (
        <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex min-w-0 flex-col gap-0.5">
                <Heading size="base" render={<h2 className="m-0" />}>
                    {title}
                </Heading>
                <Text size="xs" variant="muted" className="m-0">
                    {description}
                </Text>
            </div>
            {action}
        </div>
    )
}
