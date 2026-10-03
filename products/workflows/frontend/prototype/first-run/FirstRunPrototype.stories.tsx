import type { Meta, StoryFn } from '@storybook/react'
import { useActions, useMountedLogic } from 'kea'
import { useEffect } from 'react'

import { App } from 'scenes/App'
import { urls } from 'scenes/urls'

import { firstRunMswDecorator } from './firstRunMocks'
import { firstRunPrototypeLogic, setInitialProjectData } from './firstRunPrototypeLogic'
import { FIRST_RUN_PROTOTYPE_FLAG, ProjectData } from './firstRunScenario'
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

function FirstRunApp({ projectData }: { projectData: ProjectData }): JSX.Element {
    setInitialProjectData(projectData)
    useMountedLogic(firstRunPrototypeLogic)
    const { setProjectData } = useActions(firstRunPrototypeLogic)
    useEffect(() => setProjectData(projectData), [projectData, setProjectData])

    return (
        <>
            <App />
            <PrototypeBar />
        </>
    )
}

export const SignupsAndEmails: StoryFn = () => <FirstRunApp projectData="signups-and-emails" />
export const FewEmails: StoryFn = () => <FirstRunApp projectData="few-emails" />
export const NothingCapturedYet: StoryFn = () => <FirstRunApp projectData="nothing-yet" />
