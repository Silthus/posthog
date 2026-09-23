import { combineUrl } from 'kea-router'

import { removeProjectIdIfPresent } from 'lib/utils/kea-router'
import { FeatureFlagsTab } from 'scenes/feature-flags/featureFlagsLogic'
import { SurveysTabs } from 'scenes/surveys/surveysLogic'
import { urls } from 'scenes/urls'

import { splitPath, unescapePath } from '~/layout/panel-layout/ProjectTree/utils'
import { getTreeItemsMetadata, getTreeItemsNew, getTreeItemsProducts } from '~/products'
import { FileSystemImport } from '~/queries/schema/schema-general'
import { ActivityTab, ExperimentsTabs, ReplayTabs, SavedInsightsTabs } from '~/types'

import { osAppForPath } from '../dock/osDockItems'
import type { OsApp } from '../store/osAppCatalog'

export interface OsAppMenuItem {
    label: string
    href: string
}

export interface OsAppMenu {
    app: OsApp
    /** The app's own pages, the same as the tabs the app shows. */
    pages: OsAppMenuItem[]
    /** The page the window shows, or null on a page the menu does not list, such as one insight. */
    activePage: OsAppMenuItem | null
    /** Other apps that belong with this one. They open in their own window. */
    relatedApps: OsAppMenuItem[]
    /** Things the app can create, from the product manifests. */
    newItems: OsAppMenuItem[]
}

type FeatureFlags = Record<string, boolean | string | undefined>

const tabOf = (href: string, tab: string): string => combineUrl(href, { tab }).url

/**
 * The pages of the apps that have a sub-navigation, keyed by the app's catalog key. The labels and the
 * order follow the tabs each app shows. A page must open in the same app, so a page that another app
 * owns (Dashboards) goes in `OS_RELATED_APPS` instead. Tabs behind a feature flag stay out.
 */
export const OS_APP_MENU_PAGES: Record<string, OsAppMenuItem[]> = {
    'Product analytics': [
        { label: 'All insights', href: urls.insights() },
        { label: 'My insights', href: urls.savedInsights(SavedInsightsTabs.Yours) },
        { label: 'Alerts', href: urls.alerts() },
        { label: 'Notifications', href: urls.savedInsights(SavedInsightsTabs.Notifications) },
        { label: 'History', href: urls.savedInsights(SavedInsightsTabs.History) },
    ],
    'Web analytics': [
        { label: 'Web analytics', href: urls.webAnalytics() },
        { label: 'Web vitals', href: urls.webAnalyticsWebVitals() },
        { label: 'Page reports', href: urls.webAnalyticsPageReports() },
        { label: 'Live', href: urls.webAnalyticsLive() },
        { label: 'Installation health', href: urls.webAnalyticsHealth() },
    ],
    'Session replay': [
        { label: 'Recordings', href: urls.replay(ReplayTabs.Home) },
        { label: 'Collections', href: urls.replay(ReplayTabs.Playlists) },
        { label: 'Comments', href: urls.replay(ReplayTabs.Comments) },
        { label: 'Filter templates', href: urls.replay(ReplayTabs.Templates) },
        { label: 'Settings', href: urls.replaySettings() },
    ],
    'Feature flags': [
        { label: 'Overview', href: urls.featureFlags() },
        { label: 'Projects', href: urls.featureFlags(FeatureFlagsTab.PROJECTS) },
        { label: 'History', href: urls.featureFlags(FeatureFlagsTab.HISTORY) },
    ],
    Experiments: [
        { label: 'Experiments', href: urls.experiments() },
        { label: 'Shared metrics', href: tabOf(urls.experiments(), ExperimentsTabs.SharedMetrics) },
        { label: 'Holdout groups', href: tabOf(urls.experiments(), ExperimentsTabs.Holdouts) },
        { label: 'History', href: tabOf(urls.experiments(), ExperimentsTabs.History) },
        { label: 'Settings', href: tabOf(urls.experiments(), ExperimentsTabs.Settings) },
    ],
    Surveys: [
        { label: 'Active', href: urls.surveys() },
        { label: 'Archived', href: urls.surveys(SurveysTabs.Archived) },
        { label: 'Notifications', href: urls.surveys(SurveysTabs.Notifications) },
        { label: 'History', href: urls.surveys(SurveysTabs.History) },
        { label: 'Settings', href: urls.surveys(SurveysTabs.Settings) },
    ],
    'Error tracking': [
        { label: 'Issues', href: urls.errorTracking() },
        { label: 'Insights', href: urls.errorTracking({ activeTab: 'insights' }) },
        { label: 'Configuration', href: urls.errorTrackingConfiguration() },
    ],
    'system:activity': [
        { label: 'Events', href: urls.activity(ActivityTab.ExploreEvents) },
        { label: 'Sessions', href: urls.activity(ActivityTab.ExploreSessions) },
        { label: 'Live', href: urls.activity(ActivityTab.LiveEvents) },
    ],
    'system:settings': [
        { label: 'Project', href: urls.settings('project') },
        { label: 'Organization', href: urls.settings('organization') },
        { label: 'Account', href: urls.settings('user') },
    ],
}

/** Apps that belong with another app, keyed by that app's catalog key. */
const OS_RELATED_APPS: Record<string, string[]> = {
    'Product analytics': ['Dashboards'],
}

interface ParsedHref {
    pathname: string
    params: URLSearchParams
}

function parseHref(href: string): ParsedHref {
    const url = new URL(removeProjectIdIfPresent(href), 'http://os.invalid')
    return { pathname: url.pathname.replace(/\/+$/, '') || '/', params: url.searchParams }
}

/**
 * The listed page a window shows: the page with the same path whose query the window's URL contains.
 * When several match, the page with the longest query wins, so `?tab=history` beats the page without a tab.
 */
function activePageOf(path: string, pages: OsAppMenuItem[]): OsAppMenuItem | null {
    const current = parseHref(path)
    let best: OsAppMenuItem | null = null
    let bestParams = -1
    for (const page of pages) {
        const { pathname, params } = parseHref(page.href)
        const entries = [...params.entries()]
        if (
            pathname === current.pathname &&
            entries.every(([key, value]) => current.params.get(key) === value) &&
            entries.length > bestParams
        ) {
            best = page
            bestParams = entries.length
        }
    }
    return best
}

function itemName(item: FileSystemImport): string {
    return item.displayLabel || unescapePath(splitPath(item.path).pop() ?? item.path)
}

/** What the app can create: the manifests' "new" items that open one of the app's scenes. */
function newItemsOf(app: OsApp, featureFlags: FeatureFlags): OsAppMenuItem[] {
    const treeItem = [...getTreeItemsProducts(), ...getTreeItemsMetadata()].find((item) => item.path === app.key)
    const sceneKeys = new Set(treeItem?.sceneKeys ?? [])
    if (!treeItem || sceneKeys.size === 0) {
        return []
    }
    return getTreeItemsNew()
        .filter(
            (item) =>
                !!item.href &&
                (!item.flag || !!featureFlags[item.flag]) &&
                ((item.sceneKeys ?? []).some((key) => sceneKeys.has(key)) ||
                    (!!item.type && item.type === treeItem.type))
        )
        .sort((a, b) => (a.visualOrder ?? Infinity) - (b.visualOrder ?? Infinity))
        .map((item) => ({ label: itemName(item), href: item.href as string }))
}

/**
 * The menu of the app a window shows, or null when no app claims the window's path. An app claims its
 * own link and every page it lists, and the longest match wins (see `osAppForPath`). Only the apps in
 * `apps` claim pages, so an app behind a feature flag that is off, or without access, gets no menu.
 */
export function osAppMenuFor(path: string | null, apps: OsApp[], featureFlags: FeatureFlags): OsAppMenu | null {
    if (!path) {
        return null
    }
    const claims = apps.flatMap((app) => [
        app,
        ...(OS_APP_MENU_PAGES[app.key] ?? []).map((page): OsApp => ({ ...app, href: page.href })),
    ])
    const owner = osAppForPath(path, claims)
    const app = owner && apps.find((candidate) => candidate.key === owner.key)
    if (!app) {
        return null
    }
    const pages = OS_APP_MENU_PAGES[app.key] ?? [{ label: app.name, href: app.href }]
    return {
        app,
        pages,
        activePage: activePageOf(path, pages),
        relatedApps: (OS_RELATED_APPS[app.key] ?? []).flatMap((key) => {
            const related = apps.find((candidate) => candidate.key === key)
            return related ? [{ label: related.name, href: related.href }] : []
        }),
        newItems: newItemsOf(app, featureFlags),
    }
}
