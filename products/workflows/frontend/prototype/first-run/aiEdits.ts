// PROTOTYPE ONLY (silthus/posthog#212). Canned PostHog AI edits applied to an Unlayer design, so asking for a
// change really changes the email in the editor.
export type AiEdit = 'shorter' | 'friendlier' | 'trial' | 'reply'

export const AI_EDITS: { key: AiEdit; label: string; reply: string }[] = [
    { key: 'shorter', label: 'Make it shorter', reply: 'Done. I kept the first paragraph of each section.' },
    { key: 'friendlier', label: 'Make it friendlier', reply: 'Done. It now greets them by first name.' },
    { key: 'trial', label: 'Mention our free trial', reply: 'Added a line about the 14-day free trial.' },
    { key: 'reply', label: 'Ask them to reply', reply: 'It now ends with a question people can answer.' },
]

export function aiEditFor(prompt: string): AiEdit {
    const text = prompt.toLowerCase()
    if (text.includes('short')) {
        return 'shorter'
    }
    if (text.includes('trial')) {
        return 'trial'
    }
    if (text.includes('reply') || text.includes('question')) {
        return 'reply'
    }
    return 'friendlier'
}

type Design = Record<string, any>
type Content = Record<string, any>

const PARAGRAPH = /<p\b[^>]*>[\s\S]*?<\/p>/gi
const FIRST_NAME = '{{ person.properties.first_name }}'

function textContents(design: Design): Content[] {
    const found: Content[] = []
    for (const row of design.body?.rows ?? []) {
        for (const column of row.columns ?? []) {
            for (const content of column.contents ?? []) {
                const isFooter = String(content.values?.text ?? '').includes('p.s.')
                if ((content.type === 'text' || content.type === 'heading') && !isFooter) {
                    found.push(content)
                }
            }
        }
    }
    return found
}

function paragraph(text: string): string {
    return `<p style="line-height: 140%;">${text}</p>`
}

function editText(content: Content, edit: (text: string) => string): void {
    content.values = { ...content.values, text: edit(String(content.values?.text ?? '')) }
}

export function applyAiEdit(currentDesign: Design, edit: AiEdit): Design {
    const design: Design = JSON.parse(JSON.stringify(currentDesign))
    const contents = textContents(design)
    const heading = contents.find((content) => content.type === 'heading')
    const body = contents.filter((content) => content.type === 'text')
    const lastBody = body[body.length - 1]

    switch (edit) {
        case 'shorter':
            body.forEach((content) => editText(content, (text) => text.match(PARAGRAPH)?.[0] ?? text))
            break
        case 'friendlier':
            if (heading) {
                editText(heading, (text) => text.replace(/<strong>/, `<strong>Hey ${FIRST_NAME}, `))
            } else if (body[0]) {
                editText(body[0], (text) => text.replace(/^(<p\b[^>]*>)/, `$1Hey ${FIRST_NAME}! `))
            }
            break
        case 'trial':
            if (body[0]) {
                editText(
                    body[0],
                    (text) => `${text}${paragraph('Your free trial runs for 14 days, with every feature switched on.')}`
                )
            }
            break
        case 'reply':
            if (lastBody) {
                editText(
                    lastBody,
                    (text) => `${text}${paragraph('One question: what made you sign up? Just hit reply.')}`
                )
            }
            break
    }
    return design
}
