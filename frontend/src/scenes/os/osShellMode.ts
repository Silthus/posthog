import type { Navigation3000Mode } from '~/layout/navigation-3000/navigationLogic'

export interface OsShellModeInput {
    regularMode: Navigation3000Mode
    framed: boolean
    osShellEnabled: boolean
}

export function resolveOsShellMode({ regularMode, framed, osShellEnabled }: OsShellModeInput): Navigation3000Mode {
    // A framed page never renders the OS shell, so an OS window cannot open a second desktop.
    if (framed) {
        return 'framed'
    }
    // Scenes that already own the whole page (onboarding, an unavailable organization) keep their layout.
    if (osShellEnabled && (regularMode === 'full' || regularMode === 'zen')) {
        return 'os'
    }
    return regularMode
}
