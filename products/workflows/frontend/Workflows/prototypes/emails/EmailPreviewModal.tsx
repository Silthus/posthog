// PROTOTYPE (throwaway): what an email step sends, with the HTML rendered in a sandboxed iframe.
import { useActions, useValues } from 'kea'

import { LemonButton, LemonModal } from '@posthog/lemon-ui'

import { urls } from 'scenes/urls'

import { EmailCategoryTag } from './EmailCategoryTag'
import { emailLensLogic } from './emailLensLogic'

export function EmailPreviewModal(): JSX.Element {
    const { previewSend } = useValues(emailLensLogic)
    const { closePreview } = useActions(emailLensLogic)
    const send = previewSend

    return (
        <LemonModal
            isOpen={!!send}
            onClose={closePreview}
            title={send?.step.subject || 'No subject'}
            description={send ? `${send.item.name} · ${send.step.stepName}` : undefined}
            width={720}
            footer={
                send ? (
                    <LemonButton type="secondary" to={urls.workflow(send.item.id, 'workflow')}>
                        Open workflow
                    </LemonButton>
                ) : null
            }
        >
            {send && (
                <div className="flex flex-col gap-3">
                    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 m-0 text-sm">
                        <dt className="text-secondary">From</dt>
                        <dd className="m-0">
                            {send.step.fromName
                                ? `${send.step.fromName} <${send.step.fromAddress}>`
                                : send.step.fromAddress}
                        </dd>
                        <dt className="text-secondary">Preheader</dt>
                        <dd className="m-0">{send.preheader || <span className="text-muted">None</span>}</dd>
                        <dt className="text-secondary">Library template</dt>
                        <dd className="m-0">
                            {send.step.libraryTemplateName ? (
                                send.matchedBySubject ? (
                                    `${send.step.libraryTemplateName} (matched by subject, not linked)`
                                ) : (
                                    send.step.libraryTemplateName
                                )
                            ) : (
                                <span className="text-muted">Not linked</span>
                            )}
                        </dd>
                        <dt className="text-secondary">Category</dt>
                        <dd className="m-0">
                            <EmailCategoryTag categoryType={send.categoryType} categoryName={send.categoryName} />
                        </dd>
                    </dl>
                    {send.html ? (
                        <iframe
                            title="Email preview"
                            // An empty sandbox blocks scripts, forms and navigation in the email HTML.
                            sandbox=""
                            srcDoc={send.html}
                            className="w-full h-96 border rounded bg-white"
                        />
                    ) : (
                        <div className="text-muted">This step has no HTML body.</div>
                    )}
                </div>
            )}
        </LemonModal>
    )
}
