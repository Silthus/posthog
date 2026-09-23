import './OsVariants.scss'

import { useMountedLogic, useValues } from 'kea'

import { OsShell } from '../shell/OsShell'
import { osWindowsLogic } from '../windows/osWindowsLogic'
import { OsLauncherShell } from './launcher/OsLauncherShell'
import { OsMacShell } from './mac/OsMacShell'
import { OsVariantBar } from './OsVariantBar'
import { osVariantLogic } from './osVariantLogic'
import { OsTilingShell } from './tiling/OsTilingShell'

/**
 * PROTOTYPE: renders the OS shell design this tab picked on `/os?variant=`, and the switcher while it
 * explores them. Every other tab gets the default design (`DEFAULT_OS_VARIANT`).
 */
export function OsVariantShell(): JSX.Element {
    // The window layer remounts with each design, so the windows logic stays mounted to keep them open.
    useMountedLogic(osWindowsLogic)
    const { variant, exploring } = useValues(osVariantLogic)

    return (
        <>
            {variant === 'a' && <OsShell />}
            {variant === 'b' && <OsMacShell />}
            {variant === 'c' && <OsLauncherShell />}
            {variant === 'd' && <OsTilingShell />}
            {exploring && <OsVariantBar />}
        </>
    )
}
