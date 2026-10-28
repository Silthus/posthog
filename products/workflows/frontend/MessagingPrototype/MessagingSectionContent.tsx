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
    cn,
} from '@posthog/quill'

import { MessagingSection, workflowsRowUrl } from '~/layout/today/messagingPrototype/messagingPrototypeNav'
import { startNew } from '~/layout/today/messagingPrototype/NewMessagingMenuItems'

import {
    BROADCASTS,
    CALENDAR,
    CHANNELS,
    OPT_OUTS,
    SUPPRESSION,
    TEMPLATES,
    TOPICS,
    TRANSACTIONAL_EMAILS,
    WORKFLOWS,
} from './prototypeData'

type BadgeVariant = 'default' | 'info' | 'destructive' | 'warning' | 'success' | 'completed'

/** Columns a narrow scene drops, so a table never scrolls sideways. */
const WIDE_ONLY = 'hidden @min-[48rem]/main-content:table-cell'

const STATUS_BADGE: Record<string, BadgeVariant> = {
    Draft: 'default',
    Scheduled: 'info',
    Sent: 'completed',
    Live: 'success',
    Paused: 'warning',
    Verified: 'success',
    Connected: 'success',
    'DNS records missing': 'warning',
    'Not set up': 'default',
}

function StatusBadge({ status }: { status: string }): JSX.Element {
    return <Badge variant={STATUS_BADGE[status] ?? 'default'}>{status}</Badge>
}

function prototypeToast(what: string): void {
    toast.info({ title: `Prototype: this opens ${what}.` })
}

/** The one create action of a section, where it has one. */
export function SectionPrimaryAction({ section }: { section: MessagingSection }): JSX.Element | null {
    switch (section) {
        case 'broadcasts':
        case 'calendar':
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
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className={WIDE_ONLY}>Audience</TableHead>
                    <TableHead>Send time</TableHead>
                    <TableHead className={cn(WIDE_ONLY, 'text-right')}>Open rate</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {BROADCASTS.map((row) => (
                    <TableRow key={row.name}>
                        <TableCell className="font-semibold">{row.name}</TableCell>
                        <TableCell>
                            <StatusBadge status={row.status} />
                        </TableCell>
                        <TableCell className={WIDE_ONLY}>{row.audience}</TableCell>
                        <TableCell>{row.when}</TableCell>
                        <TableCell className={cn(WIDE_ONLY, 'text-right')}>{row.openRate}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    )
}

function TransactionalBody(): JSX.Element {
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>API key</TableHead>
                    <TableHead className="text-right">Sends, 7 days</TableHead>
                    <TableHead className={WIDE_ONLY}>Last sent</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {TRANSACTIONAL_EMAILS.map((row) => (
                    <TableRow key={row.key}>
                        <TableCell className="font-semibold">{row.name}</TableCell>
                        <TableCell className="font-mono">{row.key}</TableCell>
                        <TableCell className="text-right">{row.sends}</TableCell>
                        <TableCell className={WIDE_ONLY}>{row.lastSent}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    )
}

export function WorkflowsTable({ views }: { views: readonly string[] }): JSX.Element {
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className={WIDE_ONLY}>Channels</TableHead>
                    <TableHead className={WIDE_ONLY}>Trigger</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {WORKFLOWS.filter((row) => views.includes(row.view)).map((row) => (
                    <TableRow key={row.name}>
                        <TableCell className="font-semibold">{row.name}</TableCell>
                        <TableCell>
                            <StatusBadge status={row.status} />
                        </TableCell>
                        <TableCell>{row.view}</TableCell>
                        <TableCell className={WIDE_ONLY}>{row.channels}</TableCell>
                        <TableCell className={WIDE_ONLY}>{row.trigger}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    )
}

function WorkflowsBody(): JSX.Element {
    const { push } = useActions(router)
    return (
        <div className="flex flex-col gap-2">
            <WorkflowsTable views={['Messaging']} />
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
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>Updated</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {TEMPLATES.map((row) => (
                    <TableRow key={row.name}>
                        <TableCell className="font-semibold">
                            <span className="flex flex-wrap items-center gap-2">
                                {row.name}
                                {row.transactional && <Badge variant="info">Transactional</Badge>}
                            </span>
                        </TableCell>
                        <TableCell>{row.kind}</TableCell>
                        <TableCell>{row.updated}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    )
}

export function CalendarBody({ compact = false }: { compact?: boolean }): JSX.Element {
    return (
        <div className="flex flex-col gap-3">
            {CALENDAR.map((day) => (
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
                            {!compact && <Badge>{item.kind}</Badge>}
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
                            <StatusBadge status={row.status} />
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
    const facts = [
        { title: 'Reputation', value: 'Good', description: 'Bounce rate 0.8%, complaint rate 0.02%, last 30 days' },
        { title: 'Daily limit', value: '50,000', description: 'Emails per day across all channels' },
        { title: 'Frequency cap', value: '3 a week', description: 'Most messages one person gets' },
    ]
    return (
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
            return <CalendarBody />
        case 'channels':
            return <ChannelsBody />
        case 'recipients':
            return <RecipientsBody />
        case 'deliverability':
            return <DeliverabilityBody />
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
