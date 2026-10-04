import type { Meta, StoryFn } from '@storybook/react'
import { useMountedLogic } from 'kea'

import { App } from 'scenes/App'
import { urls } from 'scenes/urls'

import { firstRunMswDecorator } from './firstRunMocks'
import { firstRunPrototypeLogic } from './firstRunPrototypeLogic'
import { FIRST_RUN_PROTOTYPE_FLAG } from './firstRunScenario'
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

export const TailoredGallery: StoryFn = () => {
    useMountedLogic(firstRunPrototypeLogic)
    return (
        <>
            <App />
            <PrototypeBar />
        </>
    )
}
