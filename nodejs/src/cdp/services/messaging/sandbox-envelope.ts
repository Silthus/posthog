export type SandboxEnvelope = { to: string; cc: string[]; bcc: string[] }

type QuoteScan = { unquotedIndexes: number[]; balanced: boolean }

function scanQuotes(text: string): QuoteScan {
    const unquotedIndexes: number[] = []
    let quoted = false
    let escaped = false
    for (let index = 0; index < text.length; index++) {
        const character = text[index]
        if (escaped) {
            escaped = false
        } else if (quoted && character === '\\') {
            escaped = true
        } else if (character === '"') {
            quoted = !quoted
        } else if (!quoted) {
            unquotedIndexes.push(index)
        }
    }
    return { unquotedIndexes, balanced: !quoted }
}

function splitOutsideQuotes(text: string): string[] {
    const commas = scanQuotes(text).unquotedIndexes.filter((index) => text[index] === ',')
    return [-1, ...commas].map((comma, position) => text.slice(comma + 1, commas[position] ?? text.length))
}

function angleAddress(entry: string): string | undefined {
    const { unquotedIndexes, balanced } = scanQuotes(entry)
    const opening = unquotedIndexes.find((index) => entry[index] === '<')
    const closing = entry.length - 1
    if (!balanced || opening === undefined || entry[closing] !== '>' || /[\r\n]/.test(entry)) {
        return undefined
    }
    const unquotedBetween = (start: number, end: number): string =>
        unquotedIndexes
            .filter((index) => index >= start && index < end)
            .map((index) => entry[index])
            .join('')
    const mailbox = entry.slice(opening + 1, closing).trim()
    const isFramed = !/[>@;]/.test(unquotedBetween(0, opening)) && !/[<>]/.test(unquotedBetween(opening + 1, closing))
    return isFramed && mailbox ? mailbox : undefined
}

// Unlike `extractEmailsFromAddressList`, this keeps quoted commas inside one entry and leaves an
// ambiguous mailbox whole, so the member check sees exactly the addresses SES would deliver to.
function sandboxAddressList(value?: string): string[] {
    return splitOutsideQuotes(value ?? '')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => angleAddress(entry) ?? entry)
}

export function sandboxEnvelope(to: string, cc?: string, bcc?: string): SandboxEnvelope {
    const seen = new Set<string>()
    const firstSightings = (addresses: string[]): string[] =>
        addresses.filter((address) => {
            const key = address.toLowerCase()
            if (seen.has(key)) {
                return false
            }
            seen.add(key)
            return true
        })
    const [envelopeTo] = firstSightings([to.trim()])
    return { to: envelopeTo, cc: firstSightings(sandboxAddressList(cc)), bcc: firstSightings(sandboxAddressList(bcc)) }
}

export function sandboxEnvelopeRecipients({ to, cc, bcc }: SandboxEnvelope): string[] {
    return [to, ...cc, ...bcc]
}
