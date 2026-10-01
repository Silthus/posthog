import type { Meta, StoryFn } from '@storybook/react'
import { useState } from 'react'
import { Slide, ToastContainer } from 'react-toastify'

import { lemonToast } from '@posthog/lemon-ui'

import { buildSetupPrompt } from './buildSetupPrompt'
import { EmailDomainPage, EmailDomainPageProps } from './EmailDomainPage'
import { EmailDomainsSection } from './EmailDomainsSection'
import { EmailDomainWizard, EmailDomainWizardProps } from './EmailDomainWizard'
import { FirstSenderCard } from './FirstSenderCard'
import {
    CLOUDFLARE,
    NAMECHEAP,
    PROTOTYPE_PROJECT_ID,
    PROTOTYPE_SENDER_ID,
    ROUTE_53,
    buildRecords,
} from './prototypeData'
import { LadderLevel, SenderSecurityLadder } from './SenderSecurityLadder'
import { SetupPromptMenu } from './SetupPromptMenu'
import { SpottedEmailToolCard } from './SpottedEmailToolCard'

// PROTOTYPE: throwaway stories for the email domain setup redesign. Mocked data, no backend.

type WidthArg = { width: 'full' | 'narrow' }

const meta: Meta = {
    title: 'Products/Workflows/Email domain prototype',
    parameters: {
        layout: 'padded',
        viewMode: 'story',
        testOptions: { skip: true },
    },
    argTypes: {
        width: { control: 'radio', options: ['full', 'narrow'], description: '"narrow" pins the scene to 520px' },
    },
    args: { width: 'full' },
}
export default meta

function Scene({ width, children }: WidthArg & { children: React.ReactNode }): JSX.Element {
    return (
        <div className={width === 'narrow' ? 'max-w-130 border-r border-dashed pr-4' : ''}>
            {children}
            <ToastContainer autoClose={4000} transition={Slide} position="bottom-right" />
        </div>
    )
}

const PAGE_URL = `https://us.posthog.com/project/${PROTOTYPE_PROJECT_ID}/workflows/channels/email/${PROTOTYPE_SENDER_ID}`

const wizardArgs: EmailDomainWizardProps = {
    detectedHost: CLOUDFLARE,
    existingDomains: ['already.acme.com'],
    onAutoConfigure: (domain) => lemonToast.info(`Would redirect to Cloudflare for ${domain}`),
    onFinished: (result) => lemonToast.success(`Would open the domain page for ${result.domain}`),
}

const WizardTemplate: StoryFn<EmailDomainWizardProps & WidthArg> = ({ width, ...args }) => (
    <Scene width={width}>
        <EmailDomainWizard {...args} />
    </Scene>
)

export const WizardDomainStep = WizardTemplate.bind({})
WizardDomainStep.args = { ...wizardArgs }
WizardDomainStep.parameters = {
    docs: {
        description: {
            story: 'Try typing: `jane@acme.com` (email), `gmail.com` (free mailbox), `taken.example.com` (another org), `already.acme.com` (exists here), `https://www.acme.com/` (URL).',
        },
    },
}

export const WizardDomainStepEmailTyped = WizardTemplate.bind({})
WizardDomainStepEmailTyped.args = { ...wizardArgs, initialDomainValue: 'jane@acme.com' }

export const WizardDomainStepFreeMailbox = WizardTemplate.bind({})
WizardDomainStepFreeMailbox.args = { ...wizardArgs, initialDomainValue: 'gmail.com' }

export const WizardDomainStepTakenByOtherOrg = WizardTemplate.bind({})
WizardDomainStepTakenByOtherOrg.args = { ...wizardArgs, initialDomainValue: 'taken.example.com' }

export const WizardDomainStepExistingDomain = WizardTemplate.bind({})
WizardDomainStepExistingDomain.args = { ...wizardArgs, initialDomainValue: 'already.acme.com' }

const dnsStepResult = { domain: 'acme.com', localPart: 'hello', senderName: 'Acme', mailFromSubdomain: 'feedback' }

export const WizardDnsStepCloudflare = WizardTemplate.bind({})
WizardDnsStepCloudflare.args = {
    ...wizardArgs,
    initialStep: 'dns',
    initialResult: dnsStepResult,
    detectedHost: CLOUDFLARE,
}

export const WizardDnsStepNamedHost = WizardTemplate.bind({})
WizardDnsStepNamedHost.args = {
    ...wizardArgs,
    initialStep: 'dns',
    initialResult: dnsStepResult,
    detectedHost: ROUTE_53,
}

export const WizardDnsStepNamecheap = WizardTemplate.bind({})
WizardDnsStepNamecheap.args = {
    ...wizardArgs,
    initialStep: 'dns',
    initialResult: dnsStepResult,
    detectedHost: NAMECHEAP,
}

export const WizardDnsStepUnknownHost = WizardTemplate.bind({})
WizardDnsStepUnknownHost.args = { ...wizardArgs, initialStep: 'dns', initialResult: dnsStepResult, detectedHost: null }

const PageTemplate: StoryFn<EmailDomainPageProps & WidthArg> = ({ width, ...args }) => (
    <Scene width={width}>
        <EmailDomainPage {...args} />
    </Scene>
)

const pageArgs: EmailDomainPageProps = { domain: 'acme.com', status: 'pending', dnsHost: CLOUDFLARE }

export const DomainPagePending = PageTemplate.bind({})
DomainPagePending.args = { ...pageArgs }

export const DomainPageRecordsFound = PageTemplate.bind({})
DomainPageRecordsFound.args = { ...pageArgs, status: 'records_found' }

export const DomainPageVerified = PageTemplate.bind({})
DomainPageVerified.args = { ...pageArgs, status: 'verified' }

export const DomainPageTemporaryFailure = PageTemplate.bind({})
DomainPageTemporaryFailure.args = { ...pageArgs, status: 'temporary_failure' }

export const DomainPageFailed = PageTemplate.bind({})
DomainPageFailed.args = { ...pageArgs, status: 'failed', dnsHost: ROUTE_53 }

export const DomainPagePollingStopped = PageTemplate.bind({})
DomainPagePollingStopped.args = { ...pageArgs, status: 'pending', pollingStopped: true, dnsHost: NAMECHEAP }

export const DomainPageSpottedCustomerIo = PageTemplate.bind({})
DomainPageSpottedCustomerIo.args = { ...pageArgs, status: 'pending', spottedTool: 'Customer.io', dnsHost: ROUTE_53 }

export const FirstSender: StoryFn<WidthArg> = ({ width }) => (
    <Scene width={width}>
        <FirstSenderCard
            domain="acme.com"
            initialLocalPart="hello"
            initialName="Acme"
            currentUserEmail="michael@posthog.com"
        />
    </Scene>
)

export const CopyAsPrompt: StoryFn<WidthArg> = ({ width }) => {
    const records = buildRecords('acme.com', 'feedback', 'pending')
    const prompt = buildSetupPrompt({
        domain: 'acme.com',
        mailFromSubdomain: 'feedback',
        projectId: PROTOTYPE_PROJECT_ID,
        senderId: PROTOTYPE_SENDER_ID,
        dnsHost: ROUTE_53,
        records,
    })
    return (
        <Scene width={width}>
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-2 rounded border bg-surface-primary p-3">
                    <span className="text-sm">The menu as it sits next to the DNS records heading:</span>
                    <SetupPromptMenu prompt={prompt} records="" pageUrl={PAGE_URL} />
                </div>
                <div className="flex flex-col gap-1">
                    <span className="text-xs text-secondary uppercase tracking-wide">Prompt text</span>
                    <pre className="m-0 whitespace-pre-wrap text-xs rounded border bg-fill-primary p-3">{prompt}</pre>
                </div>
            </div>
        </Scene>
    )
}

export const SpottedCustomerIo: StoryFn<WidthArg> = ({ width }) => (
    <Scene width={width}>
        <SpottedEmailToolCard
            toolName="Customer.io"
            domain="acme.com"
            onImportUnsubscribes={() => lemonToast.info('Opens the Customer.io import')}
            onDismiss={() => lemonToast.info('Dismissed')}
        />
    </Scene>
)

export const SecurityLadder: StoryFn<WidthArg & { level: LadderLevel }> = ({ width, level: initialLevel }) => {
    const [level, setLevel] = useState<LadderLevel>(initialLevel)
    return (
        <Scene width={width}>
            <SenderSecurityLadder level={level} onLevelChange={setLevel} />
        </Scene>
    )
}
SecurityLadder.args = { level: 2 }
SecurityLadder.argTypes = { level: { control: { type: 'range', min: 0, max: 5, step: 1 } } }

export const DomainsSection: StoryFn<WidthArg> = ({ width }) => (
    <Scene width={width}>
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
                <h2 className="m-0 text-lg font-semibold">Email</h2>
                <p className="m-0 text-sm text-secondary">
                    Channels → Email, with the new Domains subsection above the senders.
                </p>
            </div>
            <EmailDomainsSection
                domains={[
                    { domain: 'acme.com', status: 'verified', senderCount: 3, dnsHost: 'Cloudflare' },
                    { domain: 'mail.acme.com', status: 'pending', senderCount: 1, dnsHost: 'Route 53' },
                    { domain: 'old.acme.com', status: 'temporary_failure', senderCount: 1, dnsHost: null },
                ]}
                onAddDomain={() => lemonToast.info('Opens the wizard')}
                onOpenDomain={(domain) => lemonToast.info(`Opens the page for ${domain}`)}
            />
        </div>
    </Scene>
)
