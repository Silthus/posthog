import { useActions, useValues } from 'kea'

import { LemonButton } from '@posthog/lemon-ui'

import { OsAppIcon } from './OsAppIcon'
import { osAppPreviewLogic } from './osAppPreviewLogic'

export function OsAppPreviewBar({ appKey }: { appKey: string }): JSX.Element | null {
    const { previewBarApps } = useValues(osAppPreviewLogic)
    const { installApp } = useActions(osAppPreviewLogic)
    const app = previewBarApps[appKey]

    if (!app) {
        return null
    }

    return (
        <div
            className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-primary bg-surface-secondary px-3 py-1 text-xs"
            data-attr="os-app-preview-bar"
        >
            <OsAppIcon app={app} size="custom" className="size-5 rounded [&_svg]:size-3" />
            <span className="min-w-0 flex-1 truncate">
                Previewing <strong>{app.name}</strong>. Install it to add it to your desktop.
            </span>
            <LemonButton
                type="primary"
                size="xsmall"
                onClick={() => installApp(app.key)}
                data-attr="os-app-preview-install"
            >
                Install
            </LemonButton>
        </div>
    )
}
