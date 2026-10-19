import { MOCK_DEFAULT_USER } from 'lib/api.mock'

import '@testing-library/jest-dom'

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expectLogic } from 'kea-test-utils'

import { FEATURE_FLAGS } from 'lib/constants'
import { integrationsLogic } from 'lib/integrations/integrationsLogic'
import { featureFlagLogic } from 'lib/logic/featureFlagLogic'
import { userLogic } from 'scenes/userLogic'

import { useMocks } from '~/mocks/jest'
import { initKeaTests } from '~/test/init'

import { messageTemplateLogic } from './messageTemplateLogic'
import { messageTemplateTestSendLogic } from './messageTemplateTestSendLogic'
import { SendTestEmailModal } from './SendTestEmailModal'

const sandbox = {
    id: 9,
    kind: 'email',
    display_name: 'Sandbox <sender@example.com>',
    config: { provider: 'sandbox', verified: true },
}

describe('SendTestEmailModal', () => {
    let logic: ReturnType<typeof messageTemplateTestSendLogic.build>
    let template: ReturnType<typeof messageTemplateLogic.build>

    beforeEach(() => {
        initKeaTests()
        featureFlagLogic.actions.setFeatureFlags([FEATURE_FLAGS.WORKFLOWS_SANDBOX_SENDER], {
            [FEATURE_FLAGS.WORKFLOWS_SANDBOX_SENDER]: true,
        })
    })
    afterEach(() => {
        cleanup()
        logic?.unmount()
        template?.unmount()
    })

    const openModal = (): void => {
        template = messageTemplateLogic({ id: 'new' })
        template.mount()
        template.actions.setTemplateValue('content.email.subject', 'Welcome')
        logic = messageTemplateTestSendLogic({ id: 'new' })
        logic.mount()
        logic.actions.setModalOpen(true)
        render(<SendTestEmailModal id="new" isOpen />)
    }

    it.each([
        [false, 'Verify your email address to send test emails to yourself.'],
        [true, null],
    ])('asks a signed-in user with verified=%s to verify their own address', async (verified, expected) => {
        useMocks({
            get: {
                '/api/projects/:team_id/integrations/': { results: [sandbox] },
                '/api/organizations/:organization_id/members/': { results: [] },
            },
        })
        userLogic.actions.loadUserSuccess({ ...MOCK_DEFAULT_USER, is_email_verified: verified })
        openModal()
        await expectLogic(logic).toFinishAllListeners()
        logic.actions.setRecipientEmail(MOCK_DEFAULT_USER.email.toUpperCase())

        await waitFor(() =>
            expect(screen.queryByText(/isn't among the verified members you can see/) !== null).toBe(verified)
        )
        expect(
            screen.queryByText('Verify your email address to send test emails to yourself.')?.textContent ?? null
        ).toBe(expected)
    })

    it.each([true, false])('distinguishes member loading from an empty list (%s)', async (loading) => {
        let releaseMembers: () => void = () => {}
        const gate = new Promise<void>((resolve) => {
            releaseMembers = resolve
        })
        useMocks({
            get: {
                '/api/projects/:team_id/integrations/': { results: [sandbox] },
                '/api/organizations/:organization_id/members/': async () => {
                    if (loading) {
                        await gate
                    }
                    return [200, { results: [] }]
                },
            },
        })
        openModal()
        if (!loading) {
            await expectLogic(logic).toFinishAllListeners()
        }
        fireEvent.focus(screen.getByPlaceholderText('you@example.com'))
        expect(document.querySelector('.LemonSkeleton') !== null).toBe(loading)
        expect(screen.queryByText('Type an email address and press Enter') !== null).toBe(!loading)
        releaseMembers()
        await expectLogic(logic).toFinishAllListeners()
    })

    it.each([404, 500])(
        'shows a %s setup error detail and retries through the integrations API',
        async (failureStatus) => {
            let requests = 0
            let status = failureStatus
            const detail = 'Sandbox sending is not configured. Try again.'
            useMocks({
                get: {
                    '/api/projects/:team_id/integrations/': () => [200, { results: status === 200 ? [sandbox] : [] }],
                    '/api/organizations/:organization_id/members/': { results: [] },
                },
                post: {
                    '/api/projects/:team_id/integrations/email_sandbox_sender/': () => {
                        requests++
                        return status === 200 ? [200, sandbox] : [status, { detail }]
                    },
                },
            })
            openModal()
            await expectLogic(integrationsLogic).toFinishAllListeners()
            await waitFor(() => expect(screen.getByText(detail)).toBeInTheDocument())
            expect(screen.queryByText('No email senders configured yet')).not.toBeInTheDocument()
            expect(screen.getByText('Connect email sender').closest('a')).toHaveAttribute(
                'href',
                '/project/997/workflows/channels'
            )
            status = 200
            fireEvent.click(screen.getAllByText('Try again')[0])
            await waitFor(() => expect(requests).toBe(2))
            await expectLogic(integrationsLogic).toFinishAllListeners()
            expect(screen.queryByText(detail)).not.toBeInTheDocument()
            logic.actions.setRecipientEmail('outside@example.com')
            await waitFor(() =>
                expect(
                    screen.getByText(
                        /isn't among the verified members you can see\. The sandbox sender may not deliver to it\. Add your own sender to email anyone\./
                    )
                ).toBeInTheDocument()
            )
        }
    )
    it('shows an integrations load failure with a retry instead of an empty sender list', async () => {
        let status = 500
        const detail = 'Could not load your senders. Try again.'
        useMocks({
            get: {
                '/api/projects/:team_id/integrations/': () =>
                    status === 200 ? [200, { results: [sandbox] }] : [status, { detail }],
                '/api/organizations/:organization_id/members/': { results: [] },
            },
        })
        openModal()
        await waitFor(() => expect(screen.getByText(detail)).toBeInTheDocument())
        expect(screen.queryByText('No email senders configured yet')).not.toBeInTheDocument()
        expect(screen.getByText('Connect email sender').closest('a')).toHaveAttribute(
            'href',
            '/project/997/workflows/channels'
        )
        status = 200
        fireEvent.click(screen.getAllByText('Try again')[0])
        await expectLogic(integrationsLogic).toFinishAllListeners()
        await waitFor(() => expect(screen.queryByText(detail)).not.toBeInTheDocument())
    })
})
