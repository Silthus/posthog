// PROTOTYPE (throwaway): three structurally different ways to run the email domain setup, all on one simulation.
import { BoardVariant } from './board'
import { FocusVariant } from './focus'
import { MaxVariant } from './max'
import { SetupSimulation } from './simulation'

export interface ClickThroughVariant {
    key: string
    label: string
    description: string
    Component: (props: { sim: SetupSimulation }) => JSX.Element
}

export const CLICK_THROUGH_VARIANTS: ClickThroughVariant[] = [
    {
        key: 'focus',
        label: 'Focus',
        description: 'One question at a time, centred, big type',
        Component: FocusVariant,
    },
    {
        key: 'board',
        label: 'Board',
        description: 'Everything on one page, done steps fold away',
        Component: BoardVariant,
    },
    {
        key: 'max',
        label: 'Max',
        description: 'Max walks you through it like a chat',
        Component: MaxVariant,
    },
]

export const DEFAULT_CLICK_THROUGH_VARIANT = 'focus'
