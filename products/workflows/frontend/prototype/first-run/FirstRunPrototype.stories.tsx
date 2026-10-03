import type { Meta, StoryFn } from '@storybook/react'
import { useMountedLogic } from 'kea'

import { App } from 'scenes/App'
import { urls } from 'scenes/urls'

import { firstRunMswDecorator } from './firstRunMocks'
import { firstRunPrototypeLogic, setInitialHomeVariant } from './firstRunPrototypeLogic'
import { FIRST_RUN_PROTOTYPE_FLAG } from './firstRunScenario'
import { HomeVariant, VARIANT_FROM_URL } from './homeVariants'
import { PrototypeBar } from './PrototypeBar'

const meta: Meta = {
    title: 'Products/Workflows/Prototype/First run',
    parameters: {
        layout: 'fullscreen',
        viewMode: 'story',
        pageUrl: urls.workflows(),
        featureFlags: [FIRST_RUN_PROTOTYPE_FLAG],
        testOptions: { skip: true },
    },
    decorators: [firstRunMswDecorator],
}
export default meta

function FirstRunApp({ variant }: { variant: HomeVariant }): JSX.Element {
    setInitialHomeVariant(VARIANT_FROM_URL ?? variant)
    useMountedLogic(firstRunPrototypeLogic)

    return (
        <>
            <App />
            <PrototypeBar />
        </>
    )
}

export const VariantFExampleFirst: StoryFn = () => <FirstRunApp variant="F" />
export const VariantGTailoredGallery: StoryFn = () => <FirstRunApp variant="G" />
export const VariantHAiWalkthrough: StoryFn = () => <FirstRunApp variant="H" />
export const VariantIBrandFirst: StoryFn = () => <FirstRunApp variant="I" />
