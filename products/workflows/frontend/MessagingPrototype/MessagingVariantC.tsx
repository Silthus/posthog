import { SceneContent } from '~/layout/scenes/components/SceneContent'
import { SceneTitleSection } from '~/layout/scenes/components/SceneTitleSection'
// PROTOTYPE, never merged: Silthus/personal#212. Variant C: the Messaging rail pane carries the navigation, so the
// scene shows one section with its own title and create action.
import {
    MessagingSection,
    SECTION_DESCRIPTIONS,
    SECTION_ICONS,
    SECTION_LABELS,
} from '~/layout/today/messagingPrototype/messagingPrototypeNav'

import { MessagingSectionBody, SectionPrimaryAction } from './MessagingSectionContent'

export function MessagingVariantC({ section }: { section: MessagingSection }): JSX.Element {
    const current = section === 'overview' ? 'broadcasts' : section
    return (
        <SceneContent>
            <SceneTitleSection
                name={SECTION_LABELS[current]}
                description={SECTION_DESCRIPTIONS[current]}
                resourceType={{ type: 'broadcasts', forceIcon: SECTION_ICONS[current] }}
                actions={<SectionPrimaryAction section={current} />}
            />
            <MessagingSectionBody section={current} />
        </SceneContent>
    )
}
