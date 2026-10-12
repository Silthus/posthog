// PROTOTYPE (rethink lane, Silthus/personal#36). Throwaway: the workflow scene opens on a plain-language
// summary and a who-gets-what timeline; the real editor sits behind a drill-in tab.
import clsx from 'clsx'
import { useActions, useValues } from 'kea'
import { useEffect, useMemo, useState } from 'react'

import {
    IconCheck,
    IconChevronDown,
    IconChevronRight,
    IconClock,
    IconLeave,
    IconLetter,
    IconPencil,
    IconPerson,
    IconSparkles,
} from '@posthog/icons'
import {
    LemonBanner,
    LemonButton,
    LemonMenu,
    LemonModal,
    LemonSegmentedButton,
    LemonSelect,
    LemonSwitch,
    LemonTabs,
    LemonTag,
} from '@posthog/lemon-ui'

import { hogFlowEditorLogic } from '../hogflows/hogFlowEditorLogic'
import type { HogFlow } from '../hogflows/types'
import { Workflow } from '../Workflow'
import { workflowLogic } from '../workflowLogic'
import { PROTOTYPE_PROVENANCE, type Provenance } from './prototypeProvenance'
import {
    type AudiencePath,
    type Moment,
    buildWorkflowStory,
    friendlyStepName,
    humanDuration,
    type WorkflowStory,
} from './workflowStory'

type SceneTab = 'overview' | 'editor' | 'activity' | 'sent' | 'history'
type DrillIn = { nodeId: string | null; mode: 'build' | 'test' }

export function WorkflowRethinkPrototype({ id, aiPanel }: { id: string; aiPanel: boolean }): JSX.Element {
    return (
        <div className="flex h-screen w-full overflow-hidden bg-primary">
            <MockAppNav />
            <main className="@container min-w-0 flex-1 overflow-y-auto">
                <RethinkScene id={id} />
            </main>
            {aiPanel && <MockAiPanel id={id} />}
        </div>
    )
}

function RethinkScene({ id }: { id: string }): JSX.Element {
    const { workflow, workflowLoading, originalWorkflow } = useValues(workflowLogic({ id }))
    const [tab, setTab] = useState<SceneTab>('overview')
    const [drillIn, setDrillIn] = useState<DrillIn>({ nodeId: null, mode: 'build' })
    const [previewEmailId, setPreviewEmailId] = useState<string | null>(null)
    const provenance = PROTOTYPE_PROVENANCE[id]
    const [reviewed, setReviewed] = useState(provenance?.reviewed ?? true)
    const [highlightChanges, setHighlightChanges] = useState(true)

    const story = useMemo(
        () => (originalWorkflow && workflow?.actions?.length ? buildWorkflowStory(workflow as HogFlow) : null),
        [workflow, originalWorkflow]
    )
    const changed = new Set(highlightChanges && !reviewed ? (provenance?.changedStepIds ?? []) : [])

    const openEditor = (nodeId: string | null, mode: DrillIn['mode'] = 'build'): void => {
        setPreviewEmailId(null)
        setDrillIn({ nodeId, mode })
        setTab('editor')
    }

    if (!story) {
        return <div className="p-8 text-secondary">{workflowLoading ? 'Loading workflow…' : 'No workflow'}</div>
    }

    const isBatch = story.triggerKind === 'batch'

    return (
        <div className="flex flex-col gap-4 px-6 pb-16 pt-4 @[1100px]:px-10">
            <header className="flex flex-col gap-3">
                <div className="text-xs text-secondary">Workflows</div>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 max-w-[48rem]">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="m-0 text-2xl font-bold leading-tight">{workflow.name}</h1>
                            <LemonTag type={workflow.status === 'active' ? 'success' : 'default'}>
                                {workflow.status === 'active' ? 'Live' : 'Draft'}
                            </LemonTag>
                        </div>
                        {workflow.description && (
                            <p className="m-0 mt-1 text-sm text-secondary">{workflow.description}</p>
                        )}
                    </div>
                </div>
            </header>

            <LemonTabs<SceneTab>
                activeKey={tab}
                onChange={setTab}
                tabs={[
                    { key: 'overview', label: 'Overview' },
                    { key: 'editor', label: 'Edit steps' },
                    { key: 'activity', label: 'Activity' },
                    { key: 'sent', label: 'Emails' },
                    { key: 'history', label: 'History' },
                ]}
                rightSlot={
                    <div className="flex shrink-0 items-center gap-2">
                        <LemonButton type="primary" size="small">
                            {isBatch ? 'Run send…' : 'Enable'}
                        </LemonButton>
                        <LemonMenu
                            items={[
                                { label: 'Variables…', onClick: () => openEditor(null) },
                                { label: 'Test with a person…', onClick: () => openEditor(null, 'test') },
                                { label: 'Self-driving suggestions' },
                                { label: 'Duplicate' },
                                { label: 'Save as template' },
                                { label: 'Archive', status: 'danger' },
                            ]}
                        >
                            <LemonButton type="secondary" size="small">
                                More
                            </LemonButton>
                        </LemonMenu>
                    </div>
                }
            />

            {tab === 'overview' && (
                <div className="flex max-w-[64rem] flex-col gap-5">
                    {provenance && (
                        <ProvenanceStrip
                            provenance={provenance}
                            reviewed={reviewed}
                            onReviewed={() => setReviewed(true)}
                            highlightChanges={highlightChanges}
                            onHighlightChanges={setHighlightChanges}
                        />
                    )}
                    <StoryCard story={story} />
                    <Timeline
                        story={story}
                        changed={changed}
                        onOpenEmail={setPreviewEmailId}
                        onOpenStep={(nodeId) => openEditor(nodeId)}
                    />
                    <FollowOnePerson story={story} onOpenEmail={setPreviewEmailId} />
                    <BuiltWith story={story} onOpenEditor={openEditor} />
                </div>
            )}
            {tab === 'editor' && <EditorDrillIn id={id} drillIn={drillIn} onBack={() => setTab('overview')} />}
            {tab === 'activity' && <ActivityTab isBatch={isBatch} />}
            {tab === 'sent' && <EmailsTab story={story} onOpenEmail={setPreviewEmailId} />}
            {tab === 'history' && <HistoryTab provenance={provenance} />}

            <EmailPreviewModal
                story={story}
                emailId={previewEmailId}
                changed={changed}
                provenance={provenance}
                onClose={() => setPreviewEmailId(null)}
                onEdit={(nodeId) => openEditor(nodeId)}
                onTest={(nodeId) => openEditor(nodeId, 'test')}
            />
        </div>
    )
}

function ProvenanceStrip({
    provenance,
    reviewed,
    onReviewed,
    highlightChanges,
    onHighlightChanges,
}: {
    provenance: Provenance
    reviewed: boolean
    onReviewed: () => void
    highlightChanges: boolean
    onHighlightChanges: (value: boolean) => void
}): JSX.Element {
    const changeCount = provenance.changedStepIds.length
    return (
        <div
            className={clsx(
                'flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-4 py-2.5',
                reviewed ? 'bg-surface-primary' : 'border-accent bg-accent-highlight-secondary'
            )}
        >
            <div className="flex min-w-0 flex-1 items-center gap-2">
                <IconSparkles className="shrink-0 text-lg text-accent" />
                <div className="min-w-0 text-sm">
                    <span className="font-semibold">Built by {provenance.builtBy}</span>
                    <span className="text-secondary"> · {provenance.builtOn}</span>
                    {reviewed ? (
                        <span className="text-secondary"> · Reviewed by you</span>
                    ) : changeCount > 0 ? (
                        <span>
                            {' '}
                            · {provenance.changedBy} changed {changeCount} step{changeCount === 1 ? '' : 's'} since you
                            last looked
                        </span>
                    ) : (
                        <span> · You haven't reviewed it yet</span>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-2">
                {!reviewed && changeCount > 0 && (
                    <LemonSwitch
                        size="small"
                        checked={highlightChanges}
                        onChange={onHighlightChanges}
                        label="Highlight changes"
                        bordered
                    />
                )}
                {!reviewed && (
                    <LemonButton size="small" type="secondary" icon={<IconCheck />} onClick={onReviewed}>
                        Mark as reviewed
                    </LemonButton>
                )}
            </div>
        </div>
    )
}

function StoryCard({ story }: { story: WorkflowStory }): JSX.Element {
    const firstPath = story.paths[0]
    const laterEmails = (firstPath?.moments ?? []).filter(
        (m): m is Extract<Moment, { kind: 'email' }> => m.kind === 'email'
    )
    const emailsPhrase =
        story.uniqueEmails > story.emailCountPerPerson
            ? `Up to ${story.emailCountPerPerson} emails each, from ${story.uniqueEmails} different emails`
            : `${story.emailCountPerPerson} email${story.emailCountPerPerson === 1 ? '' : 's'}, the same for everyone`

    return (
        <section className="flex flex-col gap-3">
            <dl className="m-0 grid grid-cols-1 overflow-hidden rounded-lg border bg-surface-primary @[720px]:grid-cols-2">
                <StoryCell icon={<IconPerson />} term="Who">
                    <div className="font-semibold">{story.who}</div>
                    <div className="text-secondary">
                        {story.whoDetail}
                        {story.splitBy.length > 0 &&
                            ` Split into ${story.paths.length} paths by ${listify(story.splitBy)}.`}
                    </div>
                </StoryCell>
                <StoryCell icon={<IconLetter />} term="What they get">
                    <div className="font-semibold">{emailsPhrase}</div>
                    <div className="text-secondary">
                        {story.paths.length > 1 ? 'Which email depends on the path. See the table below.' : ''}
                    </div>
                </StoryCell>
                <StoryCell icon={<IconClock />} term="When">
                    <div className="font-semibold">First email: {lowerFirst(story.firstEmailWhen ?? 'never')}</div>
                    {laterEmails.slice(1).map((m) => (
                        <div key={m.action.id} className="text-secondary">
                            Then {lowerFirst(m.when)}
                            {m.condition ? `, ${lowerFirst(m.condition)}` : ''}.
                        </div>
                    ))}
                </StoryCell>
                <StoryCell icon={<IconLeave />} term="What ends it">
                    <div className="font-semibold">Ends {listify(story.endings, 'or')}.</div>
                    {story.leaversWithoutEmail.length > 0 && (
                        <div className="text-secondary">
                            People with {listify(story.leaversWithoutEmail, 'or').replace(/match/g, 'set')} leave right
                            away, without an email.
                        </div>
                    )}
                </StoryCell>
            </dl>
            {story.checks.map((check) => (
                <LemonBanner key={check} type="warning">
                    <span className="font-semibold">Check before you run: </span>
                    {check}
                </LemonBanner>
            ))}
        </section>
    )
}

function StoryCell({
    icon,
    term,
    children,
}: {
    icon: JSX.Element
    term: string
    children: React.ReactNode
}): JSX.Element {
    return (
        <div className="flex gap-3 border-b px-4 py-3 @[720px]:[&:nth-child(odd)]:border-r @[720px]:[&:nth-last-child(-n+2)]:border-b-0">
            <span className="mt-0.5 text-lg text-secondary">{icon}</span>
            <div className="min-w-0">
                <dt className="text-xs font-semibold uppercase tracking-wide text-secondary">{term}</dt>
                <dd className="m-0 text-sm leading-relaxed">{children}</dd>
            </div>
        </div>
    )
}

type EmailMoment = Extract<Moment, { kind: 'email' }>

function emailsOf(path: AudiencePath): EmailMoment[] {
    return path.moments.filter((m): m is EmailMoment => m.kind === 'email')
}

function earlyEndsOf(path: AudiencePath): string[] {
    return path.moments.flatMap((m) => (m.kind === 'wait_for' && m.endsIfHappens ? [m.eventName] : []))
}

function uniform(values: (string | null | undefined)[]): string | null {
    const present = values.filter((v): v is string => !!v)
    return present.length === values.length && new Set(present).size === 1 ? present[0] : null
}

function groupWhenOf(paths: AudiencePath[]): (string | null)[] {
    const count = Math.max(0, ...paths.map((p) => emailsOf(p).length))
    return Array.from({ length: count }, (_, index) => uniform(paths.map((p) => emailsOf(p)[index]?.when)))
}

function Timeline({
    story,
    changed,
    onOpenEmail,
    onOpenStep,
}: {
    story: WorkflowStory
    changed: Set<string>
    onOpenEmail: (id: string) => void
    onOpenStep: (id: string) => void
}): JSX.Element {
    const groups = useMemo(() => {
        const map = new Map<string, AudiencePath[]>()
        story.paths.forEach((p) => map.set(p.groupKey, [...(map.get(p.groupKey) ?? []), p]))
        return [...map.entries()]
    }, [story])
    const grouped = story.paths.length > 6
    const changedGroups = groups
        .filter(([, paths]) => paths.some((p) => p.moments.some((m) => changed.has(m.action.id))))
        .map(([key]) => key)
    const [open, setOpen] = useState<string[]>(() => [groups[0]?.[0], ...changedGroups].filter(Boolean) as string[])

    const columnCount = story.emailCountPerPerson
    const columns = Array.from({ length: columnCount }, (_, index) => {
        const cells = story.paths.map((p) => emailsOf(p)[index])
        return {
            index,
            when: uniform(cells.map((c) => c?.when)),
            condition: uniform(cells.map((c) => c?.condition)),
        }
    })
    const earlyEnd = uniform(story.paths.map((p) => earlyEndsOf(p).join(', ') || null))
    const gridTemplateColumns = `minmax(8rem, 11rem) repeat(${columnCount}, minmax(11rem, 1fr)) minmax(7rem, 10rem)`
    const showPathColumn = story.paths.length > 1

    const renderRow = (
        path: AudiencePath,
        dropFirstTitle: boolean,
        groupWhens: (string | null)[] = []
    ): JSX.Element => {
        const title = dropFirstTitle ? path.title.split(' · ').slice(1).join(' · ') || path.title : path.title
        const rules = dropFirstTitle ? path.rules.slice(1) : path.rules
        const emails = emailsOf(path)
        const otherActions = path.moments.filter((m) => m.kind === 'action')
        return (
            <div key={path.id} className="contents">
                <div className="border-t px-4 py-3">
                    <div className="text-sm font-semibold">{showPathColumn ? title : 'Everyone'}</div>
                    {rules.length > 0 && <div className="text-xs text-secondary">{rules.join(', ')}</div>}
                    {path.share && <div className="text-xs text-secondary">{path.share} of people</div>}
                    {otherActions.map((m) => (
                        <button
                            key={m.action.id}
                            type="button"
                            className="mt-1 block text-left text-xs text-accent hover:underline"
                            onClick={() => onOpenStep(m.action.id)}
                        >
                            Also: {friendlyStepName(m.action)}
                        </button>
                    ))}
                </div>
                {columns.map((column) => {
                    const email = emails[column.index]
                    return (
                        <div key={column.index} className="border-t px-2 py-2">
                            {email ? (
                                <EmailCell
                                    moment={email}
                                    showWhen={!column.when && !groupWhens[column.index]}
                                    showCondition={!column.condition}
                                    changed={changed.has(email.action.id)}
                                    onClick={() => onOpenEmail(email.action.id)}
                                />
                            ) : (
                                <span className="px-2 text-xs text-secondary">No email</span>
                            )}
                        </div>
                    )
                })}
                <div className="flex flex-col justify-center gap-0.5 border-t px-3 py-3 text-xs">
                    {!earlyEnd &&
                        earlyEndsOf(path).map((event) => (
                            <span key={event} className="text-success">
                                “{event}” ends it early
                            </span>
                        ))}
                    <span className="text-secondary">
                        {emails.length ? `After email ${emails.length}` : 'Right away'}
                    </span>
                </div>
            </div>
        )
    }

    return (
        <section className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="m-0 text-lg font-semibold">Who gets which email, when</h2>
                <span className="text-xs text-secondary">Click an email to read it or change it</span>
            </div>
            <div className="overflow-x-auto rounded-lg border bg-surface-primary">
                <div className="grid min-w-fit" style={{ gridTemplateColumns }}>
                    <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-secondary">
                        {showPathColumn ? `${story.paths.length} paths` : 'Who'}
                    </div>
                    {columns.map((column) => (
                        <div key={column.index} className="px-3 py-2 text-xs">
                            <div className="font-semibold uppercase tracking-wide text-secondary">
                                Email {column.index + 1}
                            </div>
                            <div className="font-semibold">{column.when ?? 'Varies by path'}</div>
                            {column.condition && <div className="text-warning">{column.condition}</div>}
                        </div>
                    ))}
                    <div className="px-3 py-2 text-xs">
                        <div className="font-semibold uppercase tracking-wide text-secondary">Ends</div>
                        {earlyEnd && <div className="font-semibold text-success">Early on “{earlyEnd}”</div>}
                    </div>
                    {grouped
                        ? groups.map(([key, paths]) => {
                              const isOpen = open.includes(key)
                              return (
                                  <div key={key} className="contents">
                                      <button
                                          type="button"
                                          className="col-span-full flex items-center gap-2 border-t bg-surface-secondary px-4 py-2 text-left text-sm font-semibold hover:bg-fill-button-tertiary-hover"
                                          onClick={() =>
                                              setOpen(isOpen ? open.filter((k) => k !== key) : [...open, key])
                                          }
                                      >
                                          {isOpen ? <IconChevronDown /> : <IconChevronRight />}
                                          {key}
                                          <span className="font-normal text-secondary">
                                              {paths[0].rules[0]} · {paths.length} paths
                                              {groupWhenOf(paths).map((when, index) =>
                                                  when && !columns[index].when
                                                      ? ` · Email ${index + 1} ${lowerFirst(when)}`
                                                      : ''
                                              )}
                                          </span>
                                          {changedGroups.includes(key) && (
                                              <LemonTag type="highlight" size="small">
                                                  Changed
                                              </LemonTag>
                                          )}
                                      </button>
                                      {isOpen && paths.map((path) => renderRow(path, true, groupWhenOf(paths)))}
                                  </div>
                              )
                          })
                        : story.paths.map((path) => renderRow(path, false))}
                    {story.leaversWithoutEmail.length > 0 && (
                        <div className="col-span-full flex items-center gap-2 border-t px-4 py-2.5 text-sm text-secondary">
                            <IconLeave className="shrink-0" />
                            Everyone else ({listify(story.leaversWithoutEmail, 'or')}) leaves right away. No email.
                        </div>
                    )}
                </div>
            </div>
        </section>
    )
}

function EmailCell({
    moment,
    showWhen,
    showCondition,
    changed,
    onClick,
}: {
    moment: EmailMoment
    showWhen: boolean
    showCondition: boolean
    changed: boolean
    onClick: () => void
}): JSX.Element {
    return (
        <button
            type="button"
            onClick={onClick}
            className={clsx(
                'flex h-full w-full flex-col gap-1 rounded-md border px-3 py-2 text-left transition hover:border-accent hover:bg-surface-secondary',
                changed ? 'border-accent bg-accent-highlight-secondary' : 'border-transparent'
            )}
        >
            {showWhen && (
                <span className="flex items-center gap-1 text-xs text-secondary">
                    <IconClock className="shrink-0" />
                    {moment.when}
                </span>
            )}
            {showCondition && moment.condition && <span className="text-xs text-warning">{moment.condition}</span>}
            <span className="flex items-start gap-1.5 text-sm font-semibold leading-snug">
                <IconLetter className="mt-0.5 shrink-0 text-accent" />
                <span>{moment.email.subject}</span>
            </span>
            {changed && (
                <LemonTag type="highlight" size="small" className="self-start">
                    Changed since you last looked
                </LemonTag>
            )}
        </button>
    )
}

function FollowOnePerson({
    story,
    onOpenEmail,
}: {
    story: WorkflowStory
    onOpenEmail: (id: string) => void
}): JSX.Element {
    const LEAVER = '__leaver__'
    const [pathId, setPathId] = useState(story.paths[0]?.id ?? LEAVER)
    const [happened, setHappened] = useState<Record<string, boolean>>({})
    const path = story.paths.find((p) => p.id === pathId)

    const steps: { when: string; text: JSX.Element | string; emailId?: string; tone?: 'end' | 'success' }[] = []
    if (!path) {
        steps.push({
            when: 'Day 0',
            text: 'Enters the workflow, matches no path, and leaves. Gets nothing.',
            tone: 'end',
        })
    } else {
        let stopped = false
        for (const moment of path.moments) {
            if (moment.kind === 'email') {
                steps.push({ when: moment.when, text: moment.email.subject, emailId: moment.action.id })
            } else if (moment.kind === 'action') {
                steps.push({ when: moment.when, text: friendlyStepName(moment.action) })
            } else {
                const did = happened[moment.action.id] ?? false
                if (did && moment.endsIfHappens) {
                    steps.push({
                        when: `Within ${humanDuration(moment.maxWait)}`,
                        text: `Does “${moment.eventName}”. The workflow ends for them here.`,
                        tone: 'success',
                    })
                    stopped = true
                    break
                }
                steps.push({
                    when: `Next ${humanDuration(moment.maxWait)}`,
                    text: `Waits for “${moment.eventName}”. It does not happen.`,
                })
            }
        }
        if (!stopped) {
            steps.push({ when: 'Then', text: 'The workflow ends.', tone: 'end' })
        }
    }

    return (
        <section className="flex flex-col gap-2">
            <h2 className="m-0 text-lg font-semibold">Follow one person</h2>
            <div className="flex flex-col gap-4 rounded-lg border bg-surface-primary p-4 @[760px]:flex-row">
                <div className="flex shrink-0 flex-col gap-3 @[760px]:w-64">
                    <label className="flex flex-col gap-1 text-xs font-semibold text-secondary">
                        This person is in
                        <LemonSelect
                            size="small"
                            fullWidth
                            value={pathId}
                            onChange={(value) => setPathId(value)}
                            options={[
                                ...story.paths.map((p) => ({ value: p.id, label: p.title })),
                                ...(story.leaversWithoutEmail.length
                                    ? [{ value: LEAVER, label: `No path (${story.leaversWithoutEmail[0]})` }]
                                    : []),
                            ]}
                        />
                    </label>
                    {path?.moments
                        .filter((m): m is Extract<Moment, { kind: 'wait_for' }> => m.kind === 'wait_for')
                        .map((m) => (
                            <LemonSwitch
                                key={m.action.id}
                                bordered
                                size="small"
                                checked={happened[m.action.id] ?? false}
                                onChange={(value) => setHappened({ ...happened, [m.action.id]: value })}
                                label={`Does “${m.eventName}” within ${humanDuration(m.maxWait)}`}
                            />
                        ))}
                </div>
                <ol className="m-0 flex min-w-0 flex-1 list-none flex-col p-0">
                    {steps.map((step, index) => (
                        <li key={index} className="relative flex gap-3 pb-3 last:pb-0">
                            <span
                                className={clsx(
                                    'mt-1.5 size-2.5 shrink-0 rounded-full',
                                    step.tone === 'end'
                                        ? 'bg-muted-alt'
                                        : step.tone === 'success'
                                          ? 'bg-success'
                                          : 'bg-accent'
                                )}
                            />
                            <div className="min-w-0 text-sm">
                                <div className="text-xs text-secondary">{step.when}</div>
                                {step.emailId ? (
                                    <button
                                        type="button"
                                        className="text-left font-semibold text-accent hover:underline"
                                        onClick={() => onOpenEmail(step.emailId!)}
                                    >
                                        Gets “{step.text}”
                                    </button>
                                ) : (
                                    <div className={clsx(step.tone === 'success' && 'text-success')}>{step.text}</div>
                                )}
                            </div>
                        </li>
                    ))}
                </ol>
            </div>
        </section>
    )
}

function BuiltWith({
    story,
    onOpenEditor,
}: {
    story: WorkflowStory
    onOpenEditor: (nodeId: string | null, mode?: DrillIn['mode']) => void
}): JSX.Element {
    return (
        <section className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-dashed px-4 py-3 text-sm">
            <span className="text-secondary">
                Built from {story.stepCount} steps
                {story.variables.length > 0 &&
                    ` and ${story.variables.length} variable${story.variables.length === 1 ? '' : 's'} (${story.variables
                        .map((v) => v.label)
                        .join(', ')})`}
                .
            </span>
            <div className="flex flex-wrap gap-2">
                <LemonButton size="small" type="secondary" icon={<IconPencil />} onClick={() => onOpenEditor(null)}>
                    Edit steps
                </LemonButton>
                <LemonButton size="small" type="tertiary" onClick={() => onOpenEditor(null, 'test')}>
                    Test with a person
                </LemonButton>
            </div>
        </section>
    )
}

function EditorDrillIn({ id, drillIn, onBack }: { id: string; drillIn: DrillIn; onBack: () => void }): JSX.Element {
    const { logicProps } = useValues(workflowLogic({ id }))
    const { setSelectedNodeId, setMode } = useActions(hogFlowEditorLogic(logicProps))
    useEffect(() => {
        setSelectedNodeId(drillIn.nodeId)
        setMode(drillIn.mode)
    }, [drillIn, setSelectedNodeId, setMode])

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm">
                <LemonButton size="xsmall" type="tertiary" onClick={onBack}>
                    ← Back to overview
                </LemonButton>
                <span className="text-secondary">Changes save as a draft. The overview updates as you edit.</span>
            </div>
            <Workflow id={id} />
        </div>
    )
}

function ActivityTab({ isBatch }: { isBatch: boolean }): JSX.Element {
    const [view, setView] = useState<'runs' | 'metrics' | 'logs'>('runs')
    return (
        <div className="flex max-w-[64rem] flex-col gap-3">
            <LemonSegmentedButton
                size="small"
                value={view}
                onChange={setView}
                options={[
                    { value: 'runs', label: 'Runs' },
                    { value: 'metrics', label: 'Metrics' },
                    { value: 'logs', label: 'Logs' },
                ]}
            />
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center">
                <IconClock className="text-3xl text-secondary" />
                <div className="font-semibold">Nothing has run yet</div>
                <div className="max-w-md text-sm text-secondary">
                    {isBatch
                        ? 'Runs, delivery metrics and logs show up here after you run the send.'
                        : 'Runs, delivery metrics and logs show up here once the workflow is enabled.'}
                </div>
                <div className="mt-4 max-w-md rounded bg-surface-secondary px-3 py-2 text-xs text-secondary">
                    Prototype: one Activity tab replaces the Invocations and Metrics scene tabs and the side panel's
                    Metrics and Logs tabs. Selecting a step in Edit filters this tab to that step.
                </div>
            </div>
        </div>
    )
}

function EmailsTab({ story, onOpenEmail }: { story: WorkflowStory; onOpenEmail: (id: string) => void }): JSX.Element {
    const emails = story.paths.flatMap((path) =>
        path.moments.flatMap((m) => (m.kind === 'email' ? [{ path, moment: m }] : []))
    )
    return (
        <div className="flex max-w-[64rem] flex-col gap-3">
            <div className="text-sm text-secondary">
                {story.uniqueEmails} emails in this workflow. Nothing sent yet; sent copies appear next to each email.
            </div>
            <div className="overflow-hidden rounded-lg border bg-surface-primary">
                {emails.map(({ path, moment }) => (
                    <button
                        key={moment.action.id}
                        type="button"
                        onClick={() => onOpenEmail(moment.action.id)}
                        className="flex w-full items-center gap-3 border-b px-4 py-2.5 text-left last:border-b-0 hover:bg-surface-secondary"
                    >
                        <IconLetter className="shrink-0 text-accent" />
                        <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold">{moment.email.subject}</span>
                            <span className="block text-xs text-secondary">
                                {path.title} · {moment.when}
                            </span>
                        </span>
                        <span className="text-xs text-secondary">0 sent</span>
                    </button>
                ))}
            </div>
        </div>
    )
}

function HistoryTab({ provenance }: { provenance?: Provenance }): JSX.Element {
    const versions = provenance?.versions ?? []
    return (
        <div className="flex max-w-[64rem] flex-col gap-2">
            {versions.map((version) => (
                <div
                    key={version.label}
                    className="flex items-start gap-3 rounded-lg border bg-surface-primary px-4 py-3"
                >
                    <LemonTag type={version.byAi ? 'highlight' : 'default'}>{version.label}</LemonTag>
                    <div className="min-w-0 flex-1 text-sm">
                        <div className="font-semibold">{version.summary}</div>
                        <div className="text-xs text-secondary">
                            {version.by} · {version.on}
                        </div>
                    </div>
                    <LemonButton size="small" type="tertiary">
                        Compare
                    </LemonButton>
                </div>
            ))}
        </div>
    )
}

function EmailPreviewModal({
    story,
    emailId,
    changed,
    provenance,
    onClose,
    onEdit,
    onTest,
}: {
    story: WorkflowStory
    emailId: string | null
    changed: Set<string>
    provenance?: Provenance
    onClose: () => void
    onEdit: (id: string) => void
    onTest: (id: string) => void
}): JSX.Element {
    const match = story.paths
        .flatMap((path) => path.moments.map((moment) => ({ path, moment })))
        .find(({ moment }) => moment.action.id === emailId && moment.kind === 'email')
    const moment = match?.moment.kind === 'email' ? match.moment : null
    return (
        <LemonModal
            isOpen={!!moment}
            onClose={onClose}
            width={760}
            title={moment?.email.subject ?? ''}
            description={
                match && moment ? (
                    <span>
                        To people in <strong>{match.path.title}</strong> ({match.path.rules.join(', ') || 'everyone'}) ·{' '}
                        {lowerFirst(moment.when)}
                    </span>
                ) : undefined
            }
            footer={
                moment ? (
                    <>
                        <LemonButton type="secondary" onClick={() => onTest(moment.action.id)}>
                            Send a test
                        </LemonButton>
                        <LemonButton type="primary" icon={<IconPencil />} onClick={() => onEdit(moment.action.id)}>
                            Edit this email
                        </LemonButton>
                    </>
                ) : undefined
            }
        >
            {moment && (
                <div className="flex flex-col gap-3">
                    {changed.has(moment.action.id) && provenance && (
                        <LemonBanner type="info">
                            {provenance.changedBy} changed this email on {provenance.changedOn}:{' '}
                            {provenance.changeNotes[moment.action.id] ?? 'content updated'}.
                        </LemonBanner>
                    )}
                    <div className="text-sm text-secondary">Preview text: {moment.email.preheader}</div>
                    <iframe
                        title="Email preview"
                        srcDoc={moment.email.html}
                        className="h-[26rem] w-full rounded border bg-white"
                        sandbox=""
                    />
                </div>
            )}
        </LemonModal>
    )
}

function MockAppNav(): JSX.Element {
    const items = ['Home', 'Product analytics', 'Session replay', 'Feature flags', 'Workflows', 'Data warehouse']
    return (
        <nav className="flex w-[13.5rem] shrink-0 flex-col gap-0.5 border-r bg-surface-secondary px-2 py-3 text-sm">
            <div className="mb-3 px-2 text-xs font-semibold uppercase tracking-wide text-secondary">Mock app nav</div>
            {items.map((item) => (
                <div
                    key={item}
                    className={clsx(
                        'rounded px-2 py-1.5',
                        item === 'Workflows' ? 'bg-fill-button-tertiary-hover font-semibold' : 'text-secondary'
                    )}
                >
                    {item}
                </div>
            ))}
        </nav>
    )
}

function MockAiPanel({ id }: { id: string }): JSX.Element {
    const conversation = PROTOTYPE_PROVENANCE[id]?.aiConversation ?? []
    return (
        <aside className="flex w-[420px] shrink-0 flex-col border-l bg-surface-primary">
            <div className="flex items-center gap-2 border-b px-4 py-3 font-semibold">
                <IconSparkles className="text-accent" /> PostHog AI
                <span className="ml-auto text-xs font-normal text-secondary">Mocked panel</span>
            </div>
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4 text-sm">
                {conversation.map((message, index) => (
                    <div
                        key={index}
                        className={clsx(
                            'max-w-[90%] rounded-lg px-3 py-2 leading-relaxed',
                            message.from === 'you' ? 'self-end bg-fill-button-tertiary-hover' : 'self-start border'
                        )}
                    >
                        {message.text}
                    </div>
                ))}
            </div>
            <div className="border-t p-3">
                <div className="rounded-md border px-3 py-2 text-sm text-secondary">Ask about this workflow…</div>
            </div>
        </aside>
    )
}

function listify(items: string[], conjunction = 'and'): string {
    if (items.length <= 1) {
        return items[0] ?? ''
    }
    return `${items.slice(0, -1).join(', ')} ${conjunction} ${items[items.length - 1]}`
}

function lowerFirst(text: string): string {
    return text.charAt(0).toLowerCase() + text.slice(1)
}
