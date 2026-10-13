import { useActions, useValues } from 'kea'
import posthog from 'posthog-js'

import { IconCopy, IconDrag, IconTrash } from '@posthog/icons'

import { LemonMenu } from 'lib/lemon-ui/LemonMenu'

import type { HogFlowAction } from '../../types'
import { tileCanvasLogic } from './tileCanvasLogic'
import { hasStepMenu } from './tileCanvasModel'

function captureMenuUse(choice: 'copy' | 'move' | 'delete'): void {
    posthog.capture('workflows tile canvas step menu used', { choice })
}

export function TileStepMenu({ action, children }: { action: HogFlowAction; children: JSX.Element }): JSX.Element {
    const { stepMenuActionId, selectedNode, selectedNodeCanBeDeleted, selectedNodeCanBeCopiedOrMoved } =
        useValues(tileCanvasLogic)
    const { closeStepMenu, startCopyingNode, startMovingNode, onNodesDelete } = useActions(tileCanvasLogic)
    const node = selectedNode?.id === action.id ? selectedNode : null

    if (!hasStepMenu(action)) {
        return children
    }

    return (
        <LemonMenu
            visible={stepMenuActionId === action.id && !!node}
            onVisibilityChange={(visible) => !visible && closeStepMenu()}
            placement="right-start"
            items={
                node
                    ? [
                          selectedNodeCanBeCopiedOrMoved
                              ? {
                                    label: 'Copy',
                                    icon: <IconCopy />,
                                    'data-attr': 'workflow-tile-step-copy',
                                    onClick: () => {
                                        captureMenuUse('copy')
                                        startCopyingNode(node)
                                    },
                                }
                              : null,
                          selectedNodeCanBeCopiedOrMoved
                              ? {
                                    label: 'Move',
                                    icon: <IconDrag />,
                                    'data-attr': 'workflow-tile-step-move',
                                    onClick: () => {
                                        captureMenuUse('move')
                                        startMovingNode(node)
                                    },
                                }
                              : null,
                          {
                              label: 'Delete',
                              status: 'danger',
                              icon: <IconTrash />,
                              'data-attr': 'workflow-tile-step-delete',
                              onClick: () => {
                                  captureMenuUse('delete')
                                  onNodesDelete([node])
                              },
                              disabledReason: selectedNodeCanBeDeleted ? undefined : 'Clean up branching steps first',
                          },
                      ]
                    : []
            }
        >
            {children}
        </LemonMenu>
    )
}
