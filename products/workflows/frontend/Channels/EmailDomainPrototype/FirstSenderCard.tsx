import { useState } from 'react'

import { IconCheck, IconPencil, IconPlus, IconSend, IconX } from '@posthog/icons'
import { LemonButton, LemonInput, lemonToast } from '@posthog/lemon-ui'

export interface FirstSenderCardProps {
    domain: string
    initialLocalPart: string
    initialName: string
    currentUserEmail: string
}

export function FirstSenderCard({
    domain,
    initialLocalPart,
    initialName,
    currentUserEmail,
}: FirstSenderCardProps): JSX.Element {
    const [localPart, setLocalPart] = useState(initialLocalPart)
    const [name, setName] = useState(initialName)
    const [draftLocalPart, setDraftLocalPart] = useState(initialLocalPart)
    const [draftName, setDraftName] = useState(initialName)
    const [editing, setEditing] = useState(false)
    const [sending, setSending] = useState(false)

    const startEditing = (): void => {
        setDraftLocalPart(localPart)
        setDraftName(name)
        setEditing(true)
    }

    const save = (): void => {
        setLocalPart(draftLocalPart.trim() || localPart)
        setName(draftName.trim() || name)
        setEditing(false)
        lemonToast.success('Sender updated')
    }

    const sendTest = (): void => {
        setSending(true)
        window.setTimeout(() => {
            setSending(false)
            lemonToast.success(`Test email sent to ${currentUserEmail}`)
        }, 900)
    }

    return (
        <section className="rounded border bg-surface-primary p-4 flex flex-col gap-3 @container">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                    <h3 className="m-0 text-base font-semibold">Your first sender</h3>
                    <p className="m-0 text-sm text-secondary">
                        We created one sender for you. Change the name or address any time.
                    </p>
                </div>
                {!editing && (
                    <LemonButton
                        size="small"
                        type="secondary"
                        icon={<IconPencil />}
                        onClick={startEditing}
                        data-attr="email-domain-edit-first-sender"
                    >
                        Edit
                    </LemonButton>
                )}
            </div>

            {editing ? (
                <div className="flex flex-col gap-2 @md:flex-row @md:items-end">
                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-xs text-secondary">Name</label>
                        <LemonInput value={draftName} onChange={setDraftName} placeholder="Acme" autoFocus />
                    </div>
                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-xs text-secondary">Email address</label>
                        <LemonInput
                            value={draftLocalPart}
                            onChange={setDraftLocalPart}
                            suffix={<span className="text-secondary">@{domain}</span>}
                            placeholder="hello"
                        />
                    </div>
                    <div className="flex gap-1">
                        <LemonButton type="primary" size="small" icon={<IconCheck />} onClick={save}>
                            Save
                        </LemonButton>
                        <LemonButton size="small" icon={<IconX />} onClick={() => setEditing(false)}>
                            Cancel
                        </LemonButton>
                    </div>
                </div>
            ) : (
                <div className="flex items-center gap-3 rounded bg-fill-primary border px-3 py-2">
                    <span className="flex items-center justify-center size-8 rounded-full bg-surface-primary border font-semibold text-sm shrink-0">
                        {name.charAt(0).toUpperCase()}
                    </span>
                    <div className="flex flex-col min-w-0">
                        <span className="font-medium truncate">{name}</span>
                        <span className="text-sm text-secondary truncate">
                            {localPart}@{domain}
                        </span>
                    </div>
                </div>
            )}

            <div className="flex flex-wrap gap-2">
                <LemonButton
                    type="primary"
                    size="small"
                    icon={<IconSend />}
                    loading={sending}
                    onClick={sendTest}
                    tooltip={`Sends a short test email to ${currentUserEmail}`}
                    data-attr="email-domain-send-test-email"
                >
                    Send a test email
                </LemonButton>
                <LemonButton
                    type="secondary"
                    size="small"
                    icon={<IconPlus />}
                    onClick={() => lemonToast.info('Opens the add sender form for this domain')}
                    data-attr="email-domain-add-sender"
                >
                    Add another sender
                </LemonButton>
            </div>
        </section>
    )
}
