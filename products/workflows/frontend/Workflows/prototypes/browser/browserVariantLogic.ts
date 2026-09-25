// PROTOTYPE (throwaway): folder actions for the browser variant, on top of combinedVariantLogic.
import { MakeLogicType, actions, connect, kea, listeners, path } from 'kea'

import { lemonToast } from '@posthog/lemon-ui'

import api from 'lib/api'

import { PROJECT_TREE_KEY } from '~/layout/panel-layout/ProjectTree/ProjectTree'
import { projectTreeDataLogic } from '~/layout/panel-layout/ProjectTree/projectTreeDataLogic'
import { escapePath, joinPath, splitPath } from '~/layout/panel-layout/ProjectTree/utils'
import type { FileSystemEntry } from '~/queries/schema/schema-general'

import { combinedVariantLogic } from '../combined/combinedVariantLogic'
import { FolderRow, foldersVariantLogic } from '../folders/foldersVariantLogic'

function startsWith(segments: string[], prefix: string[]): boolean {
    return prefix.length <= segments.length && prefix.every((segment, index) => segments[index] === segment)
}

function folderPath(segments: string[]): string {
    return joinPath(segments)
}

interface Values {
    projectFolders: FileSystemEntry[]
    rowsById: Record<string, FolderRow>
    folderPaths: string[][]
    scope: string[]
}

interface Actions {
    renameFolder: (segments: string[], name: string) => { segments: string[]; name: string }
    deleteFolder: (segments: string[]) => { segments: string[] }
    moveIdsToFolder: (ids: string[], segments: string[]) => { ids: string[]; segments: string[] }
    loadEntries: () => {}
    setScope: (scope: string[]) => { scope: string[] }
    moveItems: (
        moves: { item: FileSystemEntry; newPath: string }[],
        force: boolean,
        projectTreeLogicKey: string
    ) => { moves: { item: FileSystemEntry; newPath: string }[]; force: boolean; projectTreeLogicKey: string }
}

export const browserVariantLogic = kea<MakeLogicType<Values, Actions>>([
    path(['products', 'workflows', 'frontend', 'Workflows', 'prototypes', 'browser', 'browserVariantLogic']),
    connect(() => ({
        values: [combinedVariantLogic, ['projectFolders', 'rowsById', 'folderPaths', 'scope']],
        actions: [
            foldersVariantLogic,
            ['loadEntries'],
            combinedVariantLogic,
            ['setScope'],
            projectTreeDataLogic,
            ['moveItems'],
        ],
    })),
    actions({
        renameFolder: (segments: string[], name: string) => ({ segments, name }),
        deleteFolder: (segments: string[]) => ({ segments }),
        moveIdsToFolder: (ids: string[], segments: string[]) => ({ ids, segments }),
    }),
    listeners(({ actions, values }) => ({
        renameFolder: async ({ segments, name }) => {
            const renamed = [...segments.slice(0, -1), name.trim()]
            try {
                // The backend creates parent folders on the fly, so a folder can exist only through its items.
                const entry =
                    values.projectFolders.find((folder) => folder.path === folderPath(segments)) ??
                    (await api.fileSystem.create({
                        id: '',
                        path: folderPath(segments),
                        type: 'folder',
                    } as FileSystemEntry))
                await api.fileSystem.move(entry.id as string, folderPath(renamed))
            } catch {
                lemonToast.error("Couldn't rename the folder. Try again in a moment.")
                return
            }
            actions.loadEntries()
            if (startsWith(values.scope, segments)) {
                actions.setScope([...renamed, ...values.scope.slice(segments.length)])
            }
        },
        deleteFolder: async ({ segments }) => {
            const entry = values.projectFolders.find((folder) => folder.path === folderPath(segments))
            try {
                if (entry?.id) {
                    await api.fileSystem.delete(entry.id)
                }
            } catch {
                lemonToast.error("Couldn't delete the folder. Move or delete what's inside it first.")
                return
            }
            actions.loadEntries()
        },
        moveIdsToFolder: ({ ids, segments }) => {
            const moves = ids
                .map((id) => values.rowsById[id]?.entry)
                .filter((entry): entry is FileSystemEntry => !!entry)
                .map((item) => ({
                    item,
                    newPath: `${folderPath(segments)}/${escapePath(splitPath(item.path).pop() ?? '')}`,
                }))
                .filter(({ item, newPath }) => item.path !== newPath)
            if (!moves.length) {
                return
            }
            // The project tree toasts the move with an Undo. movesSettled (in the folders logic) reloads the list.
            actions.moveItems(moves, false, PROJECT_TREE_KEY)
        },
    })),
])
