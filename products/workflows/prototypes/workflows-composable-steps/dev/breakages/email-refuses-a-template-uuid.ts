// The typed email step carries content inline and has no `template_uuid` option,
// so a reference to a library template does not compile.

import { email } from '../../sdk'

export const welcome = email({
    name: 'Welcome the paid customer',
    to: '{person.properties.email}',
    subject: 'Welcome aboard',
    text: 'Hello',
    html: '<p>Hello</p>',
    template_uuid: '00000000-0000-0000-0000-000000000000',
})
