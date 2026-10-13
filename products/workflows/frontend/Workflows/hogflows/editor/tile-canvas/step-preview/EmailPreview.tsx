import { EmailPreviewThumbnail } from 'lib/components/EmailPreviewThumbnail/EmailPreviewThumbnail'

import type { EmailContent } from '../stepValues'

export function EmailPreview({ email, title }: { email: EmailContent; title: string }): JSX.Element | null {
    return email.html ? (
        <div className="flex justify-center overflow-hidden rounded-md border bg-white">
            <EmailPreviewThumbnail html={email.html} title={title} size="card" />
        </div>
    ) : null
}
