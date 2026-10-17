import { parseTemplateFile } from './email-template-file.ts'
import { emailContentHash } from './email-content-hash.ts'
import { readFileSync } from 'node:fs'

const files: Record<string, string> = JSON.parse(readFileSync(process.argv[2], 'utf8'))
for (const [name, file] of Object.entries(files)) {
    const parsed = parseTemplateFile(file)
    const hash = await emailContentHash(parsed)
    console.log(JSON.stringify({ name, subject: parsed.subject, preheader: parsed.preheader, hash }))
}
