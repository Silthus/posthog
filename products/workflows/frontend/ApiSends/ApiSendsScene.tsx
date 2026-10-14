import { useActions, useValues } from 'kea'

import { LemonBanner, SpinnerOverlay } from '@posthog/lemon-ui'

import { EmptyMessage } from 'lib/components/EmptyMessage/EmptyMessage'
import { SceneExport } from 'scenes/sceneTypes'

import { SceneContent } from '~/layout/scenes/components/SceneContent'
import { ProductKey } from '~/queries/schema/schema-general'

import { apiSendsSceneLogic } from './apiSendsSceneLogic'

export const scene: SceneExport = {
    component: ApiSendsScene,
    logic: apiSendsSceneLogic,
    productKey: ProductKey.WORKFLOWS,
}

export function ApiSendsScene(): JSX.Element {
    const { resolution } = useValues(apiSendsSceneLogic)
    const { loadApiSendsFlow } = useActions(apiSendsSceneLogic)

    if (resolution === 'loading' || resolution === 'redirecting') {
        return <SpinnerOverlay sceneLevel />
    }

    return (
        <SceneContent>
            {resolution === 'error' ? (
                <LemonBanner type="error" action={{ children: 'Try again', onClick: loadApiSendsFlow }}>
                    Couldn't load your API sends.
                </LemonBanner>
            ) : (
                <EmptyMessage
                    title="No emails sent through the API yet"
                    description="After your first send through the email API, this link opens the list of every email sent that way."
                    buttonText="Read the docs"
                    buttonTo="https://posthog.com/docs/workflows/email-api"
                    buttonDataAttr="workflows-api-sends-docs"
                />
            )}
        </SceneContent>
    )
}
