// PROTOTYPE, never merged: Silthus/personal#212. Variant B: an overview page with cards per sending kind and
// setup health; the sections are tabs.
import { useActions } from 'kea'
import { router } from 'kea-router'

import { IconArrowRight, IconCheck, IconWarning } from '@posthog/icons'
import {
    Badge,
    Button,
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
    Tabs,
    TabsList,
    TabsTrigger,
    Text,
    ToggleGroup,
    ToggleGroupItem,
} from '@posthog/quill'

import { SceneContent } from '~/layout/scenes/components/SceneContent'
import { SceneTitleSection } from '~/layout/scenes/components/SceneTitleSection'
import {
    MessagingSection,
    SECTION_DESCRIPTIONS,
    SECTION_ICONS,
    SECTION_LABELS,
    SETUP_SECTIONS,
    messagingSectionUrl,
} from '~/layout/today/messagingPrototype/messagingPrototypeNav'
import { startNew } from '~/layout/today/messagingPrototype/NewMessagingMenuItems'

import { MessagingHeaderActions } from './MessagingHeaderActions'
import { MessagingSectionBody, SectionHeading, SectionPrimaryAction, UpcomingSends } from './MessagingSectionContent'

type BTab = 'overview' | 'broadcasts' | 'transactional' | 'workflows' | 'templates' | 'calendar' | 'setup'

const TABS: BTab[] = ['overview', 'broadcasts', 'transactional', 'workflows', 'templates', 'calendar', 'setup']

function tabForSection(section: MessagingSection): BTab {
    return SETUP_SECTIONS.includes(section) ? 'setup' : (section as BTab)
}

const SEND_CARDS = [
    {
        section: 'broadcasts',
        new: 'New broadcast',
        facts: ['2 scheduled', '1 draft', 'Last sent Oct 6'],
    },
    {
        section: 'transactional',
        new: 'New transactional email',
        facts: ['3 emails', '5,293 sends in 7 days'],
    },
    {
        section: 'workflows',
        new: 'New workflow',
        facts: ['3 live', '1 paused'],
    },
] as const

const SETUP_HEALTH = [
    { section: 'channels', ok: false, text: 'news.example.com needs DNS records' },
    { section: 'recipients', ok: true, text: '3 topics, preferences page live' },
    { section: 'deliverability', ok: true, text: 'Reputation good, daily limit 50,000' },
] as const

function Overview(): JSX.Element {
    const { push } = useActions(router)
    return (
        <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 @min-[48rem]/main-content:grid-cols-3">
                {SEND_CARDS.map((card) => (
                    <Card key={card.section} size="sm">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                {SECTION_ICONS[card.section]}
                                {SECTION_LABELS[card.section]}
                            </CardTitle>
                            <CardDescription>{SECTION_DESCRIPTIONS[card.section]}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-wrap gap-1">
                            {card.facts.map((fact) => (
                                <Badge key={fact}>{fact}</Badge>
                            ))}
                        </CardContent>
                        <CardFooter className="flex flex-wrap gap-2">
                            <Button variant="outline" onClick={() => startNew(card.section)}>
                                {card.new}
                            </Button>
                            <Button onClick={() => push(messagingSectionUrl(card.section))}>
                                View all
                                <IconArrowRight />
                            </Button>
                        </CardFooter>
                    </Card>
                ))}
            </div>
            <div className="grid grid-cols-1 gap-3 @min-[48rem]/main-content:grid-cols-2">
                <Card size="sm">
                    <CardHeader>
                        <CardTitle>Setup</CardTitle>
                        <CardDescription>
                            Channels, recipients and deliverability for everything you send
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-1">
                        {SETUP_HEALTH.map((item) => (
                            <Button
                                key={item.section}
                                left
                                className="h-auto w-full py-1.5"
                                onClick={() => push(messagingSectionUrl(item.section))}
                            >
                                {item.ok ? (
                                    <IconCheck className="text-success-foreground" />
                                ) : (
                                    <IconWarning className="text-warning-foreground" />
                                )}
                                <span className="flex min-w-0 flex-1 flex-col items-start">
                                    <span className="font-semibold">{SECTION_LABELS[item.section]}</span>
                                    <span className="truncate text-xs font-normal text-muted-foreground">
                                        {item.text}
                                    </span>
                                </span>
                            </Button>
                        ))}
                    </CardContent>
                </Card>
                <Card size="sm">
                    <CardHeader>
                        <CardTitle>Up next</CardTitle>
                        <CardDescription>From the calendar</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <UpcomingSends />
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}

function SetupTab({ section }: { section: MessagingSection }): JSX.Element {
    const { push } = useActions(router)
    const current = SETUP_SECTIONS.includes(section) ? section : 'channels'
    return (
        <div className="flex flex-col gap-3">
            <ToggleGroup
                variant="outline"
                value={[current]}
                onValueChange={(value: string[]) => value[0] && push(messagingSectionUrl(value[0] as MessagingSection))}
            >
                {SETUP_SECTIONS.map((key) => (
                    <ToggleGroupItem key={key} value={key}>
                        {SECTION_LABELS[key]}
                    </ToggleGroupItem>
                ))}
            </ToggleGroup>
            <SectionHeading
                title={SECTION_LABELS[current]}
                description={SECTION_DESCRIPTIONS[current]}
                action={<SectionPrimaryAction section={current} />}
            />
            <MessagingSectionBody section={current} />
        </div>
    )
}

export function MessagingVariantB({ section }: { section: MessagingSection }): JSX.Element {
    const { push } = useActions(router)
    const tab = tabForSection(section)
    return (
        <SceneContent>
            <SceneTitleSection
                name="Messaging"
                description="Broadcasts, transactional emails and workflows that send messages"
                resourceType={{ type: 'broadcasts' }}
                actions={<MessagingHeaderActions />}
            />
            <Tabs
                value={tab}
                onValueChange={(value) =>
                    push(messagingSectionUrl(value === 'setup' ? 'channels' : (value as MessagingSection)))
                }
            >
                <TabsList variant="line" className="flex-wrap">
                    {TABS.map((key) => (
                        <TabsTrigger key={key} value={key}>
                            {key === 'setup' ? 'Setup' : SECTION_LABELS[key]}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>
            {tab === 'overview' ? (
                <Overview />
            ) : tab === 'setup' ? (
                <SetupTab section={section} />
            ) : (
                <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <Text size="xs" variant="muted" className="m-0">
                            {SECTION_DESCRIPTIONS[section]}
                        </Text>
                        <SectionPrimaryAction section={section} />
                    </div>
                    <MessagingSectionBody section={section} />
                </div>
            )}
        </SceneContent>
    )
}
