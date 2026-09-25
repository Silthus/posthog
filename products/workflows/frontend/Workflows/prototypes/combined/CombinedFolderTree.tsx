// PROTOTYPE (throwaway): the folder tree. Hovering a folder swaps its count for a "new folder here" button in the
// same spot, and shows a chevron in front that expands or collapses it without opening it.
import clsx from 'clsx'
import { useActions, useValues } from 'kea'
import { useEffect, useState } from 'react'

import {
    IconChevronDown,
    IconChevronRight,
    IconFolder,
    IconFolderOpen,
    IconFolderPlus,
    IconStack,
} from '@posthog/icons'
import { LemonButton, LemonDialog, LemonInput } from '@posthog/lemon-ui'

import { LemonField } from 'lib/lemon-ui/LemonField'

import { joinPath } from '~/layout/panel-layout/ProjectTree/utils'

import { FolderLocation } from '../folders/foldersVariantLogic'
import { combinedVariantLogic, currentSegments, isTemplatesLocation } from './combinedVariantLogic'

const ROOT_KEY = 'root'

function folderKey(segments: string[]): string {
    return segments.length ? `folder:${joinPath(segments)}` : ROOT_KEY
}

interface TreeRowProps {
    label: string
    depth: number
    count: number
    active: boolean
    expanded: boolean
    hasChildren: boolean
    icon: JSX.Element
    secondary?: boolean
    onOpen: () => void
    onToggle?: () => void
    onCreateFolder?: () => void
}

function TreeRow({
    label,
    depth,
    count,
    active,
    expanded,
    hasChildren,
    icon,
    secondary,
    onOpen,
    onToggle,
    onCreateFolder,
}: TreeRowProps): JSX.Element {
    return (
        <div
            className={clsx(
                'group/row flex items-center gap-0.5 h-7 pr-1 rounded text-sm',
                active ? 'bg-fill-button-tertiary-active font-semibold' : 'hover:bg-fill-button-tertiary-hover',
                secondary && !active && 'text-secondary'
            )}
            // Indentation depends on the folder depth, which Tailwind can't express as a class.
            style={{ paddingLeft: depth * 12 + 2 }}
        >
            <span className="w-4 shrink-0 flex items-center justify-center">
                {hasChildren && onToggle && (
                    <button
                        type="button"
                        aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
                        aria-expanded={expanded}
                        className="flex items-center justify-center size-4 rounded text-secondary cursor-pointer opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 hover:text-primary"
                        onClick={onToggle}
                        data-attr="workflows-combined-tree-toggle"
                    >
                        {expanded ? <IconChevronDown /> : <IconChevronRight />}
                    </button>
                )}
            </span>
            <button
                type="button"
                className="flex items-center gap-1.5 flex-1 min-w-0 h-full text-left cursor-pointer"
                onClick={onOpen}
                aria-current={active ? 'page' : undefined}
                data-attr="workflows-combined-tree-folder"
            >
                <span className="shrink-0 flex text-base text-secondary">{icon}</span>
                <span className="truncate">{label}</span>
            </button>
            <span className="relative w-7 h-6 shrink-0 flex items-center justify-center">
                <span
                    className={clsx(
                        'text-xs text-secondary tabular-nums',
                        onCreateFolder && 'group-hover/row:invisible group-focus-within/row:invisible'
                    )}
                    translate="no"
                >
                    {count}
                </span>
                {onCreateFolder && (
                    <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100">
                        <LemonButton
                            size="xsmall"
                            icon={<IconFolderPlus />}
                            tooltip={`New folder in ${label}`}
                            aria-label={`New folder in ${label}`}
                            onClick={onCreateFolder}
                            data-attr="workflows-combined-tree-new-folder"
                        />
                    </span>
                )}
            </span>
        </div>
    )
}

export function CombinedFolderTree(): JSX.Element {
    const { folderPaths, folderCounts, workflowTemplatesCount, location } = useValues(combinedVariantLogic)
    const { setLocation, createFolderAt } = useActions(combinedVariantLogic)
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set([ROOT_KEY]))

    // Opening a folder from the table, a breadcrumb or the URL reveals it and its subfolders in the tree.
    useEffect(() => {
        const segments = currentSegments(location)
        setExpanded((current) => {
            const next = new Set(current)
            next.add(ROOT_KEY)
            segments.forEach((_, index) => next.add(folderKey(segments.slice(0, index + 1))))
            return next.size === current.size ? current : next
        })
    }, [location])

    const toggle = (key: string): void =>
        setExpanded((current) => {
            const next = new Set(current)
            next.has(key) ? next.delete(key) : next.add(key)
            return next
        })

    const openNewFolder = (parent: string[], parentLabel: string): void =>
        LemonDialog.openForm({
            title: `New folder in ${parentLabel}`,
            initialValues: { name: '' },
            content: (
                <LemonField name="name">
                    <LemonInput placeholder="Folder name" autoFocus data-attr="workflows-combined-new-folder-name" />
                </LemonField>
            ),
            errors: {
                name: (name: string) =>
                    !name?.trim()
                        ? 'Give the folder a name'
                        : name.includes('/')
                          ? 'Folder names can’t contain /'
                          : undefined,
            },
            onSubmit: ({ name }) => {
                setExpanded((current) => new Set([...current, folderKey(parent)]))
                createFolderAt(parent, name)
            },
        })

    const activeKey = isTemplatesLocation(location) ? 'templates' : folderKey(currentSegments(location))

    const renderFolder = (segments: string[], depth: number): JSX.Element[] => {
        const key = folderKey(segments)
        const children = folderPaths.filter(
            (path) => path.length === segments.length + 1 && segments.every((segment, index) => path[index] === segment)
        )
        const label = segments.length ? segments[segments.length - 1] : 'Workflows'
        const isOpen = expanded.has(key)
        const target: FolderLocation = { type: 'folder', segments }
        return [
            <TreeRow
                key={key}
                label={label}
                depth={depth}
                count={folderCounts[joinPath(segments)] ?? 0}
                active={activeKey === key}
                expanded={isOpen}
                hasChildren={children.length > 0}
                icon={activeKey === key ? <IconFolderOpen /> : <IconFolder />}
                onOpen={() => setLocation(target)}
                onToggle={() => toggle(key)}
                onCreateFolder={() => openNewFolder(segments, label)}
            />,
            ...(isOpen ? children.flatMap((child) => renderFolder(child, depth + 1)) : []),
        ]
    }

    return (
        <nav aria-label="Workflow folders" className="flex flex-col p-1" data-attr="workflows-combined-tree">
            {renderFolder([], 0)}
            <div className="border-t my-1" />
            <TreeRow
                label="Workflow templates"
                depth={0}
                count={workflowTemplatesCount}
                active={activeKey === 'templates'}
                expanded={false}
                hasChildren={false}
                icon={<IconStack />}
                secondary
                onOpen={() => setLocation({ type: 'library' })}
            />
        </nav>
    )
}
