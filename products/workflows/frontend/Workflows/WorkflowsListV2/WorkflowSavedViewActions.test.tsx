import '@testing-library/jest-dom'

import { cleanup, render } from '@testing-library/react'

import { initKeaTests } from '~/test/init'

import { WorkflowSavedViewActions } from './WorkflowSavedViewActions'
import { BUILT_IN_WORKFLOW_VIEWS, SavedViewAction } from './workflowSavedViews'

describe('saved workflow view actions', () => {
    beforeEach(() => initKeaTests())
    afterEach(cleanup)

    it.each<[SavedViewAction, string]>([
        ['reset', 'workflows-combined-reset-view'],
        ['update', 'workflows-combined-update-view'],
        ['save-as', 'workflows-combined-save-as-new'],
    ])('spins only the button that started a pending %s', (pendingAction, startedBy) => {
        const { container } = render(
            <WorkflowSavedViewActions
                activeView={{ ...BUILT_IN_WORKFLOW_VIEWS[1], id: 'shared', name: 'Active flows', builtIn: false }}
                isModified
                hasAddedFilters={false}
                canUpdateActiveView
                activeViewChanges={['filters']}
                pendingAction={pendingAction}
                onReset={jest.fn()}
                onSaveAs={jest.fn()}
                onSave={jest.fn()}
                onRename={jest.fn()}
                onDelete={jest.fn()}
            />
        )
        const spinning = [...container.querySelectorAll('.LemonButton--loading')].map((button) =>
            button.getAttribute('data-attr')
        )
        expect(spinning).toEqual([startedBy])
    })
})
