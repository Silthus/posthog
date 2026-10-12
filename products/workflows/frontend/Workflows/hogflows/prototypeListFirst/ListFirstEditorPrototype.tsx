// PROTOTYPE (throwaway, never merges): list-first workflow editor that reads like a document.
// Answers Silthus/personal#34. Editing opens only on demand in a drawer that reuses the real panels.
import { ReactFlowProvider } from '@xyflow/react'
import clsx from 'clsx'
import { BindLogic, useActions, useValues } from 'kea'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import {
    IconClock,
    IconEllipsis,
    IconLetter,
    IconFlag,
    IconGraph,
    IconPencil,
    IconPlay,
    IconPlus,
    IconShuffle,
    IconTrash,
    IconCopy,
    IconX,
    IconBolt,
    IconEye,
    IconCalendar,
} from '@posthog/icons'
import { LemonButton, LemonMenu, LemonSegmentedButton, LemonTag, SpinnerOverlay } from '@posthog/lemon-ui'

import { workflowLogic } from '../../workflowLogic'
import { HogFlowBranchSelectionProvider } from '../HogFlowBranchSelection'
import { hogFlowEditorLogic } from '../hogFlowEditorLogic'
import { HogFlowEditorPanelBuild } from '../panel/HogFlowEditorPanelBuild'
import { HogFlowEditorPanelBuildDetail } from '../panel/HogFlowEditorPanelBuildDetail'
import { HogFlowEditorPanelLogs } from '../panel/HogFlowEditorPanelLogs'
import { HogFlowEditorPanelMetrics } from '../panel/HogFlowEditorPanelMetrics'
import { HogFlowEditorPanelSelectedStep } from '../panel/HogFlowEditorPanelSelectedStep'
import { HogFlowEditorPanelVariables } from '../panel/HogFlowEditorPanelVariables'
import { EmailActionTestContent } from '../panel/testing/HogFlowEditorNotificationPanelTest'
import { HogFlowEditorPanelTest } from '../panel/testing/HogFlowEditorPanelTest'
import {
    buildWorkflowTree,
    type WorkflowTreeBranch,
    type WorkflowTreeNode,
    type WorkflowTreeSequence,
} from '../tree/workflowTree'
import type { HogFlow, HogFlowAction } from '../types'
import {
    addTime,
    collectEmails,
    collectEndings,
    countPaths,
    countSteps,
    describeBranchCondition,
    describeSplit,
    describeTimeWindow,
    describeTrigger,
    describeWaitEvent,
    durationInWords,
    EXIT_RULE_WORDS,
    formatWhen,
    getEmailContent,
    splitWarning,
    type TimeRange,
} from './workflowDocument'

type StepTab = 'settings' | 'preview' | 'test' | 'metrics' | 'logs'
type WorkflowTab = 'variables' | 'test' | 'metrics' | 'logs' | 'add'
type Drawer = { kind: 'step'; actionId: string; tab: StepTab } | { kind: 'workflow'; tab: WorkflowTab } | null

const PATH_COLORS = ['#1d4aff', '#f54e00', '#2f9e44', '#9b51e0', '#d6336c', '#0c8599', '#e8590c', '#5c7cfa']
const LARGE_FLOW_STEP_COUNT = 30

interface DocContextValue {
    workflow: HogFlow
    editing: boolean
    selectedActionId: string | null
    followed: Set<string>
    collapsed: Set<string>
    openStep: (actionId: string, tab?: StepTab) => void
    openAdd: () => void
    toggleFollow: (key: string) => void
    toggleCollapsed: (key: string) => void
}

const DocContext = createContext<DocContextValue>(null as unknown as DocContextValue)
const useDoc = (): DocContextValue => useContext(DocContext)

const branchKey = (node: WorkflowTreeNode, branch: WorkflowTreeBranch): string =>
    `${node.action.id}:${branch.edge.type}:${branch.edge.index ?? 'c'}`

export function ListFirstEditorPrototype({ id }: { id: string }): JSX.Element {
    return (
        <BindLogic logic={workflowLogic} props={{ id }}>
            <ListFirstEditorLoader />
        </BindLogic>
    )
}

function ListFirstEditorLoader(): JSX.Element {
    const { logicProps, originalWorkflow, workflowLoading } = useValues(workflowLogic)
    if (!originalWorkflow && workflowLoading) {
        return <SpinnerOverlay />
    }
    return (
        <BindLogic logic={hogFlowEditorLogic} props={logicProps}>
            <HogFlowBranchSelectionProvider>
                <ReactFlowProvider>
                    <ListFirstEditor />
                </ReactFlowProvider>
            </HogFlowBranchSelectionProvider>
        </BindLogic>
    )
}

function ListFirstEditor(): JSX.Element {
    const { workflow } = useValues(workflowLogic)
    const { setSelectedNodeId, setMode } = useActions(hogFlowEditorLogic)
    const [editing, setEditing] = useState(false)
    const [drawer, setDrawer] = useState<Drawer>(null)
    const [followed, setFollowed] = useState<Set<string>>(new Set())
    const tree = useMemo(() => buildWorkflowTree(workflow), [workflow])
    const isLarge = useMemo(() => countSteps(tree) > LARGE_FLOW_STEP_COUNT, [tree])
    const leafKeys = useMemo(() => collectLeafBranchKeys(tree), [tree])
    const [collapsed, setCollapsed] = useState<Set<string>>(() => (isLarge ? new Set(leafKeys) : new Set()))

    useEffect(() => {
        const onKey = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') {
                closeDrawer()
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    })

    const openStep = (actionId: string, tab: StepTab = 'settings'): void => {
        setSelectedNodeId(actionId)
        setMode(tab === 'settings' || tab === 'preview' ? 'build' : tab)
        setDrawer({ kind: 'step', actionId, tab })
    }
    const openWorkflowTab = (tab: WorkflowTab): void => {
        setSelectedNodeId(null)
        setMode(tab === 'add' ? 'build' : tab)
        setDrawer({ kind: 'workflow', tab })
    }
    const closeDrawer = (): void => {
        setSelectedNodeId(null)
        setDrawer(null)
    }
    const toggleIn =
        (setter: (fn: (current: Set<string>) => Set<string>) => void) =>
        (key: string): void =>
            setter((current) => {
                const next = new Set(current)
                next.has(key) ? next.delete(key) : next.add(key)
                return next
            })

    const context: DocContextValue = {
        workflow,
        editing,
        selectedActionId: drawer?.kind === 'step' ? drawer.actionId : null,
        followed,
        collapsed,
        openStep,
        openAdd: () => openWorkflowTab('add'),
        toggleFollow: toggleIn(setFollowed),
        toggleCollapsed: toggleIn(setCollapsed),
    }

    return (
        <DocContext.Provider value={context}>
            <div className="@container/doc relative flex h-full min-h-0 min-w-0 flex-1 flex-col bg-surface-primary">
                <SceneHeader
                    workflow={workflow}
                    editing={editing}
                    setEditing={setEditing}
                    openWorkflowTab={openWorkflowTab}
                    hasCollapsed={collapsed.size > 0}
                    toggleAll={() => setCollapsed(collapsed.size > 0 ? new Set() : new Set(leafKeys))}
                    showToggleAll={isLarge || leafKeys.length > 3}
                />
                <div className="min-h-0 flex-1 overflow-y-auto" data-attr="workflow-document">
                    <div className="mx-auto flex max-w-[52rem] flex-col gap-5 px-6 py-5 @max-[40rem]/doc:px-3">
                        <AtAGlance workflow={workflow} tree={tree} followed={followed} setFollowed={setFollowed} />
                        <Sequence sequence={tree} start={{ minHours: 0, maxHours: 0 }} depth={0} after={null} />
                    </div>
                </div>
                {drawer && (
                    <DrawerPanel
                        drawer={drawer}
                        onClose={closeDrawer}
                        onTab={openStep}
                        onWorkflowTab={openWorkflowTab}
                    />
                )}
            </div>
        </DocContext.Provider>
    )
}

function collectLeafBranchKeys(sequence: WorkflowTreeSequence, into: string[] = []): string[] {
    for (const node of sequence.nodes) {
        if (node.action.type === 'wait_until_condition') {
            node.branches.forEach((branch) => collectLeafBranchKeys(branch.sequence, into))
            continue
        }
        for (const branch of node.branches) {
            const hasSplit = branch.sequence.nodes.some(
                (n) => n.branches.length > 0 && n.action.type !== 'wait_until_condition'
            )
            if (!hasSplit && branch.sequence.nodes.length > 0) {
                into.push(branchKey(node, branch))
            }
            collectLeafBranchKeys(branch.sequence, into)
        }
    }
    return into
}

function SceneHeader({
    workflow,
    editing,
    setEditing,
    openWorkflowTab,
    hasCollapsed,
    toggleAll,
    showToggleAll,
}: {
    workflow: HogFlow
    editing: boolean
    setEditing: (editing: boolean) => void
    openWorkflowTab: (tab: WorkflowTab) => void
    hasCollapsed: boolean
    toggleAll: () => void
    showToggleAll: boolean
}): JSX.Element {
    const variableCount = workflow.variables?.length ?? 0
    return (
        <div className="shrink-0 border-b bg-surface-primary">
            <div className="flex items-start gap-3 px-4 pt-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="m-0 text-lg font-semibold leading-tight">{workflow.name}</h1>
                        <LemonTag type="muted">Draft</LemonTag>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <LemonButton size="small" type="secondary">
                        Enable
                    </LemonButton>
                    <LemonButton size="small" type="primary">
                        Save draft
                    </LemonButton>
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pt-2">
                <nav className="flex items-center gap-3 text-[13px]">
                    {['Workflow', 'Invocations', 'Metrics', 'Assets', 'History'].map((tab, index) => (
                        <span
                            key={tab}
                            className={clsx(
                                'cursor-pointer border-b-2 pb-1.5',
                                index === 0
                                    ? 'border-[var(--accent)] font-semibold'
                                    : 'border-transparent text-secondary'
                            )}
                        >
                            {tab}
                        </span>
                    ))}
                </nav>
                <div className="ml-auto flex items-center gap-1 pb-1">
                    {showToggleAll && (
                        <LemonButton size="xsmall" type="tertiary" onClick={toggleAll}>
                            {hasCollapsed ? 'Expand all' : 'Collapse paths'}
                        </LemonButton>
                    )}
                    <LemonButton
                        size="xsmall"
                        type="tertiary"
                        icon={<IconPlay />}
                        onClick={() => openWorkflowTab('test')}
                    >
                        Test
                    </LemonButton>
                    <LemonButton size="xsmall" type="tertiary" onClick={() => openWorkflowTab('variables')}>
                        Variables{variableCount ? ` (${variableCount})` : ''}
                    </LemonButton>
                    <LemonMenu
                        items={[
                            { label: 'Metrics for this flow', onClick: () => openWorkflowTab('metrics') },
                            { label: 'Logs', onClick: () => openWorkflowTab('logs') },
                            { label: 'Open as graph', icon: <IconGraph /> },
                            { label: 'Self-driving suggestions' },
                            { label: 'Auto-save: on' },
                        ]}
                    >
                        <LemonButton size="xsmall" type="tertiary" icon={<IconEllipsis />} aria-label="More" />
                    </LemonMenu>
                    <LemonSegmentedButton
                        size="xsmall"
                        value={editing ? 'edit' : 'read'}
                        onChange={(value) => setEditing(value === 'edit')}
                        options={[
                            { value: 'read', label: 'Read', icon: <IconEye /> },
                            { value: 'edit', label: 'Edit', icon: <IconPencil /> },
                        ]}
                    />
                </div>
            </div>
        </div>
    )
}

function AtAGlance({
    workflow,
    tree,
    followed,
    setFollowed,
}: {
    workflow: HogFlow
    tree: WorkflowTreeSequence
    followed: Set<string>
    setFollowed: (followed: Set<string>) => void
}): JSX.Element {
    const emails = collectEmails(tree)
    const paths = countPaths(tree)
    const endings = collectEndings(workflow, tree)
    const firstSplit = tree.nodes.find((n) => n.branches.length > 1 && n.action.type !== 'wait_until_condition')
    const splitBranches = firstSplit?.branches.filter((b) => b.sequence.nodes.length > 0) ?? []

    return (
        <section className="flex flex-col gap-2">
            {workflow.description && (
                <p className="m-0 text-[15px] leading-snug text-secondary">{workflow.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-secondary">
                <span>
                    <strong className="text-primary">{emails.length}</strong> email{emails.length === 1 ? '' : 's'}
                </span>
                <span>
                    <strong className="text-primary">{paths}</strong> path{paths === 1 ? '' : 's'}
                </span>
                <span>
                    Ends when:{' '}
                    {endings
                        .slice(0, 4)
                        .map((e) => e.text.replace(/: leaves right away$/, ''))
                        .join(' · ')}
                    {endings.length > 4 ? ` · +${endings.length - 4} more` : ''}
                </span>
            </div>
            {firstSplit && splitBranches.length > 1 && (
                <div
                    className="flex flex-col gap-1 rounded-md border bg-surface-secondary px-3 py-2"
                    data-attr="workflow-path-preview"
                >
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-tertiary">
                        Who gets what
                        {followed.size > 0 && (
                            <LemonButton size="xsmall" type="tertiary" onClick={() => setFollowed(new Set())}>
                                Show all paths
                            </LemonButton>
                        )}
                    </div>
                    {splitBranches.map((branch, index) => {
                        const key = branchKey(firstSplit, branch)
                        const active = followed.has(key)
                        return (
                            <div
                                key={key}
                                className={clsx('flex items-start gap-2', followed.size > 0 && !active && 'opacity-40')}
                            >
                                <button
                                    type="button"
                                    title="Follow this path below"
                                    onClick={() => setFollowed(active ? new Set() : new Set([key]))}
                                    className={clsx(
                                        'mt-0.5 flex shrink-0 cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[13px] font-medium',
                                        active
                                            ? 'border-transparent text-white'
                                            : 'bg-surface-primary hover:bg-fill-highlight-100'
                                    )}
                                    style={
                                        active
                                            ? { backgroundColor: PATH_COLORS[index % PATH_COLORS.length] }
                                            : undefined
                                    }
                                >
                                    <PathLetter index={index} inverted={active} />
                                    {describeBranchCondition(workflow, firstSplit, branch)}
                                </button>
                                <div className="min-w-0 flex-1">
                                    <PathStrip sequence={branch.sequence} compact />
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </section>
    )
}

function PathLetter({ index, inverted }: { index: number; inverted?: boolean }): JSX.Element {
    const color = PATH_COLORS[index % PATH_COLORS.length]
    return (
        <span
            className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
            style={inverted ? { backgroundColor: 'white', color } : { backgroundColor: color, color: 'white' }}
        >
            {String.fromCharCode(65 + index)}
        </span>
    )
}

function Sequence({
    sequence,
    start,
    depth,
    after,
}: {
    sequence: WorkflowTreeSequence
    start: TimeRange
    depth: number
    after: HogFlowAction | null
}): JSX.Element {
    const { editing } = useDoc()
    let time = start
    const rows: ReactNode[] = []

    sequence.nodes.forEach((node, index) => {
        if (editing && index > 0) {
            rows.push(<InsertPoint key={`insert-${node.action.id}`} />)
        }
        const result = renderNode(node, time, depth)
        rows.push(result.element)
        time = result.end
    })

    const last = sequence.nodes.at(-1)?.action
    const continuesTo = sequence.continueTo ?? after
    if (depth > 0 && continuesTo && last?.type !== 'exit' && !(last && sequence.nodes.at(-1)!.branches.length > 0)) {
        rows.push(
            continuesTo.type === 'exit' ? (
                <PathEnd key="end" />
            ) : (
                <div key="continue" className="pl-[5.5rem] text-[13px] text-secondary">
                    Then continues at <strong className="text-primary">{continuesTo.name}</strong> ↓
                </div>
            )
        )
    }

    return <div className="flex flex-col gap-1.5">{rows}</div>
}

function renderNode(node: WorkflowTreeNode, time: TimeRange, depth: number): { element: ReactNode; end: TimeRange } {
    const action = node.action
    if (action.type === 'wait_until_condition') {
        return { element: <WaitForEvent key={action.id} node={node} time={time} depth={depth} />, end: time }
    }
    if (node.branches.length > 0) {
        return { element: <Split key={action.id} node={node} time={time} depth={depth} />, end: time }
    }
    const end = addTime(time, action, false)
    return { element: <StepRow key={action.id} action={action} time={time} end={end} />, end }
}

function StepRow({ action, time, end }: { action: HogFlowAction; time: TimeRange; end: TimeRange }): JSX.Element {
    const { workflow } = useDoc()
    switch (action.type) {
        case 'trigger': {
            const { lead, subject } = describeTrigger(workflow, action)
            return (
                <Row action={action} when="Start" icon={<IconBolt />} tone="trigger">
                    <Eyebrow>Who enters</Eyebrow>
                    <div className="text-[15px]">
                        {lead} <strong>{subject}</strong>
                    </div>
                </Row>
            )
        }
        case 'function_email':
            return <EmailRow action={action} time={time} />
        case 'delay':
            return (
                <Row action={action} when={formatWhen(end)} icon={<IconClock />} tone="wait" compact>
                    Wait <strong>{durationInWords(action.config.delay_duration)}</strong>
                </Row>
            )
        case 'wait_until_time_window':
            return (
                <Row action={action} when={formatWhen(end)} icon={<IconCalendar />} tone="wait" compact>
                    Wait for <strong>{describeTimeWindow(action)}</strong>
                </Row>
            )
        case 'exit':
            return (
                <Row action={action} when="End" icon={<IconFlag />} tone="exit">
                    <Eyebrow>The flow ends</Eyebrow>
                    <div className="text-[15px]">{(action.config as any)?.reason || action.name}</div>
                    <div className="text-[13px] text-secondary">{EXIT_RULE_WORDS[workflow.exit_condition]}</div>
                </Row>
            )
        default:
            return (
                <Row action={action} when={formatWhen(time)} icon={<IconBolt />} tone="action" compact>
                    {action.name}
                    {action.description && <span className="text-secondary"> · {action.description}</span>}
                </Row>
            )
    }
}

const TONES: Record<string, string> = {
    trigger: 'bg-[#1d4aff1a] text-[#1d4aff]',
    email: 'bg-[#f54e001a] text-[#c43e00]',
    wait: 'bg-fill-highlight-100 text-secondary',
    exit: 'bg-[#2f9e441a] text-[#2f9e44]',
    action: 'bg-fill-highlight-100 text-secondary',
    split: 'bg-[#9b51e01a] text-[#7c3aad]',
}

function Row({
    action,
    when,
    icon,
    tone,
    compact,
    children,
    aside,
}: {
    action: HogFlowAction
    when: string
    icon: ReactNode
    tone: keyof typeof TONES
    compact?: boolean
    children: ReactNode
    aside?: ReactNode
}): JSX.Element {
    const { openStep, selectedActionId, editing } = useDoc()
    const selected = selectedActionId === action.id
    return (
        <div className="group grid grid-cols-[4.5rem_1fr] items-start gap-2" data-attr="workflow-document-step">
            <div
                className={clsx(
                    'pt-1 text-right text-[11px] font-medium uppercase tracking-wide text-tertiary',
                    compact ? 'pt-1' : 'pt-2.5'
                )}
            >
                {when}
            </div>
            <div
                role="button"
                tabIndex={0}
                onClick={() => openStep(action.id)}
                onKeyDown={(event) => event.key === 'Enter' && openStep(action.id)}
                className={clsx(
                    'relative flex cursor-pointer items-start gap-2.5 rounded-md border text-left transition-colors',
                    compact
                        ? 'border-transparent px-2 py-1 hover:border-primary'
                        : 'bg-surface-primary px-3 py-2 hover:border-[var(--border-bold)]',
                    selected && '!border-[var(--accent)] ring-2 ring-[var(--accent)]/20'
                )}
            >
                <span
                    className={clsx(
                        'mt-0.5 flex shrink-0 items-center justify-center rounded text-base',
                        compact ? 'size-5' : 'size-7',
                        TONES[tone]
                    )}
                >
                    {icon}
                </span>
                <div className={clsx('min-w-0 flex-1', compact && 'text-[14px] leading-6')}>{children}</div>
                {aside}
                {editing && !['trigger', 'exit'].includes(action.type) && (
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
                        <LemonButton
                            size="xsmall"
                            icon={<IconCopy />}
                            tooltip="Duplicate"
                            onClick={(e) => e.stopPropagation()}
                        />
                        <LemonButton
                            size="xsmall"
                            icon={<IconTrash />}
                            tooltip="Delete"
                            status="danger"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                )}
            </div>
        </div>
    )
}

function Eyebrow({ children }: { children: ReactNode }): JSX.Element {
    return <div className="text-[11px] font-semibold uppercase tracking-wide text-tertiary">{children}</div>
}

function EmailRow({ action, time }: { action: HogFlowAction; time: TimeRange }): JSX.Element {
    const { openStep } = useDoc()
    const email = getEmailContent(action)!
    return (
        <Row
            action={action}
            when={formatWhen(time)}
            icon={<IconLetter />}
            tone="email"
            aside={
                <LemonButton
                    size="xsmall"
                    type="secondary"
                    icon={<IconEye />}
                    onClick={(event) => {
                        event.stopPropagation()
                        openStep(action.id, 'preview')
                    }}
                >
                    Preview
                </LemonButton>
            }
        >
            <Eyebrow>Sends email</Eyebrow>
            <div className="text-[15px] font-semibold leading-snug">{email.subject}</div>
            {email.preheader && <div className="text-[13px] text-secondary">{email.preheader}</div>}
            <div className="mt-1 line-clamp-2 border-l-2 pl-2 text-[13px] leading-snug text-secondary">{email.glimpse}</div>
            {email.cta && (
                <div className="mt-1.5 text-[12px] text-tertiary">
                    Button:{' '}
                    <span className="rounded bg-fill-highlight-100 px-1.5 py-0.5 text-secondary">{email.cta}</span>
                </div>
            )}
        </Row>
    )
}

function WaitForEvent({ node, time, depth }: { node: WorkflowTreeNode; time: TimeRange; depth: number }): JSX.Element {
    const { workflow } = useDoc()
    const action = node.action
    const maxWait = action.type === 'wait_until_condition' ? action.config.max_wait_duration : undefined
    const nonEmpty = node.branches.filter((b) => b.sequence.nodes.length > 0)
    const empty = node.branches.filter((b) => b.sequence.nodes.length === 0)
    const flattened = nonEmpty.length <= 1
    const timeoutSide = nonEmpty[0]?.edge.type === 'continue'

    return (
        <>
            <Row action={action} when={formatWhen(time)} icon={<IconClock />} tone="wait" compact>
                Wait up to <strong>{durationInWords(maxWait)}</strong> for <strong>{describeWaitEvent(action)}</strong>
                {empty.map((branch) => (
                    <Outcome
                        key={branchKey(node, branch)}
                        node={node}
                        label={describeBranchCondition(workflow, node, branch)}
                    />
                ))}
                {flattened && nonEmpty[0] && (
                    <div className="text-[13px] text-secondary">
                        ↓ {describeBranchCondition(workflow, node, nonEmpty[0])}: continue below
                    </div>
                )}
            </Row>
            {flattened && nonEmpty[0] ? (
                <Sequence
                    sequence={nonEmpty[0].sequence}
                    start={addTime(time, action, timeoutSide)}
                    depth={depth}
                    after={node.joinAction}
                />
            ) : (
                <Branches node={node} time={time} depth={depth} />
            )}
        </>
    )
}

function Outcome({ node, label }: { node: WorkflowTreeNode; label: string }): JSX.Element {
    const join = node.joinAction
    return (
        <div className="text-[13px]">
            <span className="text-secondary">↳ {label}:</span>{' '}
            {!join || join.type === 'exit' ? (
                <span className="font-medium text-[#2f9e44]">the flow ends for them</span>
            ) : (
                <span>
                    skips to <strong>{join.name}</strong>
                </span>
            )}
        </div>
    )
}

function Split({ node, time, depth }: { node: WorkflowTreeNode; time: TimeRange; depth: number }): JSX.Element {
    const { workflow } = useDoc()
    const warning = splitWarning(workflow, node.action)
    const empty = node.branches.filter((b) => b.sequence.nodes.length === 0)
    const nonEmptyCount = node.branches.length - empty.length
    return (
        <>
            <Row action={node.action} when={formatWhen(time)} icon={<IconShuffle />} tone="split" compact>
                <strong>{describeSplit(workflow, node.action)}</strong>
                <span className="text-secondary"> into {nonEmptyCount} paths</span>
                {empty.map((branch) => (
                    <Outcome
                        key={branchKey(node, branch)}
                        node={node}
                        label={describeBranchCondition(workflow, node, branch)}
                    />
                ))}
                {warning && (
                    <div className="mt-1 rounded bg-warning-highlight px-2 py-1 text-[12px] text-primary">
                        ⚠ {warning}
                    </div>
                )}
            </Row>
            <Branches node={node} time={time} depth={depth} />
            {node.joinAction && node.joinAction.type !== 'exit' && depth === 0 && (
                <div className="pl-[5.5rem] text-[13px] text-secondary">All paths meet again here ↓</div>
            )}
        </>
    )
}

function Branches({ node, time, depth }: { node: WorkflowTreeNode; time: TimeRange; depth: number }): JSX.Element {
    const { workflow, followed, collapsed, toggleFollow, toggleCollapsed } = useDoc()
    const nonEmpty = node.branches.filter((b) => b.sequence.nodes.length > 0)
    const keys = nonEmpty.map((b) => branchKey(node, b))
    const anyFollowed = keys.some((k) => followed.has(k))

    return (
        <div className="flex flex-col gap-2 pl-[5rem] @max-[40rem]/doc:pl-4">
            {nonEmpty.map((branch, index) => {
                const key = keys[index]
                const color = PATH_COLORS[index % PATH_COLORS.length]
                const isCollapsed = collapsed.has(key)
                const dimmed = anyFollowed && !followed.has(key)
                return (
                    <section
                        key={key}
                        className={clsx(
                            'rounded-md border border-l-4 bg-surface-primary transition-opacity',
                            dimmed && 'opacity-35'
                        )}
                        style={{ borderLeftColor: color }}
                    >
                        <header className="flex items-center gap-2 px-3 py-1.5">
                            <button
                                type="button"
                                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                                onClick={() => toggleCollapsed(key)}
                            >
                                <PathLetter index={index} />
                                <span className="text-[14px] font-semibold">
                                    {describeBranchCondition(workflow, node, branch)}
                                </span>
                                <span className="text-[12px] text-tertiary">{isCollapsed ? '▸ show steps' : ''}</span>
                            </button>
                            <LemonButton
                                size="xsmall"
                                type="tertiary"
                                icon={<IconEye />}
                                onClick={() => toggleFollow(key)}
                                tooltip="Dim the other paths"
                            >
                                {followed.has(key) ? 'Following' : 'Follow'}
                            </LemonButton>
                        </header>
                        <div className="px-1 pb-2">
                            {isCollapsed ? (
                                <PathStrip sequence={branch.sequence} onExpand={() => toggleCollapsed(key)} />
                            ) : (
                                <Sequence
                                    sequence={branch.sequence}
                                    start={time}
                                    depth={depth + 1}
                                    after={branch.sequence.continueTo ?? node.joinAction}
                                />
                            )}
                        </div>
                    </section>
                )
            })}
        </div>
    )
}

function PathStrip({
    sequence,
    onExpand,
    compact,
}: {
    sequence: WorkflowTreeSequence
    onExpand?: () => void
    compact?: boolean
}): JSX.Element {
    const { openStep, workflow } = useDoc()
    const items: ReactNode[] = []
    const chip = (key: string, onClick: () => void, content: ReactNode, strong?: boolean): void => {
        items.push(
            <button
                key={key}
                type="button"
                onClick={onClick}
                className={clsx(
                    'cursor-pointer rounded px-1 py-0.5 text-left text-[13px] hover:bg-fill-highlight-100',
                    strong && 'font-medium text-primary'
                )}
            >
                {content}
            </button>
        )
    }
    const walk = (seq: WorkflowTreeSequence): void => {
        for (const node of seq.nodes) {
            const action = node.action
            const email = getEmailContent(action)
            if (email) {
                chip(action.id, () => openStep(action.id, 'preview'), <>✉ {email.subject}</>, true)
            } else if (action.type === 'delay') {
                chip(action.id, () => openStep(action.id), <>wait {durationInWords(action.config.delay_duration)}</>)
            } else if (action.type === 'wait_until_time_window') {
                chip(
                    action.id,
                    () => openStep(action.id),
                    <>{describeTimeWindow(action).replace(/^the next /, 'next ')}</>
                )
            } else if (action.type === 'wait_until_condition') {
                const continuing = node.branches.find((b) => b.sequence.nodes.length > 0)
                const endsOn = node.branches.find((b) => b.sequence.nodes.length === 0)
                chip(
                    action.id,
                    () => openStep(action.id),
                    <>
                        {endsOn && continuing?.edge.type === 'continue'
                            ? `if no ${describeWaitEvent(action)} within ${durationInWords(action.config.max_wait_duration)}`
                            : `wait up to ${durationInWords(action.config.max_wait_duration)} for ${describeWaitEvent(action)}`}
                    </>
                )
                if (continuing) {
                    walk(continuing.sequence)
                }
                return
            } else if (node.branches.length > 0) {
                const emails = node.branches.reduce((sum, b) => sum + collectEmails(b.sequence).length, 0)
                const first = collectEmails(node.branches[0].sequence)[0]
                chip(
                    action.id,
                    () => openStep(action.id),
                    <>
                        {describeSplit(workflow, action).toLowerCase()} → {emails} emails
                        {first ? <>, e.g. ✉ {getEmailContent(first)?.subject}</> : null}
                    </>
                )
                return
            } else if (action.type !== 'exit') {
                chip(action.id, () => openStep(action.id), action.name)
            }
        }
    }
    walk(sequence)
    return (
        <div className={clsx('flex flex-wrap items-center gap-x-0.5 gap-y-0.5 text-secondary', !compact && 'px-2')}>
            {items.flatMap((item, index) => (index ? [<span key={`sep-${index}`}>→</span>, item] : [item]))}
            <span>→</span>
            <span className="px-1 text-[13px] font-medium text-[#2f9e44]">ends</span>
            {onExpand && (
                <LemonButton size="xsmall" type="tertiary" onClick={onExpand}>
                    Expand
                </LemonButton>
            )}
        </div>
    )
}

function PathEnd(): JSX.Element {
    return (
        <div className="grid grid-cols-[4.5rem_1fr] gap-2">
            <div />
            <div className="flex items-center gap-1.5 px-2 text-[13px] font-medium text-[#2f9e44]">
                <IconFlag /> The flow ends for them
            </div>
        </div>
    )
}

function InsertPoint(): JSX.Element {
    const { openAdd } = useDoc()
    return (
        <div className="group/insert grid grid-cols-[4.5rem_1fr] gap-2">
            <div />
            <button
                type="button"
                onClick={openAdd}
                className="flex h-4 cursor-pointer items-center gap-1 text-[12px] text-tertiary opacity-40 hover:opacity-100"
            >
                <span className="h-px flex-1 bg-[var(--border)]" />
                <IconPlus /> Add step
                <span className="h-px flex-1 bg-[var(--border)]" />
            </button>
        </div>
    )
}

function DrawerPanel({
    drawer,
    onClose,
    onTab,
    onWorkflowTab,
}: {
    drawer: NonNullable<Drawer>
    onClose: () => void
    onTab: (actionId: string, tab: StepTab) => void
    onWorkflowTab: (tab: WorkflowTab) => void
}): JSX.Element {
    const { workflow } = useDoc()
    const action = drawer.kind === 'step' ? workflow.actions.find((a) => a.id === drawer.actionId) : null
    const email = action ? getEmailContent(action) : null
    const stepTabs: StepTab[] = email
        ? ['preview', 'settings', 'test', 'metrics', 'logs']
        : ['settings', 'test', 'metrics', 'logs']
    const workflowTitles: Record<WorkflowTab, string> = {
        variables: 'Variables',
        test: 'Test this flow',
        metrics: 'Metrics',
        logs: 'Logs',
        add: 'Add a step',
    }

    return (
        <div
            className="absolute bottom-0 right-0 top-0 z-20 flex w-[30rem] max-w-[92%] flex-col border-l bg-surface-primary shadow-xl"
            data-attr="workflow-document-drawer"
        >
            <div className="flex shrink-0 items-center gap-2 border-b px-2 py-1.5">
                {drawer.kind === 'step' ? (
                    <div className="flex min-w-0 flex-1 gap-1">
                        {stepTabs.map((tab) => (
                            <LemonButton
                                key={tab}
                                size="xsmall"
                                active={drawer.tab === tab}
                                onClick={() => onTab(drawer.actionId, tab)}
                            >
                                {tab[0].toUpperCase() + tab.slice(1)}
                            </LemonButton>
                        ))}
                    </div>
                ) : (
                    <div className="flex-1 px-1 font-semibold">{workflowTitles[drawer.tab]}</div>
                )}
                <LemonButton size="small" icon={<IconX />} onClick={onClose} aria-label="Close" />
            </div>
            {drawer.kind === 'step' && drawer.tab !== 'preview' && <HogFlowEditorPanelSelectedStep />}
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                {drawer.kind === 'step' && drawer.tab === 'preview' && email && (
                    <div className="flex flex-col gap-2 p-3">
                        <div className="text-[12px] text-secondary">
                            To {email.to} · Subject <strong className="text-primary">{email.subject}</strong>
                        </div>
                        <iframe
                            title="Email preview"
                            srcDoc={email.html}
                            sandbox=""
                            className="h-[32rem] w-full rounded border bg-white"
                        />
                        <LemonButton type="secondary" size="small" onClick={() => onTab(drawer.actionId, 'settings')}>
                            Edit this email
                        </LemonButton>
                    </div>
                )}
                {drawer.kind === 'step' && drawer.tab === 'settings' && <HogFlowEditorPanelBuildDetail />}
                {drawer.kind === 'step' &&
                    drawer.tab === 'test' &&
                    (action?.type === 'function_email' ? <EmailActionTestContent /> : <HogFlowEditorPanelTest />)}
                {drawer.kind === 'step' && drawer.tab === 'metrics' && <HogFlowEditorPanelMetrics />}
                {drawer.kind === 'step' && drawer.tab === 'logs' && <HogFlowEditorPanelLogs />}
                {drawer.kind === 'workflow' && drawer.tab === 'variables' && <HogFlowEditorPanelVariables />}
                {drawer.kind === 'workflow' && drawer.tab === 'test' && <HogFlowEditorPanelTest />}
                {drawer.kind === 'workflow' && drawer.tab === 'metrics' && <HogFlowEditorPanelMetrics />}
                {drawer.kind === 'workflow' && drawer.tab === 'logs' && <HogFlowEditorPanelLogs />}
                {drawer.kind === 'workflow' && drawer.tab === 'add' && <HogFlowEditorPanelBuild />}
            </div>
            {drawer.kind === 'workflow' && drawer.tab === 'add' && (
                <div className="border-t p-2 text-[12px] text-secondary">
                    Prototype: picking a step here would insert it at the spot you clicked.{' '}
                    <LemonButton size="xsmall" type="tertiary" onClick={() => onWorkflowTab('variables')}>
                        Variables
                    </LemonButton>
                </div>
            )}
        </div>
    )
}
