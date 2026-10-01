// PROTOTYPE (throwaway): the two prompts a user can hand to a coding agent.
import { buildSetupPrompt } from '../../buildSetupPrompt'
import { DnsHost, PROTOTYPE_PROJECT_ID, PROTOTYPE_SENDER_ID, PrototypeDnsRecord } from '../../prototypeData'

export interface AgentPromptInput {
    sendingDomain: string
    bouncePrefix: string
    host: DnsHost | null
    records: PrototypeDnsRecord[]
    computerUse: boolean
}

const formatRecord = (record: PrototypeDnsRecord): string => {
    const priority = record.priority != null ? ` (priority ${record.priority})` : ''
    return `- ${record.type}  ${record.name}  ->  ${record.value}${priority}`
}

const buildComputerUsePrompt = ({ sendingDomain, host, records }: AgentPromptInput): string => {
    const hostLine = host
        ? `The DNS for this domain is managed at ${host.name}. Open ${host.dnsSettingsUrl} in the browser. I am already signed in.`
        : 'Ask me where the DNS for this domain is managed, then open that provider in the browser. I am already signed in.'
    const gotcha = host?.gotcha ? `\nWatch out: ${host.gotcha}` : ''
    return [
        `Use the browser to add the DNS records below for ${sendingDomain}, then verify the domain in PostHog.`,
        '',
        hostLine + gotcha,
        '',
        'Rules',
        `- Never add a second _dmarc record. If a TXT record already exists at _dmarc.${sendingDomain}, keep it and skip ours.`,
        '- Do not delete or edit any existing record except to merge include:amazonses.com into an SPF record that already exists at the same name. Publish both SPF TXT records; the verify step never checks them.',
        '- If the provider appends the domain to the name field, enter only the part before the domain.',
        '- Show me the list of records you added before you leave the DNS page.',
        `- Then open https://us.posthog.com/project/${PROTOTYPE_PROJECT_ID}/workflows/channels/email/${PROTOTYPE_SENDER_ID} and click "Check again". Wait until the page says the domain is ready to send. Tell me if any record is still missing after 10 minutes.`,
        '',
        'Records',
        ...records.map(formatRecord),
    ].join('\n')
}

export const buildAgentPrompt = (input: AgentPromptInput): string =>
    input.computerUse
        ? buildComputerUsePrompt(input)
        : buildSetupPrompt({
              domain: input.sendingDomain,
              mailFromSubdomain: input.bouncePrefix,
              projectId: PROTOTYPE_PROJECT_ID,
              senderId: PROTOTYPE_SENDER_ID,
              dnsHost: input.host,
              records: input.records,
          })
