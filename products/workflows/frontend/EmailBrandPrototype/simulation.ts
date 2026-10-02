// PROTOTYPE (throwaway): an in-memory fake of the Email brand backend (GitHub, detection, template creation).
// Every click-through variant drives this one hook, so a variant is only a different way to render it.
import { useCallback, useEffect, useMemo, useState } from 'react'

import { LOGO_CANDIDATES, PrototypeLogo, UPLOADED_LOGO } from './shared/logos'

export type EntryKey = 'library' | 'channels'
export type GitHubKey = 'connected' | 'not_connected'
export type ReposKey = 'many' | 'monorepo' | 'single'
export type OutcomeKey = 'full' | 'partial' | 'nothing'
export type RedetectKey = 'ask' | 'overwrite' | 'keep'
export type SpeedKey = 1 | 4

export interface BrandScenario {
    entry: EntryKey
    github: GitHubKey
    repos: ReposKey
    outcome: OutcomeKey
    redetect: RedetectKey
    speed: SpeedKey
}

export const SCENARIO_LABELS = {
    entry: { library: 'Start: template library', channels: 'Start: Channels page' },
    github: { connected: 'GitHub: connected', not_connected: 'GitHub: not connected' },
    repos: { many: 'Repos: many', monorepo: 'Repos: mono-repo', single: 'Repos: just one' },
    outcome: { full: 'Finds: everything', partial: 'Finds: some', nothing: 'Finds: nothing' },
    redetect: {
        ask: 'Detect again: ask per value',
        overwrite: 'Detect again: overwrite',
        keep: 'Detect again: keep edits',
    },
} as const

export interface PrototypeRepo {
    fullName: string
    description: string
    language: string
    pushedAgo: string
    private: boolean
    suggested: boolean
    suggestedWhy: string[]
    apps: PrototypeApp[]
}

export interface PrototypeApp {
    path: string
    framework: string
    suggested: boolean
    why: string
}

const WEB_APPS: PrototypeApp[] = [
    {
        path: 'apps/web',
        framework: 'Next.js',
        suggested: true,
        why: 'The customer-facing app: has a manifest and a logo',
    },
    { path: 'apps/admin', framework: 'Vite + React', suggested: false, why: 'Internal tool, no manifest' },
    { path: 'apps/docs', framework: 'Docusaurus', suggested: false, why: 'Docs site, own theme' },
    { path: 'packages/ui', framework: 'Component library', suggested: false, why: 'Shared components, no app shell' },
]

const REPOS: Record<ReposKey, PrototypeRepo[]> = {
    many: [
        {
            fullName: 'acme/acme-web',
            description: 'The Acme web app',
            language: 'TypeScript',
            pushedAgo: '2 hours ago',
            private: true,
            suggested: true,
            suggestedWhy: [
                'Named like your project, Acme',
                'Pushed to 2 hours ago',
                'Has a web app with a manifest and a logo',
            ],
            apps: [],
        },
        {
            fullName: 'acme/acme-api',
            description: 'Public API',
            language: 'Go',
            pushedAgo: '3 hours ago',
            private: true,
            suggested: false,
            suggestedWhy: [],
            apps: [],
        },
        {
            fullName: 'acme/marketing-site',
            description: 'acme.com',
            language: 'Astro',
            pushedAgo: 'yesterday',
            private: false,
            suggested: false,
            suggestedWhy: [],
            apps: [],
        },
        {
            fullName: 'acme/acme-docs',
            description: 'docs.acme.com',
            language: 'MDX',
            pushedAgo: '4 days ago',
            private: false,
            suggested: false,
            suggestedWhy: [],
            apps: [],
        },
        {
            fullName: 'acme/mobile',
            description: 'iOS and Android apps',
            language: 'Swift',
            pushedAgo: 'last week',
            private: true,
            suggested: false,
            suggestedWhy: [],
            apps: [],
        },
        {
            fullName: 'acme/infra',
            description: 'Terraform',
            language: 'HCL',
            pushedAgo: '2 weeks ago',
            private: true,
            suggested: false,
            suggestedWhy: [],
            apps: [],
        },
        {
            fullName: 'jane-doe/dotfiles',
            description: '',
            language: 'Shell',
            pushedAgo: 'a month ago',
            private: false,
            suggested: false,
            suggestedWhy: [],
            apps: [],
        },
    ],
    monorepo: [
        {
            fullName: 'acme/acme',
            description: 'Everything Acme, one repo',
            language: 'TypeScript',
            pushedAgo: '20 minutes ago',
            private: true,
            suggested: true,
            suggestedWhy: [
                'Named like your project, Acme',
                'Pushed to 20 minutes ago',
                'Has 4 apps, one looks customer-facing',
            ],
            apps: WEB_APPS,
        },
        {
            fullName: 'acme/infra',
            description: 'Terraform',
            language: 'HCL',
            pushedAgo: '2 weeks ago',
            private: true,
            suggested: false,
            suggestedWhy: [],
            apps: [],
        },
        {
            fullName: 'jane-doe/dotfiles',
            description: '',
            language: 'Shell',
            pushedAgo: 'a month ago',
            private: false,
            suggested: false,
            suggestedWhy: [],
            apps: [],
        },
    ],
    single: [
        {
            fullName: 'acme/acme-web',
            description: 'The Acme web app',
            language: 'TypeScript',
            pushedAgo: '2 hours ago',
            private: true,
            suggested: true,
            suggestedWhy: ['The only repo PostHog can see'],
            apps: [],
        },
    ],
}

export type BrandFieldKey =
    | 'name'
    | 'logo'
    | 'primaryColor'
    | 'accentColor'
    | 'textColor'
    | 'backgroundColor'
    | 'fontFamily'

export const BRAND_FIELD_LABELS: Record<BrandFieldKey, string> = {
    name: 'Brand name',
    logo: 'Logo',
    primaryColor: 'Primary color',
    accentColor: 'Accent color',
    textColor: 'Text color',
    backgroundColor: 'Background color',
    fontFamily: 'Font',
}

export const BRAND_FIELD_ORDER: BrandFieldKey[] = [
    'name',
    'logo',
    'primaryColor',
    'accentColor',
    'textColor',
    'backgroundColor',
    'fontFamily',
]

export interface BrandSignal {
    file: string
    snippet: string
}

export interface BrandValues {
    name: string
    logo: PrototypeLogo | null
    primaryColor: string
    accentColor: string
    textColor: string
    backgroundColor: string
    fontFamily: string
}

export const FALLBACK_BRAND: BrandValues = {
    name: '',
    logo: null,
    primaryColor: '#1D4ED8',
    accentColor: '#F59E0B',
    textColor: '#111827',
    backgroundColor: '#FFFFFF',
    fontFamily: 'Helvetica, Arial, sans-serif',
}

export const FONT_OPTIONS = [
    'Inter, Helvetica, Arial, sans-serif',
    'Helvetica, Arial, sans-serif',
    'Georgia, Times New Roman, serif',
    'Courier New, monospace',
    'Trebuchet MS, sans-serif',
]

export interface DetectionStep {
    file: string
    label: string
    status: 'todo' | 'reading' | 'found' | 'empty'
    found: Partial<Record<BrandFieldKey, string>>
}

interface DetectionPlan {
    steps: Array<{
        file: string
        label: string
        values: Partial<BrandValues>
        snippets: Partial<Record<BrandFieldKey, string>>
    }>
}

const prefixed = (appPath: string | null, file: string): string => (appPath ? `${appPath}/${file}` : file)

const planFor = (outcome: OutcomeKey, appPath: string | null, secondPass: boolean): DetectionPlan => {
    const p = (file: string): string => prefixed(appPath, file)
    const primary = secondPass ? '#2563EB' : '#1D4ED8'
    const full: DetectionPlan = {
        steps: [
            {
                file: p('package.json'),
                label: 'Package name',
                values: { name: 'Acme' },
                snippets: { name: '"name": "acme-web"' },
            },
            {
                file: p('public/manifest.json'),
                label: 'Web app manifest',
                values: { name: 'Acme', primaryColor: primary, backgroundColor: '#FFFFFF' },
                snippets: {
                    name: '"name": "Acme"',
                    primaryColor: `"theme_color": "${primary}"`,
                    backgroundColor: '"background_color": "#FFFFFF"',
                },
            },
            {
                file: p('tailwind.config.ts'),
                label: 'Tailwind theme',
                values: {
                    primaryColor: primary,
                    accentColor: '#F59E0B',
                    fontFamily: 'Inter, Helvetica, Arial, sans-serif',
                },
                snippets: {
                    primaryColor: `primary: '${primary}'`,
                    accentColor: "accent: '#F59E0B'",
                    fontFamily: "sans: ['Inter', 'Helvetica', 'Arial', 'sans-serif']",
                },
            },
            {
                file: p('src/styles/globals.css'),
                label: 'Global styles',
                values: { textColor: '#111827' },
                snippets: { textColor: '--color-text: #111827;' },
            },
            {
                file: p('public/logo.svg'),
                label: 'Logo files',
                values: { logo: LOGO_CANDIDATES[0] },
                snippets: { logo: 'public/logo.svg, 480×120, SVG' },
            },
            { file: 'README.md', label: 'Readme', values: {}, snippets: {} },
        ],
    }
    if (outcome === 'full') {
        return full
    }
    if (outcome === 'partial') {
        return {
            steps: [
                {
                    file: p('package.json'),
                    label: 'Package name',
                    values: { name: 'Acme' },
                    snippets: { name: '"name": "acme-web"' },
                },
                {
                    file: p('public/manifest.json'),
                    label: 'Web app manifest',
                    values: { primaryColor: primary, backgroundColor: '#FFFFFF' },
                    snippets: {
                        primaryColor: `"theme_color": "${primary}"`,
                        backgroundColor: '"background_color": "#FFFFFF"',
                    },
                },
                { file: p('tailwind.config.ts'), label: 'Tailwind theme', values: {}, snippets: {} },
                { file: p('src/styles/globals.css'), label: 'Global styles', values: {}, snippets: {} },
                { file: p('public/favicon.ico'), label: 'Logo files', values: {}, snippets: {} },
                { file: 'README.md', label: 'Readme', values: {}, snippets: {} },
            ],
        }
    }
    return {
        steps: full.steps.map((step) => ({ ...step, values: {}, snippets: {} })),
    }
}

export type BrandPhase = 'entry' | 'connect' | 'repo' | 'app' | 'detecting' | 'review' | 'creating' | 'editor'

export interface FieldConflict {
    key: BrandFieldKey
    detected: string | PrototypeLogo | null
    snippet: string
    file: string
}

export interface BrandState {
    phase: BrandPhase
    githubConnected: boolean
    installOverlayOpen: boolean
    installing: boolean
    selectedRepo: string | null
    selectedApp: string | null
    detectionSteps: DetectionStep[]
    detectionRuns: number
    brand: BrandValues
    sources: Partial<Record<BrandFieldKey, BrandSignal>>
    edited: BrandFieldKey[]
    conflicts: FieldConflict[]
    brandSaved: boolean
    templateName: string
    lastUndo: {
        brand: BrandValues
        sources: Partial<Record<BrandFieldKey, BrandSignal>>
        edited: BrandFieldKey[]
    } | null
    events: string[]
}

const initialState = (): BrandState => ({
    phase: 'entry',
    githubConnected: false,
    installOverlayOpen: false,
    installing: false,
    selectedRepo: null,
    selectedApp: null,
    detectionSteps: [],
    detectionRuns: 0,
    brand: FALLBACK_BRAND,
    sources: {},
    edited: [],
    conflicts: [],
    brandSaved: false,
    templateName: '',
    lastUndo: null,
    events: [],
})

export interface BrandDerived {
    repos: PrototypeRepo[]
    suggestedRepo: PrototypeRepo
    selectedRepo: PrototypeRepo | null
    apps: PrototypeApp[]
    needsAppPick: boolean
    foundCount: number
    missingFields: BrandFieldKey[]
    detectedAnything: boolean
    detectionDone: boolean
    detectionProgress: number
    sourceSummary: string
    filesRead: number
    logoCandidates: PrototypeLogo[]
}

export interface BrandActions {
    start: () => void
    openInstall: () => void
    cancelInstall: () => void
    approveInstall: () => void
    pickRepo: (fullName: string) => void
    confirmRepo: () => void
    pickApp: (path: string) => void
    confirmApp: () => void
    detectAgain: () => void
    setField: <K extends BrandFieldKey>(key: K, value: BrandValues[K]) => void
    swapLogo: (logo: PrototypeLogo | null) => void
    uploadLogo: () => void
    resolveConflict: (key: BrandFieldKey, choice: 'keep' | 'detected') => void
    resolveAllConflicts: (choice: 'keep' | 'detected') => void
    undoRedetect: () => void
    saveBrand: () => void
    createTemplate: () => void
    backToReview: () => void
    changeRepo: () => void
    setTemplateName: (name: string) => void
    goTo: (phase: BrandPhase) => void
    reset: () => void
}

export interface BrandSimulation {
    state: BrandState
    derived: BrandDerived
    actions: BrandActions
    scenario: BrandScenario
}

const isEqualValue = (a: unknown, b: unknown): boolean => {
    if (a && b && typeof a === 'object' && typeof b === 'object') {
        return (a as PrototypeLogo).id === (b as PrototypeLogo).id
    }
    return a === b
}

export function useBrandSimulation(scenario: BrandScenario): BrandSimulation {
    const [state, setState] = useState<BrandState>(() => ({
        ...initialState(),
        githubConnected: scenario.github === 'connected',
    }))
    const ms = useCallback((base: number): number => Math.max(120, Math.round(base / scenario.speed)), [scenario.speed])
    const log =
        (event: string) =>
        (prev: BrandState): BrandState => ({ ...prev, events: [...prev.events, event] })

    const derived = useMemo<BrandDerived>(() => {
        const repos = REPOS[scenario.repos]
        const suggestedRepo = repos.find((repo) => repo.suggested) ?? repos[0]
        const selectedRepo = repos.find((repo) => repo.fullName === state.selectedRepo) ?? null
        const apps = selectedRepo?.apps ?? []
        const found = BRAND_FIELD_ORDER.filter((key) => state.sources[key])
        const missingFields = BRAND_FIELD_ORDER.filter((key) => !state.sources[key] && !state.edited.includes(key))
        const done =
            state.detectionSteps.length > 0 &&
            state.detectionSteps.every((step) => step.status === 'found' || step.status === 'empty')
        const readSteps = state.detectionSteps.filter(
            (step) => step.status !== 'todo' && step.status !== 'reading'
        ).length
        const files = Array.from(new Set(Object.values(state.sources).map((signal) => signal?.file)))
        return {
            repos,
            suggestedRepo,
            selectedRepo,
            apps,
            needsAppPick: apps.length > 1,
            foundCount: found.length,
            missingFields,
            detectedAnything: found.length > 0,
            detectionDone: done,
            detectionProgress: state.detectionSteps.length ? readSteps / state.detectionSteps.length : 0,
            sourceSummary: files.length
                ? `${files.length} file${files.length === 1 ? '' : 's'} in ${state.selectedRepo}`
                : `nothing usable in ${state.selectedRepo}`,
            filesRead: state.detectionSteps.length,
            logoCandidates: scenario.outcome === 'full' ? LOGO_CANDIDATES : [],
        }
    }, [state, scenario])

    useEffect(() => {
        if (state.phase !== 'detecting') {
            return
        }
        const index = state.detectionSteps.findIndex((step) => step.status === 'todo' || step.status === 'reading')
        if (index < 0) {
            const timer = setTimeout(
                () => setState((prev) => ({ ...log('brand detected')(prev), phase: 'review' })),
                ms(700)
            )
            return () => clearTimeout(timer)
        }
        const step = state.detectionSteps[index]
        if (step.status === 'todo') {
            const timer = setTimeout(() => {
                setState((prev) => {
                    const detectionSteps = [...prev.detectionSteps]
                    detectionSteps[index] = { ...detectionSteps[index], status: 'reading' }
                    return { ...prev, detectionSteps }
                })
            }, ms(120))
            return () => clearTimeout(timer)
        }
        const plan = planFor(scenario.outcome, state.selectedApp, state.detectionRuns > 1).steps[index]
        const timer = setTimeout(() => {
            setState((prev) => {
                const detectionSteps = [...prev.detectionSteps]
                const foundKeys = Object.keys(plan.values) as BrandFieldKey[]
                detectionSteps[index] = { ...detectionSteps[index], status: foundKeys.length ? 'found' : 'empty' }
                const applied = applyDetected(prev, plan, scenario.redetect)
                return { ...applied, detectionSteps }
            })
        }, ms(900))
        return () => clearTimeout(timer)
    }, [
        state.phase,
        state.detectionSteps,
        state.selectedApp,
        state.detectionRuns,
        scenario.outcome,
        scenario.redetect,
        ms,
    ])

    useEffect(() => {
        if (!state.installing) {
            return
        }
        const timer = setTimeout(
            () =>
                setState((prev) => ({
                    ...log('github connected')(prev),
                    installing: false,
                    installOverlayOpen: false,
                    githubConnected: true,
                    phase: 'repo',
                })),
            ms(1400)
        )
        return () => clearTimeout(timer)
    }, [state.installing, ms])

    useEffect(() => {
        if (state.phase !== 'creating') {
            return
        }
        const timer = setTimeout(
            () => setState((prev) => ({ ...log('template created')(prev), phase: 'editor' })),
            ms(1600)
        )
        return () => clearTimeout(timer)
    }, [state.phase, ms])

    const startDetection = (prev: BrandState): BrandState => {
        const plan = planFor(scenario.outcome, prev.selectedApp, prev.detectionRuns > 0)
        const firstRun = prev.detectionRuns === 0
        return {
            ...log(firstRun ? 'detection started' : 'detect again')(prev),
            phase: 'detecting',
            detectionRuns: prev.detectionRuns + 1,
            detectionSteps: plan.steps.map((step) => ({
                file: step.file,
                label: step.label,
                status: 'todo',
                found: {},
            })),
            conflicts: [],
            lastUndo: firstRun ? null : { brand: prev.brand, sources: prev.sources, edited: prev.edited },
            brand: firstRun ? FALLBACK_BRAND : prev.brand,
            sources: firstRun ? {} : scenario.redetect === 'keep' ? prev.sources : prev.sources,
        }
    }

    const actions = useMemo<BrandActions>(
        () => ({
            start: () =>
                setState((prev) => ({
                    ...log('flow opened')(prev),
                    phase: prev.githubConnected ? 'repo' : 'connect',
                    selectedRepo: prev.githubConnected
                        ? (REPOS[scenario.repos].find((r) => r.suggested)?.fullName ?? null)
                        : prev.selectedRepo,
                })),
            openInstall: () => setState((prev) => ({ ...prev, installOverlayOpen: true })),
            cancelInstall: () => setState((prev) => ({ ...prev, installOverlayOpen: false })),
            approveInstall: () =>
                setState((prev) => ({
                    ...prev,
                    installing: true,
                    selectedRepo: REPOS[scenario.repos].find((r) => r.suggested)?.fullName ?? null,
                })),
            pickRepo: (fullName) => setState((prev) => ({ ...prev, selectedRepo: fullName, selectedApp: null })),
            confirmRepo: () =>
                setState((prev) => {
                    const repo = REPOS[scenario.repos].find((r) => r.fullName === prev.selectedRepo)
                    if (!repo) {
                        return prev
                    }
                    const logged = log('repo picked')(prev)
                    if (repo.apps.length > 1) {
                        return {
                            ...logged,
                            phase: 'app',
                            selectedApp: repo.apps.find((app) => app.suggested)?.path ?? null,
                        }
                    }
                    return startDetection(logged)
                }),
            pickApp: (path) => setState((prev) => ({ ...prev, selectedApp: path })),
            confirmApp: () => setState((prev) => startDetection(log('app picked')(prev))),
            detectAgain: () => setState((prev) => startDetection(prev)),
            setField: (key, value) =>
                setState((prev) => ({
                    ...prev,
                    brand: { ...prev.brand, [key]: value },
                    edited: prev.edited.includes(key) ? prev.edited : [...prev.edited, key],
                    conflicts: prev.conflicts.filter((conflict) => conflict.key !== key),
                })),
            swapLogo: (logo) =>
                setState((prev) => ({
                    ...prev,
                    brand: { ...prev.brand, logo },
                    edited: prev.edited.includes('logo') ? prev.edited : [...prev.edited, 'logo'],
                    sources: logo?.file
                        ? { ...prev.sources, logo: { file: logo.file, snippet: logo.detail } }
                        : omit(prev.sources, 'logo'),
                })),
            uploadLogo: () =>
                setState((prev) => ({
                    ...prev,
                    brand: { ...prev.brand, logo: UPLOADED_LOGO },
                    edited: prev.edited.includes('logo') ? prev.edited : [...prev.edited, 'logo'],
                    sources: omit(prev.sources, 'logo'),
                })),
            resolveConflict: (key, choice) =>
                setState((prev) => {
                    const conflict = prev.conflicts.find((c) => c.key === key)
                    if (!conflict) {
                        return prev
                    }
                    const next = { ...prev, conflicts: prev.conflicts.filter((c) => c.key !== key) }
                    if (choice === 'keep') {
                        return next
                    }
                    return {
                        ...next,
                        brand: { ...next.brand, [key]: conflict.detected },
                        sources: { ...next.sources, [key]: { file: conflict.file, snippet: conflict.snippet } },
                        edited: next.edited.filter((k) => k !== key),
                    }
                }),
            resolveAllConflicts: (choice) =>
                setState((prev) => {
                    const brand = { ...prev.brand }
                    const sources = { ...prev.sources }
                    let edited = prev.edited
                    if (choice === 'detected') {
                        for (const conflict of prev.conflicts) {
                            brand[conflict.key] = conflict.detected as never
                            sources[conflict.key] = { file: conflict.file, snippet: conflict.snippet }
                            edited = edited.filter((k) => k !== conflict.key)
                        }
                    }
                    return { ...prev, conflicts: [], brand, sources, edited }
                }),
            undoRedetect: () =>
                setState((prev) =>
                    prev.lastUndo ? { ...prev, ...prev.lastUndo, lastUndo: null, conflicts: [] } : prev
                ),
            saveBrand: () => setState((prev) => ({ ...log('brand saved')(prev), brandSaved: true })),
            createTemplate: () =>
                setState((prev) => ({
                    ...log('brand saved')(log('template requested')(prev)),
                    brandSaved: true,
                    phase: 'creating',
                    templateName: prev.templateName || `${prev.brand.name || 'Our'} starter email`,
                })),
            backToReview: () => setState((prev) => ({ ...prev, phase: 'review' })),
            changeRepo: () => setState((prev) => ({ ...prev, phase: 'repo' })),
            setTemplateName: (name) => setState((prev) => ({ ...prev, templateName: name })),
            goTo: (phase) => setState((prev) => ({ ...prev, phase })),
            reset: () => setState({ ...initialState(), githubConnected: scenario.github === 'connected' }),
        }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [scenario]
    )

    return { state, derived, actions, scenario }
}

function omit<T extends object, K extends keyof T>(obj: T, key: K): Omit<T, K> {
    const copy = { ...obj }
    delete copy[key]
    return copy
}

function applyDetected(prev: BrandState, plan: DetectionPlan['steps'][number], redetect: RedetectKey): BrandState {
    const brand = { ...prev.brand }
    const sources = { ...prev.sources }
    const conflicts = [...prev.conflicts]
    let edited = prev.edited
    for (const key of Object.keys(plan.values) as BrandFieldKey[]) {
        const detected = plan.values[key] as BrandValues[typeof key]
        const snippet = plan.snippets[key] ?? ''
        const userEdited = edited.includes(key)
        const differs = !isEqualValue(brand[key], detected)
        if (userEdited && differs && prev.detectionRuns > 1) {
            if (redetect === 'keep') {
                continue
            }
            if (redetect === 'ask') {
                conflicts.splice(0, conflicts.length, ...conflicts.filter((c) => c.key !== key), {
                    key,
                    detected,
                    snippet,
                    file: plan.file,
                })
                continue
            }
        }
        brand[key] = detected as never
        sources[key] = { file: plan.file, snippet }
        edited = edited.filter((k) => k !== key)
    }
    return { ...prev, brand, sources, conflicts, edited }
}
