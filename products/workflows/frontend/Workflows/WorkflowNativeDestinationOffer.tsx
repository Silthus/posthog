import { useActions, useValues } from 'kea'
import { useEffect } from 'react'

import { LemonBanner, LemonButton } from '@posthog/lemon-ui'

import { Link } from 'lib/lemon-ui/Link'
import type { HogFunctionConfigurationProps } from 'scenes/hog-functions/configuration/HogFunctionConfiguration'

import { workflowNativeDestinationLogic } from './workflowNativeDestinationLogic'

export function WorkflowNativeDestinationOffer(props: HogFunctionConfigurationProps): JSX.Element | null {
    const logic = workflowNativeDestinationLogic(props)
    const { offer, providerName } = useValues(logic)
    const { shown, open, dismiss } = useActions(logic)
    useEffect(() => {
        if (offer) {
            shown()
        }
    }, [offer, shown])
    if (!offer) {
        return null
    }
    return (
        <LemonBanner type="info">
            <h3 className="mb-1">Send emails directly with Workflows</h3>
            <p>
                Use your PostHog events and properties, with 10,000 emails free each month. For supported email
                workflows, sending directly can reduce external data sync and may lower your costs.
            </p>
            <p>
                <Link to="https://posthog.com/pricing" target="_blank">
                    View pricing
                </Link>
            </p>
            <div className="flex flex-wrap items-center gap-2">
                <LemonButton type="primary" onClick={open}>
                    Try Workflows
                </LemonButton>
                <LemonButton type="tertiary" onClick={dismiss}>{`Keep configuring ${providerName}`}</LemonButton>
                <span className="text-secondary">Opens in a new tab</span>
            </div>
        </LemonBanner>
    )
}
