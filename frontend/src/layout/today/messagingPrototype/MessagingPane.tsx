// PROTOTYPE, never merged: Silthus/personal#212. Variant C: Messaging as a rail pane, entered from Products.
import { useValues } from 'kea'
import { router } from 'kea-router'
import { useState } from 'react'

import { removeProjectIdIfPresent } from 'lib/utils/kea-router'

import { SEARCHABLE_ITEMS } from 'products/workflows/frontend/MessagingPrototype/prototypeData'

import { TodayPaneGroupLabel } from '../TodayPaneGroupLabel'
import { TodayPaneRow } from '../TodayPaneRow'
import { TodayPaneSearchList } from '../TodayPaneSearchList'
import { MESSAGING_HOME_URL } from './messagingPrototypeLogic'
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
    calendar: '3 this week',
    channels: '1 to fix',
}

const GROUPS: { label: string | null; sections: MessagingSection[] }[] = [
    { label: null, sections: SEND_SECTIONS },
    { label: null, sections: CONTENT_SECTIONS },
    { label: 'Setup', sections: SETUP_SECTIONS },
]

const MAX_ITEM_RESULTS = 8

/** With a query, the pane also lists the broadcasts, emails, workflows and templates whose name matches. */
function ItemResults({ query }: { query: string }): JSX.Element | null {
    const items = SEARCHABLE_ITEMS.filter(({ row }) => row.name.toLowerCase().includes(query)).slice(
        0,
        MAX_ITEM_RESULTS
    )
    if (items.length === 0) {
        return null
    }
    return (
        <div className="flex flex-col gap-px pb-2">
            <TodayPaneGroupLabel first={false}>Items</TodayPaneGroupLabel>
            {items.map(({ section, row }) => (
                <TodayPaneRow
                    key={row.id}
                    value={row.id}
                    label={row.name}
                    meta={SECTION_LABELS[section]}
                    icon={SECTION_ICONS[section]}
                    to={messagingSectionUrl(section, row.name)}
                />
            ))}
        </div>
    )
}

export function MessagingPane(): JSX.Element {
    const { location } = useValues(router)
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
                    if (sections.length === 0) {
                        return null
                    }
                    return (
                        <div key={index} className="flex flex-col gap-px pb-2">
                            {group.label ? (
                                <TodayPaneGroupLabel first={false}>{group.label}</TodayPaneGroupLabel>
                            ) : (
                                index > 0 && !query && <div className="mx-2 mb-2 border-t border-border" />
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
                        </div>
                    )
                })}
                {query && <ItemResults query={query} />}
            </TodayPaneSearchList>
        </div>
    )
}
