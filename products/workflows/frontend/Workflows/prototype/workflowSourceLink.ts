// PROTOTYPE (ticket #78). Throwaway. Composes the link the scene header shows from the three
// source parts. The real build promotes GitMetadataParser to a shared location; this file only
// adapts it to the shape HogFlow stores, which is a host and path with no scheme.
import { GitMetadataParser } from '@posthog/products-error-tracking/frontend/components/ReleasesPreview/gitMetadataParser'

import type { HogFlow } from '../hogflows/types'

export interface WorkflowSource {
    /** `owner/repository`, or the raw stored value when it cannot be parsed. */
    repositoryLabel: string
    /** The repo-relative file, verbatim. */
    path: string
    /** 7 characters for a sha, the branch name otherwise. */
    refLabel: string
    /** The raw ref, for copying. */
    ref: string
    /** The stored repository, for copying. */
    repository: string
    /** Undefined when the host is not one the link composer knows. */
    link: string | undefined
}

const SHA = /^[0-9a-f]{40}$/i

function remoteUrl(repository: string): string {
    return repository.startsWith('http') ? repository : `https://${repository}`
}

/** Null when the workflow records no source at all, which is the missing-pointer state. */
export function workflowSource(workflow: HogFlow | null | undefined): WorkflowSource | null {
    const repository = workflow?.source_repository ?? ''
    const path = workflow?.source_path ?? ''
    const ref = workflow?.source_ref ?? ''
    if (!repository && !path && !ref) {
        return null
    }

    const parsed = repository ? GitMetadataParser.parseRemoteUrl(remoteUrl(repository)) : undefined
    const isSha = SHA.test(ref)
    const link = isSha
        ? GitMetadataParser.getCommitLink(remoteUrl(repository), ref)
        : GitMetadataParser.getBranchLink(remoteUrl(repository), ref)

    return {
        repositoryLabel: parsed ? `${parsed.owner}/${parsed.repository}` : repository,
        path,
        refLabel: isSha ? ref.slice(0, 7) : ref,
        ref,
        repository,
        link,
    }
}
