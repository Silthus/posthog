import { expectLogic } from 'kea-test-utils'

import api from 'lib/api'

import { FeatureFlagHealthQueryResponse, FeatureFlagHealthVerdict } from '~/queries/schema/schema-general'
import { initKeaTests } from '~/test/init'

import { featureFlagHealthLogic } from './featureFlagHealthLogic'

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: Error) => void } {
    let resolve!: (value: T) => void
    let reject!: (error: Error) => void
    const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
    })
    return { promise, resolve, reject }
}

const sevenDayResponse = {
    results: [
        {
            verdict: FeatureFlagHealthVerdict.Pass,
            reason: 'Both arms have enough exposed users and the excess is within tolerance.',
            on: { exposed: 900, affected: 2, rate: 2 / 900, bounds: { lower: 0, upper: 0.01 } },
            off: { exposed: 880, affected: 3, rate: 3 / 880, bounds: { lower: 0, upper: 0.01 } },
            excessBounds: { lower: -0.01, upper: 0.01 },
            crossovers: 0,
            exceptionsWithoutFlagState: 0,
            window: { date_from: '2026-10-05T00:00:00+00:00', date_to: '2026-10-12T00:00:00+00:00' },
            thresholds: { toleratedExcess: 0.01, minExposedPerArm: 300, alpha: 0.05 },
        },
    ],
} as FeatureFlagHealthQueryResponse

describe('featureFlagHealthLogic', () => {
    afterEach(() => jest.restoreAllMocks())

    it('shows the newer window result when the superseded request fails afterwards', async () => {
        const twentyFourHour = deferred<FeatureFlagHealthQueryResponse>()
        const sevenDay = deferred<FeatureFlagHealthQueryResponse>()
        jest.spyOn(api, 'query')
            .mockReturnValueOnce(twentyFourHour.promise as any)
            .mockReturnValueOnce(sevenDay.promise as any)
        initKeaTests()
        const logic = featureFlagHealthLogic({ flagKey: 'new-checkout' })
        logic.mount()

        logic.actions.setPeriod('7d')
        twentyFourHour.reject(new Error('Query failed'))
        sevenDay.resolve(sevenDayResponse)

        await expectLogic(logic).toFinishAllListeners().toMatchValues({
            period: '7d',
            loadFailed: false,
            healthResponseLoading: false,
            health: sevenDayResponse.results[0],
        })
        logic.unmount()
    })
})
