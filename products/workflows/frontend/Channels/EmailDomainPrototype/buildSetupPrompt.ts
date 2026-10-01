import { DnsHost, PrototypeDnsRecord } from './prototypeData'

export interface SetupPromptInput {
    domain: string
    mailFromSubdomain: string
    projectId: number
    senderId: number
    dnsHost: DnsHost | null
    records: PrototypeDnsRecord[]
}

const formatRecord = (record: PrototypeDnsRecord): string => {
    const priority = record.priority != null ? ` (priority ${record.priority})` : ''
    return `- ${record.type}  ${record.name}  ->  ${record.value}${priority}`
}

export const buildSetupPrompt = ({
    domain,
    mailFromSubdomain,
    projectId,
    senderId,
    dnsHost,
    records,
}: SetupPromptInput): string => {
    const hostLine = dnsHost
        ? `- DNS host detected from the nameservers: ${dnsHost.name}${dnsHost.supportsDomainConnect ? ' (supports Domain Connect)' : ''}`
        : '- DNS host: unknown. Ask me where the DNS for this domain is managed before you change anything.'

    return [
        `Get the email sending domain ${domain} verified for PostHog Workflows. If you have the setting-up-an-email-domain skill, follow it.`,
        '',
        'Facts',
        `- PostHog project id: ${projectId}`,
        `- Email sender (integration) id: ${senderId}. It already exists. Do not create it again with integrations-email-create; re-creating it marks it unverified.`,
        `- Domain: ${domain}`,
        `- MAIL FROM subdomain: ${mailFromSubdomain}.${domain}. It applies to every sender on this domain. Never pick a new one; changing it needs new DNS records and breaks the other senders until they are published.`,
        hostLine,
        '',
        'Steps',
        `1. Read the current records and status with integrations-email-status-retrieve (project ${projectId}, integration ${senderId}). If the PostHog MCP is not available, use the records listed below.`,
        '2. If the host supports Domain Connect, call integrations-domain-connect-check-retrieve, then integrations-domain-connect-apply-url-create to get an approval URL. Show me that URL and wait for me to approve it in my browser. Do not open it yourself.',
        '3. Otherwise add the records at the DNS host yourself. Paste names and values exactly. If the host appends the domain to the name field, enter only the part before the domain. Always publish both SPF TXT records, merging include:amazonses.com into an existing SPF record at the same name instead of adding a second one. Verify never checks SPF, so their status can say success while they are missing. Never add a second _dmarc record; keep an existing one.',
        '4. Call integrations-email-verify-create once. Then poll integrations-email-status-retrieve every 30 seconds until the status is "verified". Stop after 30 minutes and tell me which records are still missing.',
        "5. Only change the sender's display name or MAIL FROM subdomain with integrations-email-partial-update if I ask. Send the sender's current email unchanged.",
        '',
        'Records',
        ...records.map(formatRecord),
    ].join('\n')
}
