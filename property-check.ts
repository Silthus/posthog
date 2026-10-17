import { parseTemplateFile } from './email-template-file.ts'
import { templateHtmlFile } from './templateHtmlFile.ts'

const heads = [
    '',
    '<!doctype html>',
    '<!doctype html><html>',
    '<html lang="en">',
    '<html><head>',
    '<html><head><meta charset="utf-8">',
    '<html><head><title>Old &amp; x</title>',
    '<html><head><!-- <title>hidden</title> --><title>T</title><meta name="preheader" content="P">',
    "<html><head><meta name=PREHEADER content='x &quot; y'><title>\n a  b \n</title>",
    '<html><head><meta name="preheader" content="">',
    '<svg><title>icon</title></svg>',
]
const bodies = ['', '</head><body><p>{{ variables.a }}</p></body></html>', '<p>Hi</p>\n', '<header>x</header>']
const texts = ['', ' ', 'Hello', 'A & B', '<3 > 2', 'Say "hi"', "it's", '  many   spaces ', 'Café', '&amp;', '{{ variables.name | default: "x" }}', "{% if a > b %}'y'{% endif %}", '{{ "a" }} and {{ \'b\' }}', 'line\nbreak', '&#233;']
let checked = 0
const failures: string[] = []
for (const head of heads) {
    for (const body of bodies) {
        for (const subject of texts) {
            for (const preheader of [...texts, undefined]) {
                const html = head + body
                const file = templateHtmlFile({ subject, preheader, html })
                const parsed = parseTemplateFile(file)
                const wantSubject = subject.replace(/[\t\n\f\r ]+/g, ' ').trim()
                const wantPreheader = preheader?.trim() ? preheader : undefined
                const parsedPreheader = parsed.preheader?.trim() ? parsed.preheader : undefined
                const again = templateHtmlFile({ subject, preheader, html: file })
                checked++
                if (parsed.subject !== wantSubject || parsedPreheader !== wantPreheader || again !== file) {
                    failures.push(JSON.stringify({ html, subject, preheader, file, parsed, idempotent: again === file }))
                }
            }
        }
    }
}
console.log(`checked ${checked}, failed ${failures.length}`)
console.log(failures.slice(0, 5).join('\n'))
