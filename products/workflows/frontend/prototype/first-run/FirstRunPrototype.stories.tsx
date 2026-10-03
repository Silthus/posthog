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

export const VariantAPitchAndPreview: StoryFn = () => <FirstRunApp variant="A" />
export const VariantBRecentSignups: StoryFn = () => <FirstRunApp variant="B" />
export const VariantCOneButton: StoryFn = () => <FirstRunApp variant="C" />
export const VariantDFirstWeek: StoryFn = () => <FirstRunApp variant="D" />
export const VariantEAiDraft: StoryFn = () => <FirstRunApp variant="E" />
