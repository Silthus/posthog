// PROTOTYPE ONLY (silthus/posthog#212). Floating scenario knobs. Not part of the proposed UI.
import { useActions, useValues } from 'kea'
import { useEffect, useState } from 'react'

import { IconChevronDown, IconChevronLeft, IconChevronRight } from '@posthog/icons'
import { LemonButton, LemonSegmentedButton } from '@posthog/lemon-ui'

import { firstRunPrototypeLogic } from './firstRunPrototypeLogic'
import { OwnDomain, ProjectData } from './firstRunScenario'
import { HOME_VARIANTS, HomeVariant } from './homeVariants'

const STORY_URL = window.location.href

function storyUrlFor(variant: HomeVariant): string {
    const url = new URL(STORY_URL)
    url.searchParams.set('variant', variant)
    return url.toString()
}

export function PrototypeBar(): JSX.Element {
    const [open, setOpen] = useState(false)
    const { projectData, ownDomain, homeVariant, workflowCreated } = useValues(firstRunPrototypeLogic)
    const { setProjectData, setOwnDomain, setHomeVariant } = useActions(firstRunPrototypeLogic)
    const index = HOME_VARIANTS.findIndex((variant) => variant.key === homeVariant)
    const current = HOME_VARIANTS[index]
    const step = (delta: number): void =>
        setHomeVariant(HOME_VARIANTS[(index + delta + HOME_VARIANTS.length) % HOME_VARIANTS.length].key)

    useEffect(() => {
        const onKey = (event: KeyboardEvent): void => {
            const target = event.target as HTMLElement | null
            if (workflowCreated || target?.closest('input, textarea, [contenteditable]')) {
                return
            }
            if (event.key === 'ArrowLeft') {
                step(-1)
            } else if (event.key === 'ArrowRight') {
                step(1)
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    })

    return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[1000] flex flex-wrap items-center gap-3 rounded-lg border-2 border-dashed border-warning bg-surface-primary px-3 py-2 shadow-xl text-xs">
            <LemonButton
                size="xsmall"
                icon={open ? <IconChevronDown /> : <IconChevronRight />}
                onClick={() => setOpen(!open)}
            >
                Prototype #212
            </LemonButton>
            {!workflowCreated && (
                <span className="flex items-center gap-1">
                    <LemonButton size="xsmall" icon={<IconChevronLeft />} onClick={() => step(-1)} />
                    <span className="flex flex-col items-center min-w-[13rem]">
                        <span className="font-semibold">
                            {current.key} · {current.name}
                        </span>
                        <span className="text-secondary">{current.oneLiner}</span>
                    </span>
                    <LemonButton size="xsmall" icon={<IconChevronRight />} onClick={() => step(1)} />
                </span>
            )}
            {open && (
                <>
                    <span className="flex items-center gap-2">
                        Project data
                        <LemonSegmentedButton<ProjectData>
                            size="xsmall"
                            value={projectData}
                            onChange={setProjectData}
                            options={[
                                { value: 'signups-and-emails', label: 'Signups and emails' },
                                { value: 'few-emails', label: 'Few emails' },
                                { value: 'nothing-yet', label: 'Nothing yet' },
                            ]}
                        />
                    </span>
                    <span className="flex items-center gap-2">
                        Own domain
                        <LemonSegmentedButton<OwnDomain>
                            size="xsmall"
                            value={ownDomain}
                            onChange={setOwnDomain}
                            options={[
                                { value: 'none', label: 'None' },
                                { value: 'verifying', label: 'Verifying' },
                                { value: 'verified', label: 'Verified' },
                            ]}
                        />
                    </span>
                    <LemonButton
                        size="xsmall"
                        type="secondary"
                        onClick={() => window.location.assign(storyUrlFor(homeVariant))}
                    >
                        Start over
                    </LemonButton>
                </>
            )}
        </div>
    )
}
