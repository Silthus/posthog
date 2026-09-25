// PROTOTYPE (throwaway): one name dialog for "New folder", "New subfolder" and "Rename".
import { LemonDialog, LemonInput } from '@posthog/lemon-ui'

import { LemonField } from 'lib/lemon-ui/LemonField'

export function openFolderNameDialog({
    title,
    initialName = '',
    submitLabel,
    siblings,
    onSubmit,
}: {
    title: string
    initialName?: string
    submitLabel: string
    /** Names already used next to the folder, so two folders can't share a name. */
    siblings: string[]
    onSubmit: (name: string) => void
}): void {
    LemonDialog.openForm({
        title,
        initialValues: { name: initialName },
        content: (
            <LemonField name="name">
                <LemonInput placeholder="Folder name" autoFocus data-attr="workflows-browser-folder-name" />
            </LemonField>
        ),
        errors: {
            name: (name: string) => {
                const trimmed = name?.trim() ?? ''
                if (!trimmed) {
                    return 'Give the folder a name'
                }
                if (trimmed.includes('/')) {
                    return 'Folder names can’t contain /'
                }
                if (
                    trimmed !== initialName &&
                    siblings.some((sibling) => sibling.toLowerCase() === trimmed.toLowerCase())
                ) {
                    return 'A folder with this name is already here'
                }
                return undefined
            },
        },
        primaryButtonProps: { children: submitLabel },
        onSubmit: ({ name }) => onSubmit(name.trim()),
    })
}
