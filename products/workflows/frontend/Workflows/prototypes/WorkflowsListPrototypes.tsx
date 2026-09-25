// PROTOTYPE (throwaway): renders the variant named by `?variant=`, with a switcher above it.
import { useValues } from 'kea'
import { router } from 'kea-router'

import { LemonButton, LemonTag } from '@posthog/lemon-ui'

import { DEFAULT_WORKFLOWS_LIST_VARIANT, WORKFLOWS_LIST_VARIANTS } from './variants'

export function WorkflowsListPrototypes(): JSX.Element {
    const { searchParams, location } = useValues(router)
    const current =
        WORKFLOWS_LIST_VARIANTS.find((variant) => variant.key === searchParams.variant) ??
        WORKFLOWS_LIST_VARIANTS.find((variant) => variant.key === DEFAULT_WORKFLOWS_LIST_VARIANT)!
    const { Component } = current

    return (
        <>
            <div
                className="flex flex-wrap items-center gap-2 mb-4 px-2 py-1.5 border border-dashed border-warning rounded bg-warning-highlight"
                data-attr="workflows-prototype-switcher"
            >
                <LemonTag type="warning">Prototype</LemonTag>
                <div className="flex flex-wrap gap-1">
                    {WORKFLOWS_LIST_VARIANTS.map((variant) => (
                        <LemonButton
                            key={variant.key}
                            size="xsmall"
                            type={variant.key === current.key ? 'primary' : 'secondary'}
                            tooltip={variant.description}
                            onClick={() =>
                                router.actions.replace(location.pathname, {
                                    ...searchParams,
                                    variant: variant.key === DEFAULT_WORKFLOWS_LIST_VARIANT ? undefined : variant.key,
                                })
                            }
                        >
                            {variant.label}
                        </LemonButton>
                    ))}
                </div>
                <span className="text-secondary text-xs">{current.description}</span>
            </div>
            <Component key={current.key} />
        </>
    )
}
