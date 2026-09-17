// Identity lives in the source file. After a push learns a workflow's backend id,
// that id is written into the `workflow({ ... })` call of the file that was run, so
// the next commit carries it and the next run skips the lookup by name.
//
// The anchor is the `workflow({` call and the `name:` line inside it. Both are
// present in every workflow file by construction: `workflow()` is the only entry
// point and `name` is a required option.

import { WorkflowError } from './errors'

const WORKFLOW_CALL = /workflow\(\s*\{/

interface OptionsBlock {
    /** Index just past the `{` that opens the options object. */
    readonly start: number
    /** Index of the `}` that closes it. */
    readonly end: number
}

function findOptionsBlock(source: string): OptionsBlock | null {
    const call = WORKFLOW_CALL.exec(source)
    if (!call) {
        return null
    }
    const start = call.index + call[0].length
    let depth = 1
    for (let cursor = start; cursor < source.length; cursor++) {
        const character = source[cursor]
        if (character === '{') {
            depth++
        } else if (character === '}') {
            depth--
            if (depth === 0) {
                return { start, end: cursor }
            }
        }
    }
    return null
}

/**
 * Returns the source with `id: '<id>'` added to the `workflow({ ... })` options,
 * or null when the file already carries an id. Throws when there is nothing to anchor on.
 */
export function withWorkflowId(source: string, id: string, filePath: string): string | null {
    const block = findOptionsBlock(source)
    if (!block) {
        throw new WorkflowError({
            status: 'no_anchor',
            message: `Could not find a workflow({ ... }) call in ${filePath}.`,
            why: 'The id is written in beside the name option, and that call is the only place it can go.',
            fix: `Add id: '${id}' to the workflow({ ... }) options in the file that defines this workflow.`,
        })
    }

    const options = source.slice(block.start, block.end)
    if (/^\s*id\s*:/m.test(options)) {
        return null
    }

    const nameLine = /^([ \t]*)name\s*:/m.exec(options)
    if (!nameLine) {
        throw new WorkflowError({
            status: 'no_anchor',
            message: `Could not find the name option in the workflow({ ... }) call in ${filePath}.`,
            why: 'The id line is inserted above the name line, so the name line is what the write-back anchors on.',
            fix: `Add id: '${id}' to the workflow({ ... }) options yourself, then run again.`,
        })
    }

    const indent = nameLine[1] ?? '    '
    const insertAt = block.start + nameLine.index
    return `${source.slice(0, insertAt)}${indent}id: '${id}',\n${source.slice(insertAt)}`
}

/**
 * Writes the id into the workflow file on disk. Returns false when the file already
 * had one, so a second create against the same file cannot add a second id line.
 */
export async function recordWorkflowId(filePath: string, id: string): Promise<boolean> {
    const file = Bun.file(filePath)
    const source = await file.text()
    const updated = withWorkflowId(source, id, filePath)
    if (updated === null) {
        return false
    }
    await Bun.write(filePath, updated)
    return true
}
