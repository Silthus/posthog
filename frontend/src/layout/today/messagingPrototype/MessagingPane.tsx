// PROTOTYPE, never merged: Silthus/personal#212. Variant C: Messaging as a rail pane, entered from Products.
import { useActions, useValues } from 'kea'
import { router } from 'kea-router'
import { useState } from 'react'

import { IconGear } from '@posthog/icons'
import { Button } from '@posthog/quill'

import { removeProjectIdIfPresent } from 'lib/utils/kea-router'

import { TodayPaneGroupLabel } from '../TodayPaneGroupLabel'
import { TodayPaneRow } from '../TodayPaneRow'
import { TodayPaneSearchList } from '../TodayPaneSearchList'
import { MESSAGING_HOME_URL, messagingPrototypeLogic } from './messagingPrototypeLogic'
import {
    CONTENT_SECTIONS,
    MessagingSection,
    SECTION_ICONS,
    SECTION_LABELS,
    SEND_SECTIONS,
    SETUP_SECTIONS,
    messagingSectionUrl,
} from './messagingPrototypeNav'

const ROW_META: Partial<Record<MessagingSection, string>> = {
    broadcasts: '2 scheduled',
    calendar: '4 this week',
    channels: '1 to fix',
}

const GROUPS: { label: string | null; sections: MessagingSection[] }[] = [
    { label: null, sections: SEND_SECTIONS },
    { label: null, sections: CONTENT_SECTIONS },
    { label: 'Setup', sections: SETUP_SECTIONS },
]

const SETTINGS_LABEL = 'Settings'

export function MessagingPane(): JSX.Element {
    const { location } = useValues(router)
    const { setSettingsOpen } = useActions(messagingPrototypeLogic)
    const [search, setSearch] = useState('')
    const path = removeProjectIdIfPresent(location.pathname)
    const query = search.trim().toLowerCase()
    const matches = (section: MessagingSection): boolean => SECTION_LABELS[section].toLowerCase().includes(query)

    return (
        <div className="TodayPane flex min-h-0 flex-1 flex-col" data-quill>
            <TodayPaneSearchList
                query={search}
                onQueryChange={setSearch}
                searchLabel="Search messaging"
                dataAttr="messaging-pane-search"
            >
                {GROUPS.map((group, index) => {
                    const sections = group.sections.filter(matches)
                    const showSettings = group.label === 'Setup' && SETTINGS_LABEL.toLowerCase().includes(query)
                    if (sections.length === 0 && !showSettings) {
                        return null
                    }
                    return (
                        <div key={index} className="flex flex-col gap-px pb-2">
                            {group.label ? (
                                <TodayPaneGroupLabel first={false}>{group.label}</TodayPaneGroupLabel>
                            ) : (
                                index > 0 && <div className="mx-2 mb-2 border-t border-border" />
                            )}
                            {sections.map((section) => (
                                <TodayPaneRow
                                    key={section}
                                    value={section}
                                    label={SECTION_LABELS[section]}
                                    meta={ROW_META[section]}
                                    icon={SECTION_ICONS[section]}
                                    to={messagingSectionUrl(section)}
                                    active={path === `${MESSAGING_HOME_URL}/${section}`}
                                />
                            ))}
                            {showSettings && (
                                <Button
                                    size="row"
                                    left
                                    className="w-full font-semibold text-foreground"
                                    onClick={() => setSettingsOpen(true)}
                                >
                                    <IconGear />
                                    {SETTINGS_LABEL}
                                </Button>
                            )}
                        </div>
                    )
                })}
            </TodayPaneSearchList>
        </div>
    )
}
