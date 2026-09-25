// PROTOTYPE (throwaway): folders are shared across products, so a folder can hold dashboards or insights too.
import { useValues } from 'kea'

import { IconInfo } from '@posthog/icons'

import { joinPath } from '~/layout/panel-layout/ProjectTree/utils'

import { combinedVariantLogic } from '../combined/combinedVariantLogic'

const TYPE_LABELS: Record<string, [string, string]> = {
    dashboard: ['dashboard', 'dashboards'],
    insight: ['insight', 'insights'],
    notebook: ['notebook', 'notebooks'],
    feature_flag: ['feature flag', 'feature flags'],
    experiment: ['experiment', 'experiments'],
    survey: ['survey', 'surveys'],
}

export function OtherProductItemsNote(): JSX.Element | null {
    const { otherProductItems, scope, hasActiveQuery } = useValues(combinedVariantLogic)
    if (
        hasActiveQuery ||
        !otherProductItems ||
        otherProductItems.count === 0 ||
        otherProductItems.folder !== joinPath(scope)
    ) {
        return null
    }
    const parts = Object.entries(otherProductItems.byType).map(([type, count]) => {
        const [one, many] = TYPE_LABELS[type] ?? [type.replace(/_/g, ' '), `${type.replace(/_/g, ' ')} items`]
        return `${count} ${count === 1 ? one : many}`
    })
    const kinds = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]
    return (
        <div
            className="flex items-center gap-1.5 text-xs text-secondary mb-1"
            data-attr="workflows-browser-other-product-items"
        >
            <IconInfo className="shrink-0" />
            <span>
                {scope[scope.length - 1]} also holds {kinds} from other products. They show in the project tree, not in
                this list.
            </span>
        </div>
    )
}
