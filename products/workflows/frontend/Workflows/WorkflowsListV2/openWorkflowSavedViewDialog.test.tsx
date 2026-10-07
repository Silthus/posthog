import '@testing-library/jest-dom'

import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ApiError } from 'lib/api-error'

import { initKeaTests } from '~/test/init'

import { openWorkflowSavedViewDialog } from './openWorkflowSavedViewDialog'

describe('saved workflow view dialog', () => {
    beforeEach(() => initKeaTests())

    afterEach(async () => {
        const cancel = screen.queryByRole('button', { name: 'Cancel' })
        if (cancel) {
            await userEvent.click(cancel)
            await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument())
        }
        cleanup()
    })

    it('shares one pending submit across repeated Enter presses and retains the name after failure', async () => {
        let fail: ((error: Error) => void) | undefined
        const pending = new Promise<void>((_, reject) => {
            fail = reject
        })
        const submit = jest
            .fn()
            .mockImplementationOnce(() => pending)
            .mockResolvedValue(undefined)
        act(() => openWorkflowSavedViewDialog(submit))
        const input = await screen.findByRole('textbox')
        await userEvent.type(input, 'Shared draft')
        await userEvent.keyboard('{Enter}{Enter}')
        expect(submit).toHaveBeenCalledTimes(1)
        await act(async () => {
            fail!(new ApiError('Name unavailable', 400))
        })
        expect(input).toBeInTheDocument()
        expect(input).toHaveValue('Shared draft')
        await userEvent.keyboard('{Enter}')
        await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument())
        expect(submit.mock.calls).toEqual([['Shared draft'], ['Shared draft']])
    })

    it('does not submit when Enter confirms an IME composition', async () => {
        const submit = jest.fn().mockResolvedValue(undefined)
        act(() => openWorkflowSavedViewDialog(submit, 'Shared draft'))
        const input = await screen.findByRole('textbox')
        fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
        expect(submit).not.toHaveBeenCalled()
        expect(input).toHaveValue('Shared draft')
        await userEvent.click(input)
        await userEvent.keyboard('{Enter}')
        await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument())
        expect(submit).toHaveBeenCalledWith('Shared draft')
    })
})
