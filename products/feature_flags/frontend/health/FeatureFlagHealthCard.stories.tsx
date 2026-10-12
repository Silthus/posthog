import type { Meta, StoryObj } from '@storybook/react'

import { mswDecorator } from '~/mocks/browser'
import {
    FeatureFlagHealthArm,
    FeatureFlagHealthQueryResponse,
    FeatureFlagHealthResult,
    FeatureFlagHealthVerdict,
} from '~/queries/schema/schema-general'

import { FeatureFlagHealthCard } from './FeatureFlagHealthCard'

function arm(exposed: number, affected: number, lower: number, upper: number): FeatureFlagHealthArm {
    return { exposed, affected, rate: exposed ? affected / exposed : null, bounds: { lower, upper } }
}

function healthResult(
    verdict: FeatureFlagHealthVerdict,
    reason: string,
    on: FeatureFlagHealthArm,
    off: FeatureFlagHealthArm
): FeatureFlagHealthResult {
    return {
        verdict,
        reason,
        on,
        off,
        excessBounds: { lower: on.bounds.lower - off.bounds.upper, upper: on.bounds.upper - off.bounds.lower },
        crossovers: 3,
        exceptionsWithoutFlagState: 12,
        window: { date_from: '2026-10-11T11:55:00+00:00', date_to: '2026-10-12T11:55:00+00:00' },
        thresholds: { toleratedExcess: 0.01, minExposedPerArm: 300, alpha: 0.05 },
    }
}

function respondWith(results: FeatureFlagHealthResult[]): Meta['decorators'] {
    const response: Partial<FeatureFlagHealthQueryResponse> = { results }
    return [
        mswDecorator({
            post: { '/api/environments/:team_id/query/:kind': () => [200, response] },
        }),
    ]
}

const meta: Meta<typeof FeatureFlagHealthCard> = {
    title: 'Scenes-App/Feature Flags/Health Card',
    component: FeatureFlagHealthCard,
    args: { flagKey: 'new-checkout' },
    render: (args) => (
        <div className="w-96">
            <FeatureFlagHealthCard {...args} />
        </div>
    ),
    parameters: {
        layout: 'padded',
        mockDate: '2026-10-12',
    },
}
export default meta

type Story = StoryObj<typeof FeatureFlagHealthCard>

export const Pass: Story = {
    decorators: respondWith([
        healthResult(
            FeatureFlagHealthVerdict.Pass,
            'Both arms have enough exposed users and the excess is within tolerance.',
            arm(5120, 21, 0.0023, 0.0067),
            arm(5084, 24, 0.0028, 0.0074)
        ),
    ]),
}

export const Harm: Story = {
    decorators: respondWith([
        healthResult(
            FeatureFlagHealthVerdict.Harm,
            'The flag-on affected-user rate exceeds the tolerated excess.',
            arm(1180, 52, 0.0312, 0.0601),
            arm(9850, 118, 0.0095, 0.0148)
        ),
    ]),
}

export const InsufficientData: Story = {
    decorators: respondWith([
        healthResult(
            FeatureFlagHealthVerdict.InsufficientData,
            'There is not enough evidence to establish harm or pass. Collect more exposures in both arms.',
            arm(42, 0, 0, 0.0991),
            arm(3980, 15, 0.0019, 0.0066)
        ),
    ]),
}

export const TelemetryFailure: Story = {
    decorators: respondWith([
        healthResult(
            FeatureFlagHealthVerdict.TelemetryFailure,
            'No browser event carries a boolean value for this flag in the window. Check flag evaluation.',
            arm(0, 0, 0, 1),
            arm(0, 0, 0, 1)
        ),
    ]),
}

export const NoResult: Story = {
    decorators: respondWith([]),
}

export const LoadError: Story = {
    decorators: [
        mswDecorator({
            post: { '/api/environments/:team_id/query/:kind': () => [500, { detail: 'Query failed' }] },
        }),
    ],
}
