// PROTOTYPE (throwaway): marketing or transactional, as the step declares it.
import { LemonTag } from '@posthog/lemon-ui'

import type { MessageCategoryType } from './emailLensModel'

export function EmailCategoryTag({
    categoryType,
    categoryName,
}: {
    categoryType: MessageCategoryType | null
    categoryName?: string | null
}): JSX.Element {
    if (!categoryType) {
        return <span className="text-muted">No category</span>
    }
    const label = categoryType === 'marketing' ? 'Marketing' : 'Transactional'
    return (
        <LemonTag type={categoryType === 'marketing' ? 'highlight' : 'default'} title={categoryName ?? undefined}>
            {categoryName ? `${label}: ${categoryName}` : label}
        </LemonTag>
    )
}
