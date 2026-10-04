// PROTOTYPE ONLY (silthus/posthog#212). Floating scenario knobs. Not part of the proposed UI.
import { useActions, useValues } from 'kea'
import { useState } from 'react'

import { IconChevronDown, IconChevronRight } from '@posthog/icons'
import { LemonButton, LemonSegmentedButton } from '@posthog/lemon-ui'

import { firstRunPrototypeLogic } from './firstRunPrototypeLogic'
import { OwnDomain, ProjectData } from './firstRunScenario'

const STORY_URL = window.location.href

export function PrototypeBar(): JSX.Element {
    const [open, setOpen] = useState(false)
    const { projectData, ownDomain } = useValues(firstRunPrototypeLogic)
    const { setProjectData, setOwnDomain } = useActions(firstRunPrototypeLogic)

    return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[1000] flex flex-wrap items-center gap-3 rounded-lg border-2 border-dashed border-warning bg-surface-primary px-3 py-2 shadow-xl text-xs">
            <LemonButton
                size="xsmall"
                icon={open ? <IconChevronDown /> : <IconChevronRight />}
                onClick={() => setOpen(!open)}
            >
                Prototype #212
            </LemonButton>
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
                    <LemonButton size="xsmall" type="secondary" onClick={() => window.location.assign(STORY_URL)}>
                        Start over
                    </LemonButton>
                </>
            )}
        </div>
    )
}
