import { useActions, useValues } from 'kea'

import { LemonBanner, Link } from '@posthog/lemon-ui'

import { urls } from 'scenes/urls'

import { MessageTemplateLogicProps, messageTemplateLogic } from './messageTemplateLogic'

interface CodeManagedNoticeProps extends MessageTemplateLogicProps {
    editWithAgentAvailable: boolean
}

export function CodeManagedNotice({ editWithAgentAvailable, ...props }: CodeManagedNoticeProps): JSX.Element {
    const logic = messageTemplateLogic(props)
    const { isDuplicating, refusedEdits, changeRun } = useValues(logic)
    const { duplicateTemplate } = useActions(logic)

    return (
        <LemonBanner
            type="info"
            className="shrink-0"
            action={
                refusedEdits
                    ? undefined
                    : {
                          children: 'Duplicate',
                          onClick: duplicateTemplate,
                          loading: isDuplicating,
                          'data-attr': 'message-template-code-managed-duplicate',
                      }
            }
        >
            <p className="m-0">
                {editWithAgentAvailable
                    ? "This template is managed by code, so it can't be changed here. To change it, edit its file, or let your coding agent do it."
                    : "This template is managed by code, so it can't be changed here. To change it, edit the file and upload it again. To edit it here, duplicate it or stop managing it in code."}
            </p>
            {changeRun && (
                <p className="m-0 mt-1" data-attr="message-template-change-run-notice">
                    PostHog Code is working on it. It opens a pull request when it's done.{' '}
                    <Link to={urls.taskDetail(changeRun.task_id)} data-attr="message-template-change-run-task">
                        Open task
                    </Link>
                </p>
            )}
        </LemonBanner>
    )
}
