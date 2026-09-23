import { resolveOsVariant } from './osVariants'

describe('resolveOsVariant', () => {
    test.each([
        [
            'a regular URL ignores the param',
            '/project/1/insights',
            '?variant=c',
            null,
            { variant: 'a', exploring: false },
        ],
        ['a tab that picked on /os keeps its pick', '/project/1/insights', '', 'b', { variant: 'b', exploring: true }],
        ['a regular URL ignores a stale stored value', '/insights', '', 'zzz', { variant: 'a', exploring: false }],
        ['/os picks from the param', '/project/1/os', '?variant=C', 'b', { variant: 'c', exploring: true }],
        ['/os falls back to the stored pick', '/os', '?variant=nope', 'd', { variant: 'd', exploring: true }],
        ['/os without a pick explores the default', '/os', '', null, { variant: 'a', exploring: true }],
    ])('%s', (_, pathname, search, stored, expected) => {
        expect(resolveOsVariant(pathname, search, stored)).toEqual(expected)
    })
})
