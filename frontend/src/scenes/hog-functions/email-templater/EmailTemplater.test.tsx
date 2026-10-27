import '@testing-library/jest-dom'

import { cleanup, render, screen } from '@testing-library/react'
import { useValues } from 'kea'

import { NativeEmailIntegrationChoice } from './EmailTemplater'

let mockSenderRotationEnabled = false

jest.mock('lib/hooks/useFeatureFlag', () => ({
    useFeatureFlag: () => mockSenderRotationEnabled,
}))

jest.mock('kea', () => ({
    ...jest.requireActual('kea'),
    useValues: jest.fn(),
    useActions: () => ({ chooseSenders: jest.fn() }),
}))

jest.mock('@posthog/lemon-ui', () => ({
    ...jest.requireActual('@posthog/lemon-ui'),
    LemonInputSelect: ({ options }: { options: { key: string; label: string }[] }) => (
        <div data-attr="multiple-email-sender-select">
            {options.map((option) => (
                <span key={option.key}>{option.label}</span>
            ))}
        </div>
    ),
    LemonSelect: ({ options }: { options: { options: { value: number; label: string }[] }[] }) => (
        <div data-attr="single-email-sender-select">
            {options
                .flatMap((section) => section.options)
                .map((option) => (
                    <span key={option.value}>{option.label}</span>
                ))}
        </div>
    ),
}))

const ALICE = { id: 1, kind: 'email', display_name: 'Alice <alice@example.com>', config: { provider: 'ses' } }
const BOB = { id: 2, kind: 'email', display_name: 'Bob <bob@example.com>', config: { provider: 'ses' } }
const SANDBOX = {
    id: 3,
    kind: 'email',
    display_name: 'Acme via PostHog <hello@sandbox.example.com>',
    config: { provider: 'sandbox' },
}

describe('NativeEmailIntegrationChoice', () => {
    afterEach(cleanup)

    function mockPicker(values: Record<string, unknown>): void {
        jest.mocked(useValues).mockReturnValue({
            integrationsLoading: false,
            senderIntegrations: [ALICE, BOB],
            sandboxSenderId: undefined,
            isSandboxSenderSelected: false,
            logicProps: {},
            ...values,
        })
    }

    it.each([
        [false, 'single-email-sender-select'],
        [true, 'multiple-email-sender-select'],
    ])('renders the expected sender picker when the rotation flag is %s', (flagEnabled, expectedPicker) => {
        mockSenderRotationEnabled = flagEnabled
        mockPicker({})

        render(<NativeEmailIntegrationChoice label="From" value={{ integrationId: 1 }} onChange={jest.fn()} />)

        expect(screen.getByTestId(expectedPicker)).toBeInTheDocument()
        expect(screen.getByText('Custom sender')).toBeInTheDocument()
    })

    it.each([false, true])(
        'offers the sandbox sender the step lists, with its members-only note once selected, when the rotation flag is %s',
        (flagEnabled) => {
            mockSenderRotationEnabled = flagEnabled
            mockPicker({ senderIntegrations: [ALICE, SANDBOX], sandboxSenderId: 3, isSandboxSenderSelected: true })

            render(<NativeEmailIntegrationChoice label="From" value={{ integrationId: 3 }} onChange={jest.fn()} />)

            expect(screen.getByText(SANDBOX.display_name)).toBeInTheDocument()
            expect(screen.getByText('Delivers only to verified members of your organization.')).toBeInTheDocument()
            expect(screen.queryByText('Custom sender')).not.toBeInTheDocument()
        }
    )

    it('treats a step with no listed sender as having no email sender', () => {
        mockPicker({ senderIntegrations: [] })

        render(<NativeEmailIntegrationChoice label="From" value={{}} onChange={jest.fn()} />)

        expect(screen.getByText('No email senders configured yet')).toBeInTheDocument()
    })
})
