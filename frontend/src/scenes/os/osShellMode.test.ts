import { resolveOsShellMode } from './osShellMode'

describe('resolveOsShellMode', () => {
    test.each([
        ['full', false, true, 'os'],
        ['zen', false, true, 'os'],
        ['full', false, false, 'full'],
        ['zen', false, false, 'zen'],
        ['minimal', false, false, 'minimal'],
        ['none', false, false, 'none'],
        ['minimal', false, true, 'minimal'],
        ['none', false, true, 'none'],
        ['full', true, true, 'framed'],
        ['full', true, false, 'framed'],
        ['zen', true, true, 'framed'],
        ['minimal', true, true, 'framed'],
    ] as const)('regular mode %s, framed %s, flag %s gives %s', (regularMode, framed, osShellEnabled, expected) => {
        expect(resolveOsShellMode({ regularMode, framed, osShellEnabled })).toBe(expected)
    })
})
