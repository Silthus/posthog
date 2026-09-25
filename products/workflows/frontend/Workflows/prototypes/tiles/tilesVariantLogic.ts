// PROTOTYPE (throwaway): state for the tiles variant. The view and density persist in localStorage and the
// view also rides in the URL (`view=list|tiles`). Daily run counts load in one HogQL query for every
// workflow, and schedules load once for the scheduled workflows only.
import { MakeLogicType, actions, afterMount, connect, kea, listeners, path, reducers, selectors } from 'kea'
import { loaders } from 'kea-loaders'
import { actionToUrl, router, urlToAction } from 'kea-router'

import api from 'lib/api'
import { dayjs } from 'lib/dayjs'
import { urls } from 'scenes/urls'

import { hogql } from '~/queries/utils'

import type { HogFlowSchedule } from '../../hogflows/types'
import type { WorkflowListItem } from '../shared/workflowListItems'
import { workflowsPrototypeLogic } from '../shared/workflowsPrototypeLogic'

export type TilesViewMode = 'tiles' | 'list'
export type TilesDensity = 'compact' | 'comfortable'

export interface DailyActivity {
    succeeded: number[]
    failed: number[]
}

export interface ActivitySeries {
    /** Seven day labels, oldest first. */
    days: string[]
    byWorkflow: Record<string, DailyActivity>
}

const DAYS = 7
export const TILES_PAGE_SIZE = 36

function lastDays(): string[] {
    return Array.from({ length: DAYS }, (_, index) =>
        dayjs()
            .subtract(DAYS - 1 - index, 'day')
            .format('YYYY-MM-DD')
    )
}

interface tilesVariantLogicValues {
    viewMode: TilesViewMode
    density: TilesDensity
    peekId: string | null
    visibleCount: number
    activity: ActivitySeries | null
    activityLoading: boolean
    schedules: Record<string, HogFlowSchedule | null>
    schedulesLoading: boolean
    filteredItems: WorkflowListItem[]
    workflowItems: WorkflowListItem[]
    hasLoaded: boolean
    peekItem: WorkflowListItem | null
    visibleItems: WorkflowListItem[]
}

interface tilesVariantLogicActions {
    setViewMode: (viewMode: TilesViewMode) => { viewMode: TilesViewMode }
    setDensity: (density: TilesDensity) => { density: TilesDensity }
    openPeek: (id: string) => { id: string }
    closePeek: () => { value: true }
    showMore: () => { value: true }
    loadActivity: () => {}
    loadActivitySuccess: (activity: ActivitySeries | null) => { activity: ActivitySeries | null }
    loadActivityFailure: (error: string) => { error: string }
    loadSchedules: () => {}
    loadSchedulesSuccess: (schedules: Record<string, HogFlowSchedule | null>) => {
        schedules: Record<string, HogFlowSchedule | null>
    }
    loadSchedulesFailure: (error: string) => { error: string }
    loadSourcesSuccess: (sources: any) => { sources: any }
    setFilters: (filters: any) => { filters: any }
    addFilter: (filter: any) => { filter: any }
    removeFilter: (filter: any) => { filter: any }
    setSearch: (search: string) => { search: string }
    clearAll: () => { value: true }
}

type tilesVariantLogicType = MakeLogicType<tilesVariantLogicValues, tilesVariantLogicActions>

export const tilesVariantLogic = kea<tilesVariantLogicType>([
    path(['products', 'workflows', 'frontend', 'Workflows', 'prototypes', 'tiles', 'tilesVariantLogic']),
    connect(() => ({
        values: [workflowsPrototypeLogic, ['filteredItems', 'workflowItems', 'hasLoaded']],
        actions: [
            workflowsPrototypeLogic,
            ['loadSourcesSuccess', 'setFilters', 'addFilter', 'removeFilter', 'setSearch', 'clearAll'],
        ],
    })),
    actions({
        setViewMode: (viewMode: TilesViewMode) => ({ viewMode }),
        setDensity: (density: TilesDensity) => ({ density }),
        openPeek: (id: string) => ({ id }),
        closePeek: true,
        showMore: true,
    }),
    reducers({
        viewMode: ['tiles' as TilesViewMode, { persist: true }, { setViewMode: (_, { viewMode }) => viewMode }],
        density: ['comfortable' as TilesDensity, { persist: true }, { setDensity: (_, { density }) => density }],
        peekId: [null as string | null, { openPeek: (_, { id }) => id, closePeek: () => null }],
        visibleCount: [
            TILES_PAGE_SIZE,
            {
                showMore: (state) => state + TILES_PAGE_SIZE,
                setFilters: () => TILES_PAGE_SIZE,
                addFilter: () => TILES_PAGE_SIZE,
                removeFilter: () => TILES_PAGE_SIZE,
                setSearch: () => TILES_PAGE_SIZE,
                clearAll: () => TILES_PAGE_SIZE,
            },
        ],
    }),
    loaders(({ values }) => ({
        activity: [
            null as ActivitySeries | null,
            {
                loadActivity: async () => {
                    const days = lastDays()
                    const query = hogql`
                        SELECT app_source_id, toDate(timestamp) AS day, metric_name, sum(count)
                        FROM app_metrics
                        WHERE app_source = 'hog_flow'
                            AND metric_name IN ('succeeded', 'failed')
                            AND timestamp >= toDateTime(${days[0]})
                        GROUP BY app_source_id, day, metric_name
                        LIMIT 10000`
                    const response = await api.queryHogQL(query, { scene: 'Workflows', productKey: 'workflows' })
                    const byWorkflow: Record<string, DailyActivity> = {}
                    for (const [workflowId, day, metric, count] of (response.results ?? []) as [
                        string,
                        string,
                        string,
                        number,
                    ][]) {
                        const index = days.indexOf(String(day).slice(0, 10))
                        if (index < 0) {
                            continue
                        }
                        const entry = (byWorkflow[workflowId] ??= {
                            succeeded: Array(DAYS).fill(0),
                            failed: Array(DAYS).fill(0),
                        })
                        if (metric === 'succeeded' || metric === 'failed') {
                            entry[metric][index] += Number(count)
                        }
                    }
                    return { days, byWorkflow }
                },
            },
        ],
        schedules: [
            {} as Record<string, HogFlowSchedule | null>,
            {
                loadSchedules: async () => {
                    const scheduled = values.workflowItems.filter(
                        (item: WorkflowListItem) => item.triggerType === 'schedule'
                    )
                    const entries = await Promise.all(
                        scheduled.map(async (item) => {
                            try {
                                const schedules = await api.hogFlows.getHogFlowSchedules(item.id)
                                const list = (Array.isArray(schedules) ? schedules : (schedules as any)?.results) ?? []
                                return [item.id, (list[0] as HogFlowSchedule | undefined) ?? null] as const
                            } catch {
                                return [item.id, null] as const
                            }
                        })
                    )
                    return Object.fromEntries(entries)
                },
            },
        ],
    })),
    selectors({
        peekItem: [
            (s) => [s.peekId, s.filteredItems],
            (peekId, items): WorkflowListItem | null =>
                items.find((item: WorkflowListItem) => item.id === peekId) ?? null,
        ],
        visibleItems: [
            (s) => [s.filteredItems, s.visibleCount],
            (items, visibleCount): WorkflowListItem[] => items.slice(0, visibleCount),
        ],
    }),
    listeners(({ actions }) => ({
        loadSourcesSuccess: () => {
            actions.loadSchedules()
        },
    })),
    actionToUrl(({ values }) => ({
        setViewMode: () => {
            const searchParams = { ...router.values.searchParams, view: values.viewMode }
            return [router.values.location.pathname, searchParams, router.values.hashParams, { replace: true }]
        },
    })),
    urlToAction(({ actions, values }) => {
        const sync = (_: Record<string, string | undefined>, searchParams: Record<string, any>): void => {
            const view = searchParams.view
            if ((view === 'tiles' || view === 'list') && view !== values.viewMode) {
                actions.setViewMode(view)
            }
        }
        return { [urls.workflows()]: sync, [urls.workflows('workflows')]: sync }
    }),
    afterMount(({ actions, values }) => {
        actions.loadActivity()
        if (values.hasLoaded) {
            actions.loadSchedules()
        }
    }),
])
