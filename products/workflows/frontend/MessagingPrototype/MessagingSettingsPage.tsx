// PROTOTYPE, never merged: Silthus/personal#212. Messaging settings as a page in Setup. It holds what the gear on
// the Broadcasts and Workflows pages used to open in project settings, so nothing about sending lives elsewhere.
import { ReactNode } from 'react'

import {
    Button,
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
    Field,
    FieldContent,
    FieldDescription,
    FieldGroup,
    FieldLabel,
    Input,
    Switch,
    toast,
} from '@posthog/quill'

function saved(): void {
    toast.info({ title: 'Prototype: settings are not saved.' })
}

function SettingsCard({
    title,
    description,
    children,
    footer = true,
}: {
    title: string
    description: string
    children: ReactNode
    footer?: boolean
}): JSX.Element {
    return (
        <Card size="sm">
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
                <FieldGroup>{children}</FieldGroup>
            </CardContent>
            {footer && (
                <CardFooter className="justify-end">
                    <Button variant="outline" onClick={saved}>
                        Save
                    </Button>
                </CardFooter>
            )}
        </Card>
    )
}

function SwitchField({
    id,
    label,
    description,
    defaultChecked,
}: {
    id: string
    label: string
    description: string
    defaultChecked: boolean
}): JSX.Element {
    return (
        <Field orientation="horizontal">
            <FieldContent>
                <FieldLabel htmlFor={id}>{label}</FieldLabel>
                <FieldDescription>{description}</FieldDescription>
            </FieldContent>
            <Switch id={id} defaultChecked={defaultChecked} onCheckedChange={saved} />
        </Field>
    )
}

function InputField({
    id,
    label,
    value,
    suffix,
}: {
    id: string
    label: string
    value: string
    suffix?: string
}): JSX.Element {
    return (
        <Field>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <span className="flex items-center gap-2">
                <Input id={id} defaultValue={value} className="max-w-60" />
                {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
            </span>
        </Field>
    )
}

export function MessagingSettingsPage(): JSX.Element {
    return (
        <div className="flex max-w-3xl flex-col gap-3">
            <SettingsCard
                title="Engagement events"
                description="Sends, deliveries, opens, clicks and bounces as PostHog events you can chart."
                footer={false}
            >
                <SwitchField
                    id="engagement-events"
                    label="Capture engagement events"
                    description="These events count toward your event usage."
                    defaultChecked
                />
            </SettingsCard>
            <SettingsCard
                title="Email tracking consent"
                description="Track opens and clicks only for people who agreed to it."
                footer={false}
            >
                <SwitchField
                    id="tracking-consent"
                    label="Ask for tracking consent"
                    description="People without consent still get the email, without tracking."
                    defaultChecked={false}
                />
            </SettingsCard>
            <SettingsCard
                title="UTM tags on email links"
                description="Added to every link in an email, unless the email sets its own."
            >
                <InputField id="utm-source" label="Source" value="posthog" />
                <InputField id="utm-medium" label="Medium" value="email" />
                <InputField id="utm-campaign" label="Campaign" value="{{ message.name }}" />
            </SettingsCard>
            <SettingsCard
                title="Frequency cap"
                description="The most marketing messages one person gets. Transactional emails are never capped."
            >
                <InputField id="cap-count" label="Messages" value="3" suffix="per person" />
                <InputField id="cap-days" label="In a rolling window of" value="7" suffix="days" />
            </SettingsCard>
            <SettingsCard
                title="Daily limits"
                description="The most emails sent in a day. Sends past the limit wait for the next day."
            >
                <InputField id="limit-workflow" label="Per workflow or broadcast" value="10,000" suffix="emails" />
                <InputField id="limit-project" label="Across the project" value="50,000" suffix="emails" />
            </SettingsCard>
        </div>
    )
}
