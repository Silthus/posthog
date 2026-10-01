import { urls } from 'scenes/urls'

import type { MessagingNavTabKey } from '../messagingTabs'

/** Tabs that leave Workflows and Broadcasts for Audience while the workflows-audience flag is on. */
const MOVED_TABS: Partial<Record<MessagingNavTabKey, 'topics' | 'suppression'>> = {
    'opt-outs': 'topics',
    suppression: 'suppression',
}

export function isTabMovedToAudience(tab: string): tab is keyof typeof MOVED_TABS {
    return tab in MOVED_TABS
}

export function audienceUrlForMovedTab(tab: keyof typeof MOVED_TABS): string {
    return urls.audience(MOVED_TABS[tab])
}
