// PROTOTYPE: throwaway mocked data for the email domain setup stories. Not shipped.

export type DnsRecordKind = 'verification' | 'dkim' | 'spf' | 'mailfrom_mx' | 'mailfrom_spf' | 'dmarc'
export type DnsRecordStatus = 'pending' | 'found' | 'verified' | 'missing' | 'unknown'

export interface PrototypeDnsRecord {
    kind: DnsRecordKind
    type: 'TXT' | 'CNAME' | 'MX'
    name: string
    value: string
    priority?: number
    status: DnsRecordStatus
}

export type DomainStatus = 'not_started' | 'pending' | 'records_found' | 'verified' | 'temporary_failure' | 'failed'

export interface DnsHost {
    name: string
    dnsSettingsUrl: string
    gotcha?: string
    supportsDomainConnect: boolean
}

export const CLOUDFLARE: DnsHost = {
    name: 'Cloudflare',
    dnsSettingsUrl: 'https://dash.cloudflare.com/?to=/:account/:zone/dns/records',
    gotcha: 'Keep the proxy off (grey cloud) on the CNAME records. Proxied CNAMEs do not work for DKIM.',
    supportsDomainConnect: true,
}

export const ROUTE_53: DnsHost = {
    name: 'Route 53',
    dnsSettingsUrl: 'https://console.aws.amazon.com/route53/v2/hostedzones',
    gotcha: 'Route 53 asks for the full record name. Paste the name as shown, including your domain.',
    supportsDomainConnect: false,
}

export const NAMECHEAP: DnsHost = {
    name: 'Namecheap',
    dnsSettingsUrl: 'https://ap.www.namecheap.com/domains/list/',
    gotcha: 'Namecheap adds your domain to the Host field. Paste only the part before your domain, so "feedback" and not "feedback.acme.com".',
    supportsDomainConnect: false,
}

export const buildRecords = (domain: string, mailFrom: string, status: DnsRecordStatus): PrototypeDnsRecord[] => [
    {
        kind: 'verification',
        type: 'TXT',
        name: `_amazonses.${domain}`,
        value: 'pSM7OoC2Jl6dNKGRmkc4KZpesve3QP3cUUT2FGZZ1PU=',
        status,
    },
    {
        kind: 'dkim',
        type: 'CNAME',
        name: `v4fyczifqlyachgcw4jqrsdcbbblc236._domainkey.${domain}`,
        value: 'v4fyczifqlyachgcw4jqrsdcbbblc236.dkim.amazonses.com',
        status,
    },
    {
        kind: 'dkim',
        type: 'CNAME',
        name: `fxaevqyhjczvbnhst7funhfphvbo4hv6._domainkey.${domain}`,
        value: 'fxaevqyhjczvbnhst7funhfphvbo4hv6.dkim.amazonses.com',
        status,
    },
    {
        kind: 'dkim',
        type: 'CNAME',
        name: `xzipw445tsam4wdwe5y33mgkutbsyqaj._domainkey.${domain}`,
        value: 'xzipw445tsam4wdwe5y33mgkutbsyqaj.dkim.amazonses.com',
        status,
    },
    {
        kind: 'mailfrom_mx',
        type: 'MX',
        name: `${mailFrom}.${domain}`,
        value: 'feedback-smtp.us-east-1.amazonses.com',
        priority: 10,
        status,
    },
    {
        kind: 'mailfrom_spf',
        type: 'TXT',
        name: `${mailFrom}.${domain}`,
        value: 'v=spf1 include:amazonses.com ~all',
        status,
    },
    {
        kind: 'dmarc',
        type: 'TXT',
        name: `_dmarc.${domain}`,
        value: 'v=DMARC1; p=none;',
        status,
    },
]

export const RECORD_KIND_LABEL: Record<DnsRecordKind, string> = {
    verification: 'Proves you own the domain',
    dkim: 'Signs your emails (DKIM)',
    spf: 'Lists who may send for you (SPF)',
    mailfrom_mx: 'Routes bounces back to you (MAIL FROM)',
    mailfrom_spf: 'Lists who may send bounces (MAIL FROM SPF)',
    dmarc: 'Tells inboxes what to do with fakes (DMARC)',
}

export const FREE_MAILBOX_DOMAINS = new Set([
    'gmail.com',
    'googlemail.com',
    'outlook.com',
    'hotmail.com',
    'live.com',
    'yahoo.com',
    'icloud.com',
    'me.com',
    'proton.me',
    'protonmail.com',
    'gmx.com',
    'gmx.de',
    'web.de',
])

export const TAKEN_BY_OTHER_ORG = new Set(['taken.example.com', 'competitor.com'])

export interface NormalizedDomainInput {
    domain: string
    localPart: string | null
}

export const normalizeDomainInput = (raw: string): NormalizedDomainInput => {
    let value = raw.trim().toLowerCase()
    let localPart: string | null = null
    if (value.includes('@')) {
        const [local, host] = value.split('@')
        localPart = local || null
        value = host ?? ''
    }
    value = value.replace(/^[a-z]+:\/\//, '')
    value = value.split('/')[0].split('?')[0]
    value = value.replace(/^www\./, '')
    return { domain: value, localPart }
}

export const isRootDomain = (domain: string): boolean => domain.split('.').filter(Boolean).length <= 2

export const nameFromDomain = (domain: string): string => {
    const label = domain.split('.').filter(Boolean).slice(-2)[0] ?? domain
    return label ? label.charAt(0).toUpperCase() + label.slice(1) : ''
}

export const PROTOTYPE_PROJECT_ID = 2
export const PROTOTYPE_SENDER_ID = 4821
