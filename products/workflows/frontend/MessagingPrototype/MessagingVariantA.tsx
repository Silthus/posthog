// PROTOTYPE, never merged: Silthus/personal#212. Variant A: one Messaging scene with a section side menu.
import { Fragment } from 'react'

import { Button, MenuLabel, cn } from '@posthog/quill'

import { LinkPrimitive } from 'lib/lemon-ui/Link'

import { SceneContent } from '~/layout/scenes/components/SceneContent'
import { SceneTitleSection } from '~/layout/scenes/components/SceneTitleSection'
import {
    CONTENT_SECTIONS,
    MessagingSection,
    SECTION_DESCRIPTIONS,
    SECTION_ICONS,
    SECTION_LABELS,
    SEND_SECTIONS,
    SETUP_SECTIONS,
    messagingSectionUrl,
} from '~/layout/today/messagingPrototype/messagingPrototypeNav'

import { MessagingHeaderActions, MessagingSettingsMenuButton } from './MessagingHeaderActions'
import { MessagingSectionBody, SectionHeading, SectionPrimaryAction } from './MessagingSectionContent'

const MENU: { label: string | null; sections: MessagingSection[] }[] = [
    { label: null, sections: SEND_SECTIONS },
    { label: null, sections: CONTENT_SECTIONS },
    { label: 'Setup', sections: SETUP_SECTIONS },
]

export function MessagingVariantA({ section }: { section: MessagingSection }): JSX.Element {
    const current = section === 'overview' ? 'broadcasts' : section
    return (
        <SceneContent>
            <SceneTitleSection
                name="Messaging"
                description="Broadcasts, transactional emails and workflows that send messages"
                resourceType={{ type: 'broadcasts' }}
                actions={<MessagingHeaderActions showSettings={false} />}
            />
            <div className="flex flex-col gap-4 @min-[48rem]/main-content:flex-row">
                <nav
                    aria-label="Messaging sections"
                    className="flex shrink-0 flex-row flex-wrap gap-1 @min-[48rem]/main-content:w-48 @min-[48rem]/main-content:flex-col @min-[48rem]/main-content:gap-px"
                >
                    {MENU.map((group, index) => (
                        <Fragment key={index}>
                            {index > 0 && (
                                <div className="hidden @min-[48rem]/main-content:block">
                                    {group.label ? (
                                        <MenuLabel className="mt-2 pt-1 pb-0.5">{group.label}</MenuLabel>
                                    ) : (
                                        <div className="my-1.5 border-t border-border" />
                                    )}
                                </div>
                            )}
                            {group.sections.map((key) => (
                                <Button
                                    key={key}
                                    left
                                    nativeButton={false}
                                    render={<LinkPrimitive to={messagingSectionUrl(key)} />}
                                    aria-current={key === current ? 'page' : undefined}
                                    aria-selected={key === current}
                                    className={cn('font-semibold @min-[48rem]/main-content:w-full')}
                                >
                                    {SECTION_ICONS[key]}
                                    {SECTION_LABELS[key]}
                                </Button>
                            ))}
                        </Fragment>
                    ))}
                    <div className="hidden @min-[48rem]/main-content:block my-1.5 border-t border-border" />
                    <MessagingSettingsMenuButton />
                </nav>
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                    <SectionHeading
                        title={SECTION_LABELS[current]}
                        description={SECTION_DESCRIPTIONS[current]}
                        action={<SectionPrimaryAction section={current} />}
                    />
                    <MessagingSectionBody section={current} />
                </div>
            </div>
        </SceneContent>
    )
}
