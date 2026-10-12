import { expectLogic } from 'kea-test-utils'
import posthog from 'posthog-js'

import api from 'lib/api'

import { sidePanelStateLogic } from '~/layout/navigation-3000/sidepanel/sidePanelStateLogic'
import {
    FeatureFlagHealthQueryResponse,
    FeatureFlagHealthResult,
    FeatureFlagHealthVerdict,
} from '~/queries/schema/schema-general'
import { initKeaTests } from '~/test/init'
import { SidePanelTab } from '~/types'

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

function responseWith(verdict: FeatureFlagHealthVerdict): FeatureFlagHealthQueryResponse {
    return { results: [{ ...sevenDayResponse.results[0], verdict }] } as FeatureFlagHealthQueryResponse
}

async function mountWithSevenDayHealth(
    response: FeatureFlagHealthQueryResponse
): Promise<ReturnType<typeof featureFlagHealthLogic>> {
    jest.spyOn(api, 'query').mockResolvedValue(response as any)
    initKeaTests()
    sidePanelStateLogic.mount()
    const logic = featureFlagHealthLogic({ flagKey: 'new-checkout' })
    logic.mount()
    logic.actions.setPeriod('7d')
    await expectLogic(logic).toFinishAllListeners()
    return logic
}

describe('featureFlagHealthLogic', () => {
    afterEach(() => jest.restoreAllMocks())

    it.each([
        [FeatureFlagHealthVerdict.Harm, true],
        [FeatureFlagHealthVerdict.Pass, true],
        [FeatureFlagHealthVerdict.InsufficientData, true],
        [FeatureFlagHealthVerdict.TelemetryFailure, false],
    ])('offers investigation for a %s verdict: %s', async (verdict, expected) => {
        const logic = await mountWithSevenDayHealth(responseWith(verdict))

        expect(logic.values.canInvestigate).toBe(expected)
        logic.unmount()
    })

    it('offers no investigation without a health result', async () => {
        const logic = await mountWithSevenDayHealth({
            results: [] as FeatureFlagHealthResult[],
        } as FeatureFlagHealthQueryResponse)

        expect(logic.values.canInvestigate).toBe(false)
        logic.unmount()
    })

    it('links to error tracking filtered to flag-on exceptions over the selected period', async () => {
        const logic = await mountWithSevenDayHealth(sevenDayResponse)

        const url = new URL(logic.values.errorTrackingUrl, 'https://app.example.com')

        expect(url.pathname).toBe('/error_tracking')
        expect(JSON.parse(url.searchParams.get('dateRange')!)).toEqual({ date_from: '-7d', date_to: null })
        expect(JSON.stringify(JSON.parse(url.searchParams.get('filterGroup')!))).toContain(
            JSON.stringify({ key: '$feature/new-checkout', value: ['true'], operator: 'exact', type: 'event' })
        )
        logic.unmount()
    })

    it('captures a usage event when someone views the errors', async () => {
        const capture = jest.spyOn(posthog, 'capture')
        const logic = await mountWithSevenDayHealth(sevenDayResponse)

        logic.actions.viewErrors()

        expect(capture).toHaveBeenCalledWith('feature flag health errors viewed', { period: '7d', verdict: 'pass' })
        logic.unmount()
    })

    it('opens PostHog AI with a prompt that carries the flag, period, verdict and both arms', async () => {
        const capture = jest.spyOn(posthog, 'capture')
        const logic = await mountWithSevenDayHealth(sevenDayResponse)

        logic.actions.investigateWithAI()

        expect(sidePanelStateLogic.values.selectedTab).toBe(SidePanelTab.Max)
        const prompt = sidePanelStateLogic.values.selectedTabOptions as string
        expect(prompt.startsWith('!')).toBe(true)
        for (const fact of ['new-checkout', 'last 7 days', 'Healthy', '2 of 900', '0.2%', '3 of 880', '0.3%']) {
            expect(prompt).toContain(fact)
        }
        expect(capture).toHaveBeenCalledWith('feature flag health ai investigation started', {
            period: '7d',
            verdict: 'pass',
        })
        logic.unmount()
    })

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
