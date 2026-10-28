// PROTOTYPE, never merged: Silthus/personal#212. Round 1: the Messaging home in three variants, switched with
// `?variant=A|B|C`, inside the today-rail-nav shell.
import { useValues } from 'kea'
import { router } from 'kea-router'

import { SceneExport } from 'scenes/sceneTypes'

import { messagingPrototypeLogic } from '~/layout/today/messagingPrototype/messagingPrototypeLogic'
import { messagingLandingSection, parseMessagingSection } from '~/layout/today/messagingPrototype/messagingPrototypeNav'
import { ProductKey } from '~/queries/schema/schema-general'

import { MessagingVariantA } from './MessagingVariantA'
import { MessagingVariantB } from './MessagingVariantB'
import { MessagingVariantC } from './MessagingVariantC'

export const scene: SceneExport = {
    component: MessagingPrototypeScene,
    productKey: ProductKey.WORKFLOWS,
}

export function MessagingPrototypeScene(): JSX.Element {
    const { location } = useValues(router)
    const { variant } = useValues(messagingPrototypeLogic)
    const section = parseMessagingSection(location.pathname.split('/').pop()) ?? messagingLandingSection(variant ?? 'A')

    return variant === 'B' ? (
        <MessagingVariantB section={section} />
    ) : variant === 'C' ? (
        <MessagingVariantC section={section} />
    ) : (
        <MessagingVariantA section={section} />
    )
}
