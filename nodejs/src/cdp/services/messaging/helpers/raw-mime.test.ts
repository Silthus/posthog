import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import { Readable } from 'stream'

import { parseJSON } from '~/common/utils/json-parse'

import { MailDevAPI, mailDevTransport } from './maildev'
import { RawEmail, composeRawEmail } from './raw-mime'

const INVITE_ICS = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//example//spike//EN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    'UID:session-42@example.com',
    'DTSTART:20261101T180000Z',
    'DTEND:20261101T200000Z',
    'SUMMARY:Session 42',
    'ORGANIZER:mailto:gm@example.com',
    'ATTENDEE;RSVP=TRUE:mailto:player@example.com',
    'END:VEVENT',
    'END:VCALENDAR',
].join('\r\n')

const PDF_BYTES = Buffer.from(Array.from({ length: 256 * 1024 }, (_, i) => (i * 7919) % 256))

function inviteEmail(overrides: Partial<RawEmail> = {}): RawEmail {
    return {
        from: '"Next Session" <sessions@example.com>',
        to: 'player@example.com',
        bcc: ['audit@example.com'],
        replyTo: ['gm@example.com'],
        subject: 'You are invited: Session 42',
        text: 'You are invited to Session 42.',
        html: `<p>You are invited to Session 42.</p><p>${'a'.repeat(5000)}</p>`,
        headers: [
            { Name: 'X-PostHog-Tracking-Code', Value: 'signed.tracking.code' },
            { Name: 'Auto-Submitted', Value: 'auto-generated' },
        ],
        attachments: [
            {
                filename: 'invite.ics',
                content: Buffer.from(INVITE_ICS),
                contentType: 'text/calendar; method=REQUEST; charset=utf-8',
            },
            { filename: 'rules.pdf', content: PDF_BYTES, contentType: 'application/pdf' },
        ],
        ...overrides,
    }
}

function capturingSesClient(): { client: SESv2Client; sentBodies: string[] } {
    const sentBodies: string[] = []
    const client = new SESv2Client({
        region: 'us-east-1',
        credentials: { accessKeyId: 'AKIDSPIKE', secretAccessKey: 'spike-secret' },
        requestHandler: {
            handle: (request: { body: string }) => {
                sentBodies.push(request.body)
                return Promise.resolve({
                    response: {
                        statusCode: 200,
                        headers: { 'content-type': 'application/json' },
                        body: Readable.from([Buffer.from(JSON.stringify({ MessageId: 'spike-message-id' }))]),
                    },
                })
            },
            updateHttpClientConfig: () => {},
            httpHandlerConfigs: () => ({}),
        } as any,
    })
    return { client, sentBodies }
}

function topLevelHeaders(mime: string): string {
    return mime.slice(0, mime.indexOf('\r\n\r\n'))
}

describe('composeRawEmail', () => {
    it('sends SES a raw MIME message that keeps the calendar invite, the attachment and our headers', async () => {
        const email = inviteEmail()
        const { client, sentBodies } = capturingSesClient()

        const response = await client.send(
            new SendEmailCommand({
                FromEmailAddress: email.from,
                Destination: { ToAddresses: [email.to], BccAddresses: email.bcc },
                Content: { Raw: { Data: await composeRawEmail(email) } },
                ConfigurationSetName: 'tracked',
                TenantName: 'team-1',
                EmailTags: [{ Name: 'ph_id', Value: 'short-code' }],
            })
        )

        expect(response.MessageId).toBe('spike-message-id')
        const request = parseJSON(sentBodies[0])
        expect(request).toMatchObject({ ConfigurationSetName: 'tracked', TenantName: 'team-1' })
        const mime = Buffer.from(request.Content.Raw.Data, 'base64').toString('utf8')
        const headers = topLevelHeaders(mime)

        expect(headers).toMatch(/^Content-Type: multipart\/mixed;/m)
        // Nodemailer writes `X-Posthog-Tracking-Code`. The SES webhook matches the name case-insensitively.
        expect(headers).toMatch(/^X-PostHog-Tracking-Code: signed\.tracking\.code$/im)
        expect(headers).toMatch(/^Auto-Submitted: auto-generated$/m)
        expect(headers).toMatch(/^Reply-To: gm@example\.com$/m)
        expect(headers).not.toMatch(/^Bcc:/im)
        expect(mime).toMatch(/Content-Type: multipart\/alternative;/)
        expect(mime).toMatch(/Content-Type: text\/calendar; method=REQUEST; charset=utf-8; name=invite\.ics/)
        expect(mime).toMatch(/Content-Disposition: attachment; filename=invite\.ics/)
        expect(mime).toMatch(/Content-Type: application\/pdf; name=rules\.pdf/)
        expect(mime.split('\r\n').every((line) => line.length <= 998)).toBe(true)
    })

    it('costs about 4/3 of the attachment bytes in MIME and 16/9 on the SES wire', async () => {
        const email = inviteEmail({ attachments: [{ filename: 'rules.pdf', content: PDF_BYTES }] })
        const { client, sentBodies } = capturingSesClient()
        const raw = await composeRawEmail(email)

        await client.send(new SendEmailCommand({ Content: { Raw: { Data: raw } } }))

        expect(raw.length / PDF_BYTES.length).toBeGreaterThan(1.33)
        expect(raw.length / PDF_BYTES.length).toBeLessThan(1.4)
        expect(sentBodies[0].length / PDF_BYTES.length).toBeGreaterThan(1.77)
        expect(sentBodies[0].length / PDF_BYTES.length).toBeLessThan(1.9)
    })

    it('arrives in maildev with the invite and the attachment', async () => {
        const mailDev = new MailDevAPI()
        await mailDev.clearEmails()
        const email = inviteEmail({ bcc: undefined })

        await mailDevTransport!.sendMail({
            envelope: { from: 'sessions@example.com', to: [email.to] },
            raw: await composeRawEmail(email),
        })

        const [received] = await mailDev.getEmails()
        expect(received.subject).toBe('You are invited: Session 42')
        expect(received.headers['x-posthog-tracking-code']).toBe('signed.tracking.code')
        expect(
            received.attachments.map((a: { fileName: string; contentType: string }) => [a.fileName, a.contentType])
        ).toEqual([
            ['invite.ics', 'text/calendar'],
            ['rules.pdf', 'application/pdf'],
        ])
    })
})
