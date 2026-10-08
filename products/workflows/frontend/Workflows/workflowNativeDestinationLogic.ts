import { MakeLogicType, actions, afterMount, connect, kea, key, listeners, path, props, reducers, selectors } from 'kea'
import { subscriptions } from 'kea-subscriptions'

import { featureFlagLogic } from 'lib/logic/featureFlagLogic'
import type { HogFunctionConfigurationProps } from 'scenes/hog-functions/configuration/HogFunctionConfiguration'
import {
    hogFunctionConfigurationLogic,
    hogFunctionConfigurationLogicValues,
} from 'scenes/hog-functions/configuration/hogFunctionConfigurationLogic'
import { teamLogic, teamLogicValues } from 'scenes/teamLogic'

import type { HogFunctionConfigurationType } from '~/types'

import { DistributionOffer, DistributionSource, workflowDistributionLogic } from './workflowDistributionLogic'
import { parseWorkflowTriggerPrefill, WorkflowTriggerConfig } from './workflowTriggerPrefill'

function exactEventTrigger(configuration: HogFunctionConfigurationType): WorkflowTriggerConfig | undefined {
    const filters = configuration.filters
    if (!filters || configuration.mappings?.length || filters.events?.length !== 1) {
        return undefined
    }
    const event = filters.events[0]
    const neutralKeys = [
        'events',
        'source',
        'actions',
        'properties',
        'data_warehouse',
        'filter_test_accounts',
        'bytecode',
        'bytecode_error',
    ]
    if (
        Object.keys(filters).some((key) => !neutralKeys.includes(key)) ||
        (filters.source && filters.source !== 'events') ||
        filters.actions?.length ||
        filters.properties?.length ||
        filters.data_warehouse?.length ||
        filters.filter_test_accounts ||
        filters.bytecode_error ||
        event.type !== 'events' ||
        !event.id ||
        event.properties?.length ||
        Object.keys(event).some((key) => !['id', 'name', 'type', 'order', 'properties'].includes(key)) ||
        new TextEncoder().encode(event.id).length > 512
    ) {
        return undefined
    }
    return (
        parseWorkflowTriggerPrefill(
            JSON.stringify({
                type: 'event',
                filters: { events: [{ id: event.id, name: event.id, type: 'events' }] },
            })
        ) ?? undefined
    )
}

export interface workflowNativeDestinationLogicValues
    extends
        Pick<hogFunctionConfigurationLogicValues, 'loaded' | 'loading' | 'template' | 'hogFunction' | 'configuration'>,
        Pick<teamLogicValues, 'currentTeam'> {
    sourceProjectUuid: string | null
    offers: Record<string, DistributionOffer>
    source: DistributionSource | null
    offer: DistributionOffer | null
    providerName: string
}
export interface workflowNativeDestinationLogicActions {
    setSourceProjectUuid: (sourceProjectUuid: string | null) => { sourceProjectUuid: string | null }
    evaluate: () => {}
    shown: () => {}
    open: () => {}
    dismiss: () => {}
}
export type workflowNativeDestinationLogicType = MakeLogicType<
    workflowNativeDestinationLogicValues,
    workflowNativeDestinationLogicActions,
    HogFunctionConfigurationProps
>

export const workflowNativeDestinationLogic = kea<workflowNativeDestinationLogicType>([
    props({} as HogFunctionConfigurationProps),
    key((props: HogFunctionConfigurationProps) => props.logicKey || props.id || props.templateId || 'new'),
    path((key) => ['products', 'workflows', 'workflowNativeDestinationLogic', key]),
    connect((props: HogFunctionConfigurationProps) => ({
        values: [
            hogFunctionConfigurationLogic(props),
            ['loaded', 'loading', 'template', 'hogFunction', 'configuration'],
            teamLogic,
            ['currentTeam'],
            workflowDistributionLogic,
            ['offers'],
            featureFlagLogic,
            [],
        ],
    })),
    actions({
        setSourceProjectUuid: (sourceProjectUuid: string | null) => ({ sourceProjectUuid }),
        evaluate: () => ({}),
        shown: () => ({}),
        open: () => ({}),
        dismiss: () => ({}),
    }),
    reducers({
        sourceProjectUuid: [
            null as string | null,
            { setSourceProjectUuid: (_, { sourceProjectUuid }) => sourceProjectUuid },
        ],
    }),
    selectors({
        source: [
            (s) => [
                s.loaded,
                s.loading,
                s.template,
                s.hogFunction,
                s.configuration,
                s.currentTeam,
                s.sourceProjectUuid,
            ],
            (
                loaded,
                loading,
                template,
                hogFunction,
                configuration,
                currentTeam,
                sourceProjectUuid
            ): DistributionSource | null => {
                const resolved = hogFunction ?? template
                const providerTemplateId = hogFunction?.template?.id ?? template?.id
                if (
                    !loaded ||
                    loading ||
                    !resolved ||
                    resolved.type !== 'destination' ||
                    hogFunction?.deleted ||
                    !currentTeam?.uuid ||
                    currentTeam.uuid !== sourceProjectUuid ||
                    !['template-sendgrid', 'template-customerio'].includes(providerTemplateId ?? '')
                ) {
                    return null
                }
                return {
                    projectUuid: currentTeam.uuid,
                    placementId: 'native-destination',
                    sourceActionId: `${providerTemplateId}:${hogFunction?.id ?? 'new'}`,
                    providerTemplateId: providerTemplateId as 'template-sendgrid' | 'template-customerio',
                    eligible: true,
                    trigger: exactEventTrigger(configuration),
                }
            },
        ],
        offer: [
            (s) => [s.source, s.offers],
            (source: DistributionSource | null, offers: Record<string, DistributionOffer>): DistributionOffer | null =>
                source
                    ? (Object.values(offers).find(
                          (offer) =>
                              offer.placementId === 'native-destination' &&
                              offer.projectUuid === source.projectUuid &&
                              offer.providerTemplateId === source.providerTemplateId &&
                              offer.sourceActionId === source.sourceActionId
                      ) ?? null)
                    : null,
        ],
        providerName: [
            (s) => [s.source],
            (source): string => (source?.providerTemplateId === 'template-customerio' ? 'Customer.io' : 'SendGrid'),
        ],
    }),
    listeners(({ values, actions }) => ({
        [featureFlagLogic.actionTypes.setFeatureFlags]: () => actions.evaluate(),
        evaluate: () => {
            if (values.offer) {
                workflowDistributionLogic.actions.removeOffer(values.offer.contextKey)
            }
            if (values.source) {
                workflowDistributionLogic.actions.offer(values.source)
            }
        },
        shown: () => {
            if (values.offer) {
                workflowDistributionLogic.actions.offerShown(values.offer.contextKey)
            }
        },
        open: () => {
            if (values.offer) {
                workflowDistributionLogic.actions.open(values.offer.contextKey, true)
            }
        },
        dismiss: () => {
            if (values.offer) {
                workflowDistributionLogic.actions.dismiss(values.offer.contextKey)
            }
        },
    })),
    subscriptions(({ actions }) => ({ source: () => actions.evaluate() })),
    afterMount(({ actions, values }) => {
        actions.setSourceProjectUuid(values.currentTeam?.uuid ?? null)
        actions.evaluate()
    }),
])
