// PROTOTYPE (ticket #78). Throwaway.
import { LemonDialog, lemonToast } from '@posthog/lemon-ui'

import type { HogFlow } from '../hogflows/types'

/**
 * The release control's confirmation. The body names the real cost rather than promising a clean
 * handover, because the backend's own refusal says the next push claims the workflow back.
 */
export function openReleaseFromCodeDialog(workflow: HogFlow, onRelease: () => void): void {
    const from = workflow.source_path ? `from ${workflow.source_path}` : 'from its repository'
    LemonDialog.open({
        title: 'Stop managing this workflow in code?',
        description: `You can edit this workflow here again. The next push ${from} claims it back and overwrites your changes.`,
        primaryButton: {
            children: 'Stop managing in code',
            onClick: () => {
                onRelease()
                lemonToast.success('This workflow is editable here now.')
            },
        },
        secondaryButton: { children: 'Cancel' },
    })
}
