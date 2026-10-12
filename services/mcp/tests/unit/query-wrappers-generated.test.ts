import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { GENERATED_TOOL_MAP } from '@/tools/generated'
import { GENERATED_TOOLS } from '@/tools/generated/query-wrappers'
import { getToolDefinition } from '@/tools/toolDefinitions'
import type { Context } from '@/tools/types'

const flagHealthResult = {
    verdict: 'insufficient_data',
    reason: 'The flag-off arm has 120 exposed users; at least 300 are needed.',
    on: { exposed: 410, affected: 6, rate: 0.0146, bounds: { lower: 0.0054, upper: 0.0316 } },
    off: { exposed: 120, affected: 1, rate: 0.0083, bounds: { lower: 0.0002, upper: 0.0456 } },
    excessBounds: { lower: -0.0402, upper: 0.0314 },
    crossovers: 3,
    exceptionsWithoutFlagState: 7,
    window: { date_from: '2026-01-01T00:00:00Z', date_to: '2026-01-02T00:00:00Z' },
    thresholds: { toleratedExcess: 0.01, minExposedPerArm: 300, alpha: 0.05 },
}

function contextAnswering(results: unknown[]): { context: Context; runQuery: ReturnType<typeof vi.fn> } {
    const runQuery = vi.fn().mockResolvedValue({ results })
    const context = {
        api: {
            query: vi.fn().mockReturnValue({ runQuery }),
            getProjectBaseUrl: vi.fn().mockReturnValue('https://app.example.com/project/1'),
        },
        stateManager: { getProjectId: vi.fn().mockResolvedValue('1') },
    } as unknown as Context
    return { context, runQuery }
}

const behavioralFilter = {
    type: 'behavioral',
    value: 'performed_event',
    key: 'user invited',
    event_type: 'events',
    negation: true,
    time_value: 30,
    time_interval: 'day',
}

const insightQueries = [
    ['query-trends', { series: [{ kind: 'EventsNode', event: '$pageview' }] }],
    [
        'query-funnel',
        {
            series: [
                { kind: 'EventsNode', event: '$pageview' },
                { kind: 'EventsNode', event: 'user signed up' },
            ],
        },
    ],
    [
        'query-retention',
        {
            retentionFilter: {
                targetEntity: { type: 'events', id: '$pageview' },
                returningEntity: { type: 'events', id: '$pageview' },
            },
        },
    ],
    ['query-stickiness', { series: [{ kind: 'EventsNode', event: '$pageview' }] }],
    ['query-paths', { pathsFilter: {} }],
    ['query-lifecycle', { series: [{ kind: 'EventsNode', event: '$pageview' }] }],
] as const

describe('generated query wrappers', () => {
    it.each(insightQueries)('accepts behavioral filters for %s', (toolName, query) => {
        const tool = GENERATED_TOOLS[toolName]!()

        expect(tool.schema.safeParse({ ...query, properties: [behavioralFilter] }).success).toBe(true)
    })

    it('rejects unsupported behavioral count operators', () => {
        const tool = GENERATED_TOOLS['query-trends']!()

        expect(
            tool.schema.safeParse({
                ...insightQueries[0][1],
                properties: [
                    {
                        ...behavioralFilter,
                        value: 'performed_event_multiple',
                        operator: 'is_not',
                        operator_value: 2,
                    },
                ],
            }).success
        ).toBe(false)
    })

    it('does not advertise group aggregation for stickiness queries', () => {
        const querySchema = z.toJSONSchema(GENERATED_TOOLS['query-stickiness']!().schema, {
            io: 'input',
            reused: 'inline',
        })
        const actorsSchema = z.toJSONSchema(GENERATED_TOOLS['query-stickiness-actors']!().schema, {
            io: 'input',
            reused: 'inline',
        })

        expect(querySchema.properties).not.toHaveProperty('aggregation_group_type_index')
        expect(actorsSchema.properties?.source).not.toHaveProperty('properties.aggregation_group_type_index')
    })

    it('describes every trends display type it accepts', () => {
        const schema = z.toJSONSchema(GENERATED_TOOLS['query-trends']!().schema, { io: 'input', reused: 'inline' })
        const display = (schema.properties!.trendsFilter as any).properties.display
        // The MCP formatter and chart app ignore calendar_heatmap_data, so agents should not pick it yet.
        const undescribed = ['CalendarHeatmap']

        for (const value of display.enum.filter((v: string) => !undescribed.includes(v))) {
            expect(display.description).toContain(`\`${value}\` - `)
        }
        for (const unsupported of ['Auto', 'ScatterPlot', 'TwoDimensionalHeatmap']) {
            expect(display.enum).not.toContain(unsupported)
        }
    })

    it.each([
        ['zero interval count', 0, false],
        ['one interval', 1, true],
    ])('validates stickiness %s', (_case, intervalCount, expected) => {
        const tool = GENERATED_TOOLS['query-stickiness']!()

        expect(tool.schema.safeParse({ ...insightQueries[3][1], intervalCount }).success).toBe(expected)
    })

    it('answers flag health with the whole verdict and a link to the flag', async () => {
        const { context, runQuery } = contextAnswering([flagHealthResult])
        const tool = GENERATED_TOOL_MAP['query-feature-flag-health']!()

        const response = (await tool.handler(context, { flagKey: 'new-checkout' })) as Record<string, unknown>

        expect(runQuery).toHaveBeenCalledWith({
            query: expect.objectContaining({ kind: 'FeatureFlagHealthQuery', flagKey: 'new-checkout' }),
        })
        expect(response.results).toEqual([flagHealthResult])
        expect(response._posthogUrl).toBe('https://app.example.com/project/1/feature_flags?search=new-checkout')
        expect(getToolDefinition('query-feature-flag-health').required_scopes).toEqual([
            'query:read',
            'feature_flag:read',
        ])
    })
})
