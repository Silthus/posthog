// PROTOTYPE (ticket #78). Throwaway.
import { IconCode, IconExternal } from '@posthog/icons'
import { Link, Tooltip } from '@posthog/lemon-ui'

import { CopyToClipboardInline } from 'lib/components/CopyToClipboard'

import type { HogFlow } from '../hogflows/types'
import { workflowSource } from './workflowSourceLink'

/**
 * The same three source parts as the row, shortened to fit a header that already carries tags and
 * controls: the file links out, the repository and the ref follow as plain text.
 */
export function WorkflowSourceInline({
    workflow,
    pathOnly,
}: {
    workflow: HogFlow | null | undefined
    /** Drops the repository and the ref, for a place that only has room for the file. */
    pathOnly?: boolean
}): JSX.Element | null {
    const source = workflowSource(workflow)
    if (!source) {
        return <span className="text-xs text-secondary">No source file recorded yet</span>
    }

    return (
        <span className="flex min-w-0 items-center gap-1 text-xs text-secondary">
            {!pathOnly && <IconCode className="shrink-0" />}
            {source.link ? (
                <Link to={source.link} target="_blank" className="truncate">
                    {source.path}
                </Link>
            ) : (
                <span className="truncate">{source.path}</span>
            )}
            {pathOnly ? null : (
                <>
                    <span className="shrink-0" aria-hidden>
                        ·
                    </span>
                    <span className="truncate">{source.repositoryLabel}</span>
                    <span className="shrink-0 whitespace-nowrap">· {source.refLabel}</span>
                </>
            )}
        </span>
    )
}

/**
 * The one-line row under the scene title that says which file owns this workflow. Four states:
 * linked, unknown host, no pointer recorded yet, and released back to the UI.
 */
export function WorkflowSourceRow({ workflow }: { workflow: HogFlow }): JSX.Element | null {
    const source = workflowSource(workflow)
    const released = workflow.managed_by !== 'code'

    if (!source) {
        if (released) {
            return null
        }
        return (
            <div className="text-sm text-secondary">No source file recorded yet. It appears after the next push.</div>
        )
    }

    if (released) {
        return (
            <div className="text-sm text-secondary">
                Last pushed from {source.path} in {source.repositoryLabel}.
            </div>
        )
    }

    return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-secondary">
            <IconCode className="shrink-0" />
            {source.link ? (
                <Link to={source.link} target="_blank" className="flex items-center gap-1">
                    {source.path}
                    <IconExternal className="text-xs" />
                </Link>
            ) : (
                <Tooltip title="This host is not one we can link to. Copy the path instead.">
                    <CopyToClipboardInline explicitValue={source.path} iconSize="xsmall" description="file path">
                        {source.path}
                    </CopyToClipboardInline>
                </Tooltip>
            )}
            <span aria-hidden>·</span>
            <CopyToClipboardInline
                explicitValue={source.repository}
                iconSize="xsmall"
                description="repository"
                className="truncate max-w-60"
            >
                {source.repositoryLabel}
            </CopyToClipboardInline>
            <span aria-hidden>·</span>
            <span className="whitespace-nowrap">
                last pushed{' '}
                <CopyToClipboardInline explicitValue={source.ref} iconSize="xsmall" description="ref">
                    {source.refLabel}
                </CopyToClipboardInline>
            </span>
        </div>
    )
}
