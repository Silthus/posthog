const P1 =
    'Thanks for signing up. Over the next week we will send you a few short emails that help you get set up and find the features that matter most.'
const P2 = 'Start by connecting your first data source. It takes about five minutes, and everything else builds on it.'
const body = {
    id: 'body',
    headers: [],
    footers: [],
    values: {
        backgroundColor: '#ffffff',
        contentWidth: '600px',
        textColor: '#1d1f27',
        fontFamily: { label: 'Arial', value: 'arial,helvetica,sans-serif' },
    },
}
const heading = (id, extra = {}) => ({
    id,
    type: 'heading',
    values: {
        headingType: 'h1',
        fontSize: '26px',
        lineHeight: '130%',
        containerPadding: '32px 24px 8px',
        text: 'Welcome to Acme',
        ...extra,
    },
})
const text = (id, html, extra = {}) => ({
    id,
    type: 'text',
    values: { fontSize: '16px', lineHeight: '150%', containerPadding: '8px 24px', text: html, ...extra },
})
const button = (id) => ({
    id,
    type: 'button',
    values: {
        text: 'Connect a data source',
        href: { name: 'web', values: { href: 'https://example.com/setup', target: '_blank' } },
        buttonColors: {
            color: '#FFFFFF',
            backgroundColor: '#1d4aff',
            hoverColor: '#FFFFFF',
            hoverBackgroundColor: '#1d4aff',
        },
        fontSize: '16px',
        padding: '12px 24px',
        borderRadius: '6px',
        textAlign: 'left',
        containerPadding: '16px 24px',
    },
})
const divider = (id) => ({
    id,
    type: 'divider',
    values: {
        border: { borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: '#E5E7EB' },
        containerPadding: '16px 24px',
    },
})
const wrap = (contents) => ({
    counters: {},
    schemaVersion: 16,
    body: { ...body, rows: [{ id: 'row1', cells: [1], columns: [{ id: 'col1', contents, values: {} }], values: {} }] },
})
export const designs = {
    'a-baseline-two-p': wrap([heading('h'), text('t', `<p>${P1}</p><p>${P2}</p>`), button('b'), divider('d')]),
    'b-block-per-paragraph': wrap([
        heading('h'),
        text('t1', `<p>${P1}</p>`),
        text('t2', `<p>${P2}</p>`),
        button('b'),
        divider('d'),
    ]),
    'c-inline-p-margin': wrap([
        heading('h'),
        text('t', `<p style="margin: 0 0 16px;">${P1}</p><p style="margin: 0 0 16px;">${P2}</p>`),
        button('b'),
        divider('d'),
    ]),
    'd-empty-paragraph': wrap([
        heading('h'),
        text('t', `<p>${P1}</p><p>&nbsp;</p><p>${P2}</p>`),
        button('b'),
        divider('d'),
    ]),
    'e-double-br': wrap([heading('h'), text('t', `<p>${P1}<br /><br />${P2}</p>`), button('b'), divider('d')]),
}
