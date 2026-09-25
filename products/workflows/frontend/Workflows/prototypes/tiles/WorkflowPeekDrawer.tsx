// PROTOTYPE (throwaway): a quick look at one workflow or template in a drawer over the list: the full
// step list in walking order, every dispatch and the flow thumbnail.
import { useActions, useValues } from 'kea'

import { LemonButton, LemonTag } from '@posthog/lemon-ui'

import { LemonDrawer } from 'lib/lemon-ui/LemonDrawer'
import { urls } from 'scenes/urls'

import { getHogFlowStep } from '../../hogflows/steps/HogFlowSteps'
import type { WorkflowListItem } from '../shared/workflowListItems'
import { ActivitySparkline } from './ActivitySparkline'
import { DispatchList } from './DispatchList'
import { MiniCanvas } from './MiniCanvas'
import { tilesVariantLogic } from './tilesVariantLogic'
import { TriggerLine } from './TriggerLine'
import { STATUS_TAGS, startFromTemplate, useTileSummary } from './WorkflowTile'

function PeekBody({ item }: { item: WorkflowListItem }): JSX.Element {
    const { trigger, steps, dispatches } = useTileSummary(item)
    return (
        <div className="flex flex-col gap-4">
            {item.description ? <p className="text-secondary m-0 whitespace-pre-wrap">{item.description}</p> : null}
            <section className="flex flex-col gap-1">
                <h4 className="text-xs uppercase text-secondary m-0">Trigger</h4>
                <TriggerLine trigger={trigger} />
            </section>
            <section className="flex gap-4">
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                    <h4 className="text-xs uppercase text-secondary m-0">{`Steps (${steps.length})`}</h4>
                    <ol className="flex flex-col gap-1 m-0 pl-0 list-none">
                        {steps.map(({ action, branches }, index) => {
                            const step = getHogFlowStep(action as any, {})
                            const preview = step?.previews?.map((p) => p.label).filter((l) => typeof l === 'string')
                            return (
                                <li key={action.id} className="flex items-start gap-2 min-w-0">
                                    <span className="text-xs text-tertiary w-4 text-right shrink-0 mt-0.5">
                                        {index + 1}
                                    </span>
                                    <span
                                        className="flex shrink-0 rounded p-0.5 text-sm"
                                        // eslint-disable-next-line react/forbid-dom-props
                                        style={{ backgroundColor: `${step?.color}20`, color: step?.color }}
                                    >
                                        {step?.icon}
                                    </span>
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-sm truncate">{action.name}</span>
                                        {preview?.length || branches > 1 ? (
                                            <span className="text-xs text-secondary truncate">
                                                {[preview?.join(' · '), branches > 1 ? `${branches} paths` : null]
                                                    .filter(Boolean)
                                                    .join(' · ')}
                                            </span>
                                        ) : null}
                                    </div>
                                </li>
                            )
                        })}
                    </ol>
                </div>
                <MiniCanvas item={item} className="w-14 shrink-0 self-start" />
            </section>
            <section className="flex flex-col gap-1">
                <h4 className="text-xs uppercase text-secondary m-0">{`Dispatches (${dispatches.length})`}</h4>
                <DispatchList item={item} dispatches={dispatches} />
            </section>
            {item.kind === 'workflow' ? (
                <section className="flex flex-col gap-1">
                    <h4 className="text-xs uppercase text-secondary m-0">Last 7 days</h4>
                    <ActivitySparkline workflowId={item.id} />
                </section>
            ) : null}
        </div>
    )
}

export function WorkflowPeekDrawer(): JSX.Element {
    const { peekItem } = useValues(tilesVariantLogic)
    const { closePeek } = useActions(tilesVariantLogic)

    return (
        <LemonDrawer
            isOpen={!!peekItem}
            onClose={closePeek}
            width={420}
            overlayTransparent
            title={
                peekItem ? (
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate">{peekItem.leafName}</span>
                        <LemonTag type={STATUS_TAGS[peekItem.status].type}>
                            {STATUS_TAGS[peekItem.status].label}
                        </LemonTag>
                    </div>
                ) : (
                    'Quick look'
                )
            }
            description={peekItem?.path.length ? peekItem.path.join(' / ') : undefined}
            footer={
                peekItem ? (
                    peekItem.kind === 'template' ? (
                        <LemonButton type="primary" onClick={() => startFromTemplate(peekItem)}>
                            Use template
                        </LemonButton>
                    ) : (
                        <LemonButton type="primary" to={urls.workflow(peekItem.id, 'workflow')}>
                            Open workflow
                        </LemonButton>
                    )
                ) : null
            }
            data-attr="workflows-prototype-peek"
        >
            {peekItem ? <PeekBody item={peekItem} /> : null}
        </LemonDrawer>
    )
}
