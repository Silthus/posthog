// PROTOTYPE ONLY: who can receive an email, shared by every variant.
import { IconCheckCircle, IconWarning } from '@posthog/icons'
import { LemonBanner } from '@posthog/lemon-ui'

import { CodeSnippet, Language } from 'lib/components/CodeSnippet'

import { useBackend } from '../prototypeBackend'
import { PlugInSlot } from './PlugInSlot'

const IDENTIFY_SNIPPET = `posthog.identify(userId, { email: 'user@example.com' })`

export function PeopleCheck({ compact = false }: { compact?: boolean }): JSX.Element {
    const { peopleTotal, peopleWithEmail } = useBackend()
    const without = peopleTotal - peopleWithEmail
    const share = Math.round((peopleWithEmail / peopleTotal) * 100)

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm">
                {without === 0 ? (
                    <IconCheckCircle className="text-lg text-success" />
                ) : (
                    <IconWarning className="text-lg text-warning" />
                )}
                <span>
                    <strong>{peopleWithEmail.toLocaleString()}</strong> of {peopleTotal.toLocaleString()} people have an
                    email ({share}%).
                </span>
            </div>
            <div className="h-1.5 rounded bg-fill-secondary overflow-hidden">
                <div className="h-full bg-success" style={{ width: `${share}%` }} />
            </div>
            {without > 0 && (
                <LemonBanner type={peopleWithEmail === 0 ? 'error' : 'warning'} hideIcon className="text-sm">
                    {peopleWithEmail === 0
                        ? 'Nobody has an email yet, so no message can be delivered. Set one when you identify a person:'
                        : `${without.toLocaleString()} people have no email and are skipped. Set one when you identify them:`}
                    <CodeSnippet language={Language.JavaScript} compact wrap className="mt-2">
                        {IDENTIFY_SNIPPET}
                    </CodeSnippet>
                </LemonBanner>
            )}
            {!compact && (
                <PlugInSlot name="Audience" does="pick who gets the message and see the count that can receive it" />
            )}
        </div>
    )
}
