import { MOCK_TEAM_ID } from 'lib/api.mock'

import { router } from 'kea-router'
import { expectLogic } from 'kea-test-utils'

import { urls } from 'scenes/urls'

import { customProductsLogic } from '~/layout/panel-layout/ProjectTree/customProductsLogic'
import { getDefaultTreeProducts } from '~/layout/panel-layout/ProjectTree/defaultTree'
import { useMocks } from '~/mocks/jest'
import { initKeaTests } from '~/test/init'

import { osFrameName } from '../bridge/osFrame'
import { osWindowsLogic } from '../windows/osWindowsLogic'
import { osAppPreviewLogic } from './osAppPreviewLogic'
import { osInstalledAppsLogic } from './osInstalledAppsLogic'
import { osStorePreviewApp } from './osStoreMessages'

describe('osAppPreviewLogic', () => {
    let logic: ReturnType<typeof osAppPreviewLogic.build>
    let writes: { product_path: string; enabled: boolean }[]
    let serverPaths: string[]

    const postPreview = (key: string): void => {
        const frame = document.createElement('iframe')
        document.body.appendChild(frame)
        const frameWindow = frame.contentWindow as Window
        frameWindow.name = osFrameName('store1')
        window.dispatchEvent(
            new MessageEvent('message', {
                data: osStorePreviewApp(key),
                origin: window.location.origin,
                source: frameWindow,
            })
        )
    }

    beforeEach(() => {
        localStorage.clear()
        sessionStorage.clear()
        writes = []
        serverPaths = []
        useMocks({
            get: {
                '/api/environments/:team_id/user_product_list/': () => [
                    200,
                    { results: serverPaths.map((product_path) => ({ id: product_path, product_path, enabled: true })) },
                ],
            },
            patch: {
                '/api/environments/:team_id/user_product_list/bulk_update/': async ({ request }) => {
                    const { items } = (await request.json()) as { items: typeof writes }
                    writes.push(...items)
                    return [200, { results: [] }]
                },
            },
        })
        initKeaTests()
        router.actions.push(`/project/${MOCK_TEAM_ID}${urls.os()}`)
        logic = osAppPreviewLogic()
        logic.mount()
    })

    afterEach(() => {
        logic?.unmount()
        document.body.innerHTML = ''
    })

    it('opens a preview window that installs nothing, and Install from its bar installs the app and hides the bar', async () => {
        await expectLogic(logic, () => postPreview('Surveys')).toFinishAllListeners()

        const [preview] = osWindowsLogic.values.windows
        expect(preview).toMatchObject({
            path: `/project/${MOCK_TEAM_ID}${urls.surveys()}`,
            title: 'Surveys',
            preview: 'Surveys',
        })
        expect(writes).toEqual([{ product_path: 'Surveys', enabled: false }])
        expect(logic.values.previewBarApps['Surveys']?.name).toEqual('Surveys')
        expect(osInstalledAppsLogic.values.installedKeys.has('Surveys')).toBe(false)
        expect(customProductsLogic.values.enabledToolPaths.has('Surveys')).toBe(false)

        await expectLogic(logic, () => {
            osInstalledAppsLogic.actions.installApp('Surveys')
        }).toFinishAllListeners()

        expect(writes).toEqual([
            { product_path: 'Surveys', enabled: false },
            { product_path: 'Surveys', enabled: true },
        ])
        expect(logic.values.previewBarApps['Surveys']).toBeUndefined()
        expect(customProductsLogic.values.enabledToolPaths.has('Surveys')).toBe(true)
    })

    it('leaves nothing behind when a preview closes', async () => {
        await expectLogic(logic, () => postPreview('Surveys')).toFinishAllListeners()

        osWindowsLogic.actions.closeWindow(osWindowsLogic.values.windows[0].id)
        await expectLogic(logic).toFinishAllListeners()

        expect(osWindowsLogic.values.windows).toEqual([])
        expect(writes.filter((write) => write.enabled)).toEqual([])
        expect(customProductsLogic.values.enabledToolPaths.has('Surveys')).toBe(false)
        expect(localStorage.getItem(`posthog-os-windows:${MOCK_TEAM_ID}`)).not.toContain('Surveys')
    })

    it('opens an app the server already lists as installed without a preview, and writes nothing', async () => {
        serverPaths = ['Surveys']

        await expectLogic(logic, () => postPreview('Surveys')).toFinishAllListeners()

        expect(osWindowsLogic.values.windows).toHaveLength(1)
        expect(osWindowsLogic.values.windows[0].preview).toBeUndefined()
        expect(writes).toEqual([])
    })

    it.each([
        [
            'an app behind a feature flag that is off',
            () => getDefaultTreeProducts().find((p) => p.flag && p.href)!.path,
        ],
        ['a system app', () => 'system:settings'],
        ['an unknown key', () => 'https://evil.example.com'],
    ])('opens no window for %s', async (_, key) => {
        await expectLogic(logic, () => postPreview(key())).toFinishAllListeners()

        expect(osWindowsLogic.values.windows).toEqual([])
        expect(writes).toEqual([])
    })
})
