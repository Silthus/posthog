// PROTOTYPE (throwaway): three structurally different ways to go from "no brand" to a branded starter template.
import { CanvasVariant } from './canvas'
import { PageVariant } from './page'
import { BrandSimulation } from './simulation'
import { StepsVariant } from './steps'

export interface ClickThroughVariant {
    key: string
    label: string
    description: string
    Component: (props: { sim: BrandSimulation }) => JSX.Element
}

export const CLICK_THROUGH_VARIANTS: ClickThroughVariant[] = [
    {
        key: 'steps',
        label: 'Steps',
        description: 'One question at a time, full screen, big type',
        Component: StepsVariant,
    },
    {
        key: 'canvas',
        label: 'Canvas',
        description: 'The email is the hero; the brand fills it in live',
        Component: CanvasVariant,
    },
    {
        key: 'page',
        label: 'Page',
        description: 'An Email brand settings page you come back to',
        Component: PageVariant,
    },
]

export const DEFAULT_CLICK_THROUGH_VARIANT = 'steps'
