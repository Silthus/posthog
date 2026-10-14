import { router } from 'kea-router'
import { expectLogic } from 'kea-test-utils'

import { removeProjectIdIfPresent } from 'lib/utils/kea-router'
import { urls } from 'scenes/urls'

import { useMocks } from '~/mocks/jest'
import { initKeaTests } from '~/test/init'

import { apiSendsSceneLogic } from './apiSendsSceneLogic'

const API_SENDS_FLOW_ID = '01a13a4d-0000-0000-0000-000000000001'
const ORDINARY_FLOW_ID = '01a13a4d-0000-0000-0000-000000000002'

describe('apiSendsSceneLogic', () => {
    let logic: ReturnType<typeof apiSendsSceneLogic.build>
    let hasApiSendsFlow: boolean
    let writeRequests: jest.Mock

    beforeEach(() => {
        writeRequests = jest.fn(() => [201, {}])
        useMocks({
            get: {
                '/api/projects/:team_id/hog_flows/': ({ request }) => {
                    const ids =
                        new URL(request.url).searchParams.get('type') === 'api_send'
                            ? hasApiSendsFlow
                                ? [API_SENDS_FLOW_ID]
                                : []
                            : [ORDINARY_FLOW_ID]
                    return [200, { count: ids.length, results: ids.map((id) => ({ id })) }]
                },
            },
            post: { '/api/projects/:team_id/hog_flows/': writeRequests },
            patch: { '/api/projects/:team_id/hog_flows/:id/': writeRequests },
        })
        initKeaTests()
    })

    const openApiSendsLink = async (): Promise<void> => {
        router.actions.push(urls.workflowsApiSends())
        logic = apiSendsSceneLogic()
        logic.mount()
        await expectLogic(logic).toFinishAllListeners()
    }

    afterEach(() => {
        logic?.unmount()
    })

    it('replaces the link with the API sends workflow invocations', async () => {
        hasApiSendsFlow = true

        await openApiSendsLink()

        expect(removeProjectIdIfPresent(router.values.location.pathname)).toBe(
            `/workflows/${API_SENDS_FLOW_ID}/invocations`
        )
        expect(router.values.lastMethod).toBe('REPLACE')
    })

    it('shows the empty state without creating the workflow when no email went through the API', async () => {
        hasApiSendsFlow = false

        await openApiSendsLink()

        expect(logic.values.resolution).toBe('empty')
        expect(removeProjectIdIfPresent(router.values.location.pathname)).toBe('/workflows/api-sends')
        expect(writeRequests).not.toHaveBeenCalled()
    })
})
