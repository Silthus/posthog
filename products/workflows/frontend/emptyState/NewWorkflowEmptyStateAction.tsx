import { useActions } from 'kea'

import { LemonButton } from '@posthog/lemon-ui'

import { AccessControlAction } from 'lib/components/AccessControlAction'
import { addProductIntent } from 'lib/utils/product-intents'

import { ProductIntentContext, ProductKey } from '~/queries/schema/schema-general'
import { AccessControlLevel, AccessControlResourceType } from '~/types'

import { newWorkflowLogic } from '../Workflows/newWorkflowLogic'
import { NewWorkflowModal } from '../Workflows/NewWorkflowModal'

/** The first-run "New workflow" button: the same template chooser or AI composer the list page's button opens. */
export function NewWorkflowEmptyStateAction(): JSX.Element {
    const { startNewWorkflow } = useActions(newWorkflowLogic)

    return (
        <>
            <AccessControlAction
                resourceType={AccessControlResourceType.Workflow}
                minAccessLevel={AccessControlLevel.Editor}
            >
                <LemonButton
                    type="primary"
                    data-attr="new-workflow"
                    onClick={() => {
                        void addProductIntent({
                            product_type: ProductKey.WORKFLOWS,
                            intent_context: ProductIntentContext.WORKFLOW_CREATED,
                        })
                        startNewWorkflow()
                    }}
                >
                    New workflow
                </LemonButton>
            </AccessControlAction>
            <NewWorkflowModal />
        </>
    )
}
