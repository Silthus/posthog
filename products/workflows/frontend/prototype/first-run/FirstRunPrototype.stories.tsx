import type { Meta, StoryFn } from '@storybook/react'

import { FirstRunPrototype } from './FirstRunPrototype'

const meta: Meta = {
    title: 'Products/Workflows/Prototype/First run',
    component: FirstRunPrototype,
    parameters: { layout: 'fullscreen', viewMode: 'story', testOptions: { skip: true } },
}
export default meta

export const FirstRun: StoryFn = () => <FirstRunPrototype />
