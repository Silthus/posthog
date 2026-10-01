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
        `Set up the email sending domain ${domain} for PostHog Workflows and get it verified.`,
        '',
        'Context',
        `- PostHog project id: ${projectId}`,
        `- Email sender (integration) id: ${senderId}`,
        `- Domain: ${domain}`,
        `- MAIL FROM subdomain: ${mailFromSubdomain}.${domain}`,
        hostLine,
        '',
        'Steps',
        `1. Get the current DNS records and status with the PostHog MCP tool integrations-email-status-retrieve (project ${projectId}, integration ${senderId}). If the PostHog MCP is not available, use the records listed below.`,
        `2. Before adding the DMARC record, look up the TXT record at _dmarc.${domain}. If one exists, keep it and skip our DMARC record. Never create a second DMARC record.`,
        '3. Add the remaining records at the DNS host. Paste names and values exactly. If the host appends the domain to the name field, enter only the part before the domain.',
        `4. If the host supports Domain Connect, you can call integrations-domain-connect-apply-url-create to get an approval URL instead of adding records by hand. Show me that URL and wait for me to approve it in my browser. Do not open it yourself.`,
        `5. After the records are in place, call integrations-email-verify-create once. Then poll integrations-email-status-retrieve every 30 seconds until the status is "verified". Stop after 30 minutes and tell me which records are still missing.`,
        `6. When the status is "verified", tell me. Only change the sender name or email with integrations-email-partial-update if I ask for it.`,
        '',
        'Records',
        ...records.map(formatRecord),
    ].join('\n')
}
