import { LemonDialog, LemonInput } from '@posthog/lemon-ui'

import { LemonField } from 'lib/lemon-ui/LemonField'

export function openWorkflowTagRenameDialog(name: string, rename: (newName: string) => Promise<void>): void {
    LemonDialog.openForm({
        title: 'Rename tag',
        description: 'This renames the shared tag everywhere in this project. An existing name merges the tags.',
        initialValues: { name },
        content: (
            <LemonField name="name" label="Tag name">
                <LemonInput autoFocus data-attr="workflow-tag-rename-name" />
            </LemonField>
        ),
        errors: { name: (value) => (!value?.trim() ? 'Enter a tag name' : undefined) },
        primaryButtonProps: { children: 'Rename' },
        shouldAwaitSubmit: true,
        onSubmit: async ({ name }) => {
            await rename(name)
        },
    })
}
