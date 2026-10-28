// PROTOTYPE, never merged: Silthus/personal#212.
import { useActions, useValues } from 'kea'

import {
    Button,
    Dialog,
    DialogBody,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Field,
    FieldContent,
    FieldDescription,
    FieldLabel,
    Input,
    Switch,
} from '@posthog/quill'

import { messagingPrototypeLogic } from './messagingPrototypeLogic'

/** Settings sit behind a control, not a section slot: engagement events, tracking consent and UTM defaults. */
export function MessagingSettingsDialog(): JSX.Element {
    const { settingsOpen } = useValues(messagingPrototypeLogic)
    const { setSettingsOpen } = useActions(messagingPrototypeLogic)

    return (
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Messaging settings</DialogTitle>
                    <DialogDescription>Apply to every broadcast, transactional email and workflow.</DialogDescription>
                </DialogHeader>
                <DialogBody className="flex flex-col gap-4">
                    <Field orientation="horizontal">
                        <FieldContent>
                            <FieldLabel htmlFor="engagement-events">Capture engagement events</FieldLabel>
                            <FieldDescription>Send opens and clicks to PostHog as events.</FieldDescription>
                        </FieldContent>
                        <Switch id="engagement-events" defaultChecked />
                    </Field>
                    <Field orientation="horizontal">
                        <FieldContent>
                            <FieldLabel htmlFor="tracking-consent">Ask for tracking consent</FieldLabel>
                            <FieldDescription>Track opens only for people who agreed to it.</FieldDescription>
                        </FieldContent>
                        <Switch id="tracking-consent" />
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="utm-source">Default UTM source</FieldLabel>
                        <Input id="utm-source" defaultValue="posthog" />
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="utm-medium">Default UTM medium</FieldLabel>
                        <Input id="utm-medium" defaultValue="email" />
                    </Field>
                </DialogBody>
                <DialogFooter>
                    <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
                    <Button variant="primary" onClick={() => setSettingsOpen(false)}>
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
