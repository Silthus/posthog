import { ReactNode } from 'react'

import { LemonMenuItem, LemonTable, LemonTag } from '@posthog/lemon-ui'

import { More } from 'lib/lemon-ui/LemonButton/More'
import { LemonMenuOverlay } from 'lib/lemon-ui/LemonMenu/LemonMenu'
import { createdByColumn, updatedAtColumn } from 'lib/lemon-ui/LemonTable/columnUtils'
import { LemonTableLink } from 'lib/lemon-ui/LemonTable/LemonTableLink'
import { HogFunctionIcon } from 'scenes/hog-functions/configuration/HogFunctionIcon'
import { HogFunctionStatusIndicator } from 'scenes/hog-functions/misc/HogFunctionStatusIndicator'
import { urls } from 'scenes/urls'

import { HogFunctionType } from '~/types'

import {
    BLOCKED_DESTINATION,
    BLOCKED_REASON,
    BLOCKED_REASON_SOURCE,
    DESTINATION,
    OTHER_DESTINATION,
} from './destinationMoveFixtures'

export type DestinationRowDecoration = {
    nameSuffix?: ReactNode
    status?: ReactNode
    rowClassName?: string
    menuItems: LemonMenuItem[]
}

export function openAsWorkflowMenuItem(hogFunction: HogFunctionType, onClick: () => void): LemonMenuItem {
    const blocked = hogFunction.id === BLOCKED_DESTINATION.id
    return {
        label: 'Open as workflow',
        onClick,
        disabledReason: blocked ? `${BLOCKED_REASON} (${BLOCKED_REASON_SOURCE})` : undefined,
        'data-attr': 'destination-open-as-workflow-row',
    }
}

export function DestinationListFrame({
    movedDestination,
    decorate,
}: {
    movedDestination?: HogFunctionType
    decorate: (hogFunction: HogFunctionType) => DestinationRowDecoration
}): JSX.Element {
    const rows = [movedDestination ?? DESTINATION, BLOCKED_DESTINATION, OTHER_DESTINATION]
    return (
        <LemonTable
            dataSource={rows}
            rowClassName={(hogFunction) => decorate(hogFunction).rowClassName ?? null}
            columns={[
                {
                    title: '',
                    width: 0,
                    render: (_, hogFunction) => <HogFunctionIcon src={hogFunction.icon_url} size="small" />,
                },
                {
                    title: 'Name',
                    key: 'name',
                    render: (_, hogFunction) => (
                        <LemonTableLink
                            to={urls.hogFunction(hogFunction.id)}
                            title={
                                <span className="flex flex-wrap items-center gap-2">
                                    {hogFunction.name}
                                    {decorate(hogFunction).nameSuffix}
                                </span>
                            }
                            description={hogFunction.description}
                        />
                    ),
                },
                createdByColumn() as any,
                updatedAtColumn() as any,
                {
                    title: 'Last 7 days',
                    width: 0,
                    render: () => <span className="text-muted text-xs">No data in Storybook</span>,
                },
                {
                    title: 'Status',
                    width: 0,
                    render: (_, hogFunction) =>
                        decorate(hogFunction).status ?? <HogFunctionStatusIndicator hogFunction={hogFunction} />,
                },
                {
                    width: 0,
                    render: (_, hogFunction) => (
                        <More overlay={<LemonMenuOverlay items={decorate(hogFunction).menuItems} />} />
                    ),
                },
            ]}
        />
    )
}

export function MovedTag({ size = 'medium' }: { size?: 'small' | 'medium' }): JSX.Element {
    return (
        <LemonTag type="completion" size={size}>
            Moved to Workflows
        </LemonTag>
    )
}
