import { useValues } from 'kea'
import { router } from 'kea-router'

import { sceneLogic } from 'scenes/sceneLogic'
import { Scene } from 'scenes/sceneTypes'

import { osFrameSrc } from '../bridge/osFrame'
import { OsWindow } from '../windows/OsWindow'

export function OsShell(): JSX.Element {
    const { location } = useValues(router)
    const { activeSceneId, sceneConfig } = useValues(sceneLogic)

    // The desktop route has no page of its own to open, so it shows the desktop alone.
    const src = activeSceneId === Scene.Os ? null : osFrameSrc(location, window.location.origin)

    return (
        <div className="flex flex-col h-screen w-full p-4 bg-surface-tertiary" data-attr="os-shell">
            {src && <OsWindow id="focused" title={sceneConfig?.name ?? 'PostHog'} src={src} />}
        </div>
    )
}
