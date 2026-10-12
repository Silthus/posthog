// PROTOTYPE (rethink lane, Silthus/personal#36). Invented authorship data for the "built by AI / changed since" cue.
export type Provenance = {
    builtBy: string
    builtOn: string
    reviewed: boolean
    lastLookedOn: string
    changedBy: string
    changedOn: string
    changedStepIds: string[]
    changeNotes: Record<string, string>
    versions: { label: string; summary: string; by: string; on: string; byAi: boolean }[]
    aiConversation: { from: 'you' | 'ai'; text: string }[]
}

export const PROTOTYPE_PROVENANCE: Record<string, Provenance> = {
    'prototype-larkspur-launch-ab-test': {
        builtBy: 'Claude Code via MCP',
        builtOn: 'Sep 2',
        reviewed: false,
        lastLookedOn: 'Sep 3',
        changedBy: 'PostHog AI',
        changedOn: 'Sep 4',
        changedStepIds: ['offer_email', 'offer_follow_up'],
        changeNotes: {
            offer_email: 'subject now names the discount',
            offer_follow_up: 'subject now says the code ends tomorrow',
        },
        versions: [
            {
                label: 'v3',
                summary: 'Reworded both Offer-led emails',
                by: 'PostHog AI',
                on: 'Sep 4, 12:00',
                byAi: true,
            },
            {
                label: 'v2',
                summary: 'Added a 5-day wait for a purchase before each follow-up',
                by: 'Claude Code via MCP',
                on: 'Sep 2, 16:40',
                byAi: true,
            },
            {
                label: 'v1',
                summary: 'Created the workflow with three email variants',
                by: 'Claude Code via MCP',
                on: 'Sep 2, 16:12',
                byAi: true,
            },
        ],
        aiConversation: [
            { from: 'you', text: 'Make the Offer-led emails mention the discount up front.' },
            {
                from: 'ai',
                text: 'Done. I changed the subject of the Offer-led launch email and its follow-up. Both are highlighted on the overview so you can check them.',
            },
            { from: 'you', text: 'Who actually gets the Offer-led email?' },
        ],
    },
    'prototype-fernwood-welcome': {
        builtBy: 'PostHog AI',
        builtOn: 'Sep 1',
        reviewed: true,
        lastLookedOn: 'Sep 3',
        changedBy: 'PostHog AI',
        changedOn: 'Sep 1',
        changedStepIds: [],
        changeNotes: {},
        versions: [
            {
                label: 'v1',
                summary: 'Created a two-email welcome series',
                by: 'PostHog AI',
                on: 'Sep 1, 09:00',
                byAi: true,
            },
        ],
        aiConversation: [
            { from: 'you', text: 'Set up a welcome series for newsletter signups.' },
            {
                from: 'ai',
                text: 'I created a draft with a welcome email right away and a getting-started guide two days later.',
            },
        ],
    },
    'prototype-regional-season-opener': {
        builtBy: 'Codex via MCP',
        builtOn: 'Aug 30',
        reviewed: false,
        lastLookedOn: 'Sep 1',
        changedBy: 'Codex via MCP',
        changedOn: 'Sep 3',
        changedStepIds: ['south_guest_camping_email', 'west_member_hiking_nudge'],
        changeNotes: {
            south_guest_camping_email: 'new subject line',
            west_member_hiking_nudge: 'new body copy',
        },
        versions: [
            { label: 'v4', summary: 'Edited two season emails', by: 'Codex via MCP', on: 'Sep 3, 10:05', byAi: true },
            {
                label: 'v3',
                summary: 'Added a 3-day nudge after every season email',
                by: 'Codex via MCP',
                on: 'Aug 30, 15:20',
                byAi: true,
            },
            {
                label: 'v2',
                summary: 'Split each region by tier and interest',
                by: 'Codex via MCP',
                on: 'Aug 30, 15:02',
                byAi: true,
            },
            { label: 'v1', summary: 'Created the workflow', by: 'Codex via MCP', on: 'Aug 30, 14:51', byAi: true },
        ],
        aiConversation: [
            { from: 'you', text: 'Why are there so many paths in this one?' },
            {
                from: 'ai',
                text: 'It splits by region, then tier, then interest: 16 paths. Each gets a season email and a nudge three days later if they have not opened the trail guide.',
            },
        ],
    },
}
