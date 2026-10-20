import { MessageHeader } from '@aws-sdk/client-sesv2'
import MailComposer from 'nodemailer/lib/mail-composer'
import Mail from 'nodemailer/lib/mailer'

export type EmailAttachment = {
    filename: string
    content: Buffer
    contentType?: string
    contentId?: string
}

export type RawEmail = {
    from: string
    to: string
    cc?: string[]
    bcc?: string[]
    replyTo?: string[]
    subject: string
    text?: string
    html?: string
    headers: MessageHeader[]
    attachments: EmailAttachment[]
}

export function composeRawEmail(email: RawEmail): Promise<Buffer> {
    return new MailComposer(toMailOptions(email)).compile().build()
}

function toMailOptions(email: RawEmail): Mail.Options {
    return {
        from: email.from,
        to: email.to,
        cc: email.cc,
        bcc: email.bcc,
        replyTo: email.replyTo,
        subject: email.subject,
        text: email.text,
        html: email.html,
        headers: email.headers.map(({ Name, Value }) => ({ key: Name ?? '', value: Value ?? '' })),
        attachments: email.attachments.map(toMailAttachment),
        // Attachments arrive from API callers, so a `path` or `href` must never make the worker read a file or fetch a URL.
        disableFileAccess: true,
        disableUrlAccess: true,
    }
}

function toMailAttachment({ filename, content, contentType, contentId }: EmailAttachment): Mail.Attachment {
    return { filename, content, contentType, cid: contentId }
}
