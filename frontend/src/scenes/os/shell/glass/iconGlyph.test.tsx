import { IconApp, IconGraph, IconGroups, IconRewindPlay } from '@posthog/icons'

import { iconForType } from '~/layout/panel-layout/ProjectTree/defaultTree'

import { glyphFromIcon } from './iconGlyph'

describe('glyphFromIcon', () => {
    test.each([
        ['a plain icon', <IconGraph key="graph" />],
        ['an icon whose path cuts holes', <IconGroups key="groups" />],
        ['a product icon inside its color wrapper', iconForType('product_analytics')],
    ])('turns %s into glass glyph parts', (_description, icon) => {
        const glyph = glyphFromIcon(icon)

        expect(glyph?.viewBox).toBe('0 0 24 24')
        expect(glyph?.parts.length).toBeGreaterThan(0)
        for (const part of glyph?.parts ?? []) {
            expect(part.d).toMatch(/^M/)
        }
    })

    it('keeps the fill rule, so cut-outs stay holes in the glass', () => {
        expect(glyphFromIcon(<IconGroups />)?.parts[0].fillRule).toBe('evenodd')
    })

    test.each([
        ['several paths', <IconApp key="app" />, 3],
        ['a clipped group and its defs', <IconRewindPlay key="rewind" />, 1],
    ])('reads every visible path of an icon drawn from %s', (_description, icon, expectedParts) => {
        expect(glyphFromIcon(icon)?.parts).toHaveLength(expectedParts)
    })

    test.each([
        ['an element that is not an icon', <span key="span">A</span>],
        [
            'an svg with a shape the glass cannot trace',
            <svg key="svg" viewBox="0 0 24 24">
                <circle r={4} />
            </svg>,
        ],
        ['a component that could run hooks', <CustomIcon key="custom" />],
    ])('returns null for %s', (_description, icon) => {
        expect(glyphFromIcon(icon)).toBeNull()
    })
})

function CustomIcon(): JSX.Element {
    return (
        <svg viewBox="0 0 24 24">
            <path d="M0 0h24v24H0z" />
        </svg>
    )
}
