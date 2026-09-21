import { createElement, type ReactNode } from 'react'

import {
    IconCode,
    IconCommit,
    IconExternal,
    IconGitBranch,
    IconGitRepository,
    IconInfo,
    type IconComponent,
    type IconProps,
} from '@posthog/icons'
import { LemonTag, Link, Tooltip } from '@posthog/lemon-ui'
import { GitMetadataParser } from '@posthog/products-error-tracking/frontend/components/ReleasesPreview/gitMetadataParser'

import { LemonDropdown } from 'lib/lemon-ui/LemonDropdown'
import { ProfilePicture } from 'lib/lemon-ui/ProfilePicture'
import { ButtonPrimitive } from 'lib/ui/Button/ButtonPrimitives'
import { copyToClipboard } from 'lib/utils/copyToClipboard'

import type { UserBasicType } from '~/types'

import type { HogFlowRevisionBasicApi } from '../../generated/api.schemas'

/**
 * The push a revision came from. Typed here because the backend field is still a build item; every
 * key is optional in practice, so each part renders on its own.
 */
export interface HogFlowRevisionSource {
    commit?: string | null
    ref?: string | null
    repository?: string | null
    path?: string | null
    run_url?: string | null
    author?: string | null
    message?: string | null
}

export type RevisionCreatedVia = 'web' | 'mcp' | 'self_driving' | 'api'

export type WorkflowRevisionRow = HogFlowRevisionBasicApi & {
    source?: HogFlowRevisionSource | null
    created_via?: RevisionCreatedVia | null
}

/** Who to credit when no person and no commit author is recorded. */
function createdViaLabel(createdVia: RevisionCreatedVia | null | undefined): string {
    switch (createdVia) {
        case 'web':
            return 'Someone in this project'
        case 'mcp':
            return 'An agent'
        case 'self_driving':
            return 'PostHog'
        default:
            return 'The API'
    }
}

function CopyPill({
    icon,
    children,
    tooltip,
    onClick,
}: {
    icon: IconComponent<IconProps>
    children: ReactNode
    tooltip: string
    onClick: () => void
}): JSX.Element {
    return (
        <Tooltip title={tooltip}>
            <LemonTag
                className="bg-fill-primary cursor-pointer hover:bg-fill-secondary max-w-full"
                onClick={onClick}
                type="muted"
            >
                {createElement(icon, { className: 'text-sm text-secondary shrink-0' })}
                <span className="truncate">{children}</span>
            </LemonTag>
        </Tooltip>
    )
}

function SourcePopoverContent({ source }: { source: HogFlowRevisionSource }): JSX.Element {
    return (
        <div className="p-2 flex flex-col gap-1 max-w-80">
            <div className="text-secondary text-xs">Source</div>
            {source.message && <div className="text-sm">{source.message}</div>}
            <div className="flex flex-col items-start gap-1">
                {source.run_url && (
                    <Link to={source.run_url} target="_blank">
                        <ButtonPrimitive size="xs" className="text-accent">
                            <IconExternal />
                            Open the run
                        </ButtonPrimitive>
                    </Link>
                )}
                {source.ref && (
                    <CopyPill
                        icon={IconGitBranch}
                        tooltip="Copy the ref"
                        onClick={() => void copyToClipboard(source.ref!, 'ref')}
                    >
                        {source.ref}
                    </CopyPill>
                )}
                {source.repository && (
                    <CopyPill
                        icon={IconGitRepository}
                        tooltip="Copy the repository"
                        onClick={() => void copyToClipboard(source.repository!, 'repository')}
                    >
                        {source.repository}
                    </CopyPill>
                )}
                {source.path && (
                    <CopyPill
                        icon={IconCode}
                        tooltip="Copy the file path"
                        onClick={() => void copyToClipboard(source.path!, 'file path')}
                    >
                        {source.path}
                    </CopyPill>
                )}
            </div>
        </div>
    )
}

/**
 * The commit a revision came from. A host we cannot build a link for (a self-hosted GitLab, say) gets
 * copyable text instead of a link that would 404.
 */
export function RevisionSourceCell({ revision }: { revision: WorkflowRevisionRow }): JSX.Element {
    const source = revision.source
    if (!source) {
        return <span className="text-secondary">Not from a push</span>
    }

    const shortCommit = source.commit ? source.commit.slice(0, 7) : null
    const commitLink = source.repository
        ? GitMetadataParser.getCommitLink(`https://${source.repository}`, source.commit ?? undefined)
        : undefined

    return (
        <div className="flex items-center gap-1 min-w-0">
            {shortCommit ? (
                commitLink ? (
                    <Tooltip title={source.message ?? 'Open the commit'}>
                        <Link to={commitLink} target="_blank" className="font-mono text-xs whitespace-nowrap">
                            {shortCommit}
                        </Link>
                    </Tooltip>
                ) : (
                    <Tooltip
                        title={
                            <>
                                {source.message && <div>{source.message}</div>}
                                <div className="text-xs">Click to copy the commit sha</div>
                            </>
                        }
                    >
                        <span
                            className="font-mono text-xs whitespace-nowrap cursor-pointer"
                            onClick={() => void copyToClipboard(source.commit!, 'commit sha')}
                        >
                            {shortCommit}
                        </span>
                    </Tooltip>
                )
            ) : (
                <span className="text-secondary text-xs">No commit</span>
            )}
            {source.ref && (
                <LemonTag type="muted" className="hidden @[36rem]/revisions:inline-flex max-w-32">
                    <span className="truncate">{source.ref}</span>
                </LemonTag>
            )}
            <LemonDropdown
                overlay={<SourcePopoverContent source={source} />}
                placement="bottom-start"
                closeOnClickInside={false}
            >
                <ButtonPrimitive size="xs" iconOnly aria-label="Show where this version came from">
                    <IconInfo className="text-secondary" />
                </ButtonPrimitive>
            </LemonDropdown>
        </div>
    )
}

/** Credits a revision: the commit author first, then the person, then whatever made the call. */
export function RevisionChangedByCell({ revision }: { revision: WorkflowRevisionRow }): JSX.Element {
    if (revision.source?.author) {
        return (
            <Tooltip title="Commit author">
                <span className="flex items-center gap-2 whitespace-nowrap">
                    <IconCommit className="text-secondary" />
                    {revision.source.author}
                </span>
            </Tooltip>
        )
    }
    if (revision.created_by) {
        return (
            <span className="flex items-center gap-2">
                {/* The generated hedgehog_config shape differs from the app type in
                    ways ProfilePicture never reads; the display fields match. */}
                <ProfilePicture user={revision.created_by as UserBasicType} size="md" showName />
            </span>
        )
    }
    return <span className="text-secondary">{createdViaLabel(revision.created_via)}</span>
}

/** Why a code-managed workflow cannot be restored from here, and what to do instead. */
export const codeManagedWorkflowRestoreReason = 'Revert the commit and push.'
