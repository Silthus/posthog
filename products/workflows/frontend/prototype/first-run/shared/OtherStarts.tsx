// PROTOTYPE ONLY (silthus/posthog#212). The quiet way out for teams that came for something else.
import { Link } from '@posthog/lemon-ui'

import { urls } from 'scenes/urls'

export function OtherStarts(): JSX.Element {
    return (
        <div className="text-sm text-secondary">
            Something else in mind? <Link to={urls.workflows('library')}>Browse templates</Link> or{' '}
            <Link to={urls.workflowNew()}>start from a blank workflow</Link>.
        </div>
    )
}
