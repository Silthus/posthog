// PROTOTYPE ONLY. Variant C: a gallery of starter recipes graded against the project's own data.
// A recipe opens as a filled-in canvas with a "before this can send" panel next to it.
import { useState } from 'react'

import { IconArrowLeft, IconCheckCircle, IconDecisionTree, IconMegaphone, IconWarning } from '@posthog/icons'
import { LemonButton, LemonCard, LemonSegmentedButton, LemonTag } from '@posthog/lemon-ui'

import { CodeSnippet, Language } from 'lib/components/CodeSnippet'

import { BLANK_TEMPLATE, STARTER_TEMPLATES, StarterTemplate, useBackend } from './prototypeBackend'
import { PeopleCheck } from './shared/PeopleCheck'
import { PlugInSlot } from './shared/PlugInSlot'
import { SenderStep } from './shared/SenderStep'
import { SentLog } from './shared/SentLog'

export function VariantC(): JSX.Element {
    const [openRecipe, setOpenRecipe] = useState<StarterTemplate | null>(null)
    return openRecipe ? (
        <RecipeDetail template={openRecipe} onBack={() => setOpenRecipe(null)} />
    ) : (
        <Gallery onOpen={setOpenRecipe} />
    )
}

function Gallery({ onOpen }: { onOpen: (template: StarterTemplate) => void }): JSX.Element {
    const backend = useBackend()
    const [filter, setFilter] = useState<'all' | 'ready'>('all')
    const recipes = [...STARTER_TEMPLATES, BLANK_TEMPLATE].filter(
        (template) => filter === 'all' || backend.readiness(template).ready
    )

    return (
        <div className="py-6 flex flex-col gap-5">
            <div className="flex items-end justify-between gap-4">
                <div>
                    <h2 className="text-xl font-semibold mb-1">What should happen?</h2>
                    <p className="text-secondary mb-0">
                        Starter recipes, checked against the events and people in this project. Open one to see what is
                        in the way.
                    </p>
                </div>
                <LemonSegmentedButton
                    size="small"
                    value={filter}
                    onChange={setFilter}
                    options={[
                        { value: 'all', label: 'All recipes' },
                        { value: 'ready', label: 'Ready now' },
                    ]}
                />
            </div>
            <div className="grid grid-cols-3 gap-3">
                {recipes.map((template) => {
                    const readiness = backend.readiness(template)
                    return (
                        <LemonCard
                            key={template.id}
                            hoverEffect
                            onClick={() => onOpen(template)}
                            className="cursor-pointer flex flex-col gap-2"
                        >
                            <div className="flex items-center gap-2 text-secondary text-xs">
                                {template.kind === 'broadcast' ? <IconMegaphone /> : <IconDecisionTree />}
                                {template.kind === 'broadcast'
                                    ? 'Broadcast · sent once'
                                    : `Workflow · ${template.triggerLabel}`}
                            </div>
                            <span className="font-semibold">{template.name}</span>
                            <span className="text-sm text-secondary flex-1">{template.description}</span>
                            <div className="flex gap-1 flex-wrap">
                                {readiness.ready ? (
                                    <LemonTag type="success" icon={<IconCheckCircle />}>
                                        Ready now
                                    </LemonTag>
                                ) : (
                                    <>
                                        {readiness.missingEvent && (
                                            <LemonTag type="warning">needs {readiness.missingEvent}</LemonTag>
                                        )}
                                        {readiness.nobodyHasEmail && <LemonTag type="danger">no emails yet</LemonTag>}
                                    </>
                                )}
                                {backend.sender !== 'domain-verified' && (
                                    <LemonTag type="completion">preview to you</LemonTag>
                                )}
                            </div>
                        </LemonCard>
                    )
                })}
            </div>
            {recipes.length === 0 && (
                <div className="text-sm text-secondary">
                    Nothing is ready yet. Switch to all recipes to see what each one needs.
                </div>
            )}
        </div>
    )
}

function RecipeDetail({ template, onBack }: { template: StarterTemplate; onBack: () => void }): JSX.Element {
    const backend = useBackend()
    const readiness = backend.readiness(template)
    const created = backend.state.created.find((m) => m.templateId === template.id)
    const swapTarget = readiness.missingEvent && backend.projectEvents.includes('$pageview') ? '$pageview' : null

    return (
        <div className="py-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
                <LemonButton icon={<IconArrowLeft />} size="small" onClick={onBack}>
                    All recipes
                </LemonButton>
                <h2 className="text-xl font-semibold mb-0">{template.name}</h2>
                <LemonTag>{template.kind}</LemonTag>
            </div>
            <div className="grid grid-cols-[1fr_24rem] gap-6">
                <Canvas template={template} />
                <div className="flex flex-col gap-3">
                    <LemonCard className="flex flex-col gap-4">
                        <div className="text-xs font-semibold uppercase text-secondary">Before this can send</div>
                        <Blocker title="Sender" ok={backend.sender === 'domain-verified'}>
                            <SenderStep compact />
                        </Blocker>
                        <Blocker title="People" ok={readiness.peopleWithoutEmail === 0}>
                            <PeopleCheck compact />
                        </Blocker>
                        {template.triggerEvent && (
                            <Blocker title="Trigger event" ok={!readiness.missingEvent}>
                                {readiness.missingEvent ? (
                                    <div className="flex flex-col gap-2 text-sm">
                                        <span>
                                            This project does not send <code>{readiness.missingEvent}</code> yet.
                                            Capture it where it happens:
                                        </span>
                                        <CodeSnippet language={Language.JavaScript} compact>
                                            {`posthog.capture('${readiness.missingEvent}')`}
                                        </CodeSnippet>
                                        {swapTarget && (
                                            <span className="text-secondary">
                                                Or start from <code>{swapTarget}</code>, which you already send, and
                                                swap later.
                                            </span>
                                        )}
                                    </div>
                                ) : (
                                    <span className="text-sm">
                                        <code>{template.triggerEvent}</code> arrived in this project recently.
                                    </span>
                                )}
                            </Blocker>
                        )}
                        {template.kind === 'broadcast' && (
                            <PlugInSlot name="Audience" does="choose the list this broadcast goes to" />
                        )}
                        <div className="flex flex-col gap-2 pt-2 border-t border-primary">
                            <LemonButton type="secondary" fullWidth onClick={() => backend.sendToMe(template)}>
                                Send a preview to me
                            </LemonButton>
                            {!created ? (
                                <LemonButton type="primary" fullWidth onClick={() => backend.create(template)}>
                                    Use this recipe
                                </LemonButton>
                            ) : created.status === 'draft' ? (
                                <LemonButton type="primary" fullWidth onClick={() => backend.goLive(created.id)}>
                                    {backend.sender === 'domain-verified' ? 'Go live' : 'Go live for me only'}
                                </LemonButton>
                            ) : (
                                <div className="text-sm text-success flex items-center gap-2">
                                    <IconCheckCircle /> Live
                                </div>
                            )}
                        </div>
                    </LemonCard>
                    <SentLog />
                </div>
            </div>
        </div>
    )
}

function Canvas({ template }: { template: StarterTemplate }): JSX.Element {
    return (
        <div className="rounded border border-primary bg-surface-secondary p-6 flex flex-col items-center gap-0 min-h-[28rem]">
            <div className="text-xs text-secondary mb-4 self-start">
                {template.kind === 'broadcast' ? 'Broadcast steps' : 'Workflow canvas (simplified)'}
            </div>
            {template.steps.map((step, index) => (
                <div key={step} className="flex flex-col items-center">
                    <div className="rounded border border-primary bg-surface-primary px-4 py-2 text-sm w-64 text-center shadow-sm">
                        {step}
                    </div>
                    {index < template.steps.length - 1 && <div className="h-6 w-px bg-border-bold" />}
                </div>
            ))}
            <div className="mt-6 w-full">
                <PlugInSlot name="Email brand" does="the email steps render in your brand" />
            </div>
        </div>
    )
}

function Blocker({ title, ok, children }: { title: string; ok: boolean; children: React.ReactNode }): JSX.Element {
    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
                {ok ? <IconCheckCircle className="text-success" /> : <IconWarning className="text-warning" />}
                {title}
            </div>
            <div className="pl-6">{children}</div>
        </div>
    )
}
