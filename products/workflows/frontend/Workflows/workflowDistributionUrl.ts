const CONTEXT_PARAM = 'distributionContext'

function withoutContext(parameters: string): string {
    return parameters
        .split('&')
        .filter((parameter) => {
            try {
                return decodeURIComponent(parameter.split('=')[0].replace(/\+/g, ' ')) !== CONTEXT_PARAM
            } catch {
                return true
            }
        })
        .join('&')
}

export function redactWorkflowDistributionUrl(value: string): string {
    const hashIndex = value.indexOf('#')
    const beforeHash = hashIndex < 0 ? value : value.slice(0, hashIndex)
    const hash = hashIndex < 0 ? '' : withoutContext(value.slice(hashIndex + 1))
    const queryIndex = beforeHash.indexOf('?')
    const path = queryIndex < 0 ? beforeHash : beforeHash.slice(0, queryIndex)
    const query = queryIndex < 0 ? '' : withoutContext(beforeHash.slice(queryIndex + 1))
    return path + (query ? `?${query}` : '') + (hash ? `#${hash}` : '')
}

function redactValue(value: unknown): unknown {
    if (typeof value === 'string') {
        return /^(https?:\/\/|\/|#)/.test(value) ? redactWorkflowDistributionUrl(value) : value
    }
    if (Array.isArray(value)) {
        return value.map(redactValue)
    }
    if (value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
        return redactWorkflowDistributionProperties(value as Record<string, unknown>)
    }
    return value
}

export function redactWorkflowDistributionProperties(properties: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, redactValue(value)]))
}
