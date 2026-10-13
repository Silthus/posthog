import { useActions, useValues } from 'kea'

import { IconCopy, IconDrag, IconTrash } from '@posthog/icons'

import { LemonMenu } from 'lib/lemon-ui/LemonMenu'

import { hogFlowEditorLogic } from '../../hogFlowEditorLogic'
import type { HogFlowAction } from '../../types'
import { tileCanvasLogic } from './tileCanvasLogic'
import { hasStepMenu } from './tileCanvasModel'

export function TileStepMenu({ action, children }: { action: HogFlowAction; children: JSX.Element }): JSX.Element {
    const { stepMenuActionId } = useValues(tileCanvasLogic)
    const { openStepMenu, closeStepMenu } = useActions(tileCanvasLogic)
    const { selectedNode, selectedNodeCanBeDeleted, selectedNodeCanBeCopiedOrMoved } = useValues(hogFlowEditorLogic)
    const { startCopyingNode, startMovingNode, onNodesDelete } = useActions(hogFlowEditorLogic)
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
                                    onClick: () => startCopyingNode(node),
                                }
                              : null,
                          selectedNodeCanBeCopiedOrMoved
                              ? {
                                    label: 'Move',
                                    icon: <IconDrag />,
                                    'data-attr': 'workflow-tile-step-move',
                                    onClick: () => startMovingNode(node),
                                }
                              : null,
                          {
                              label: 'Delete',
                              status: 'danger',
                              icon: <IconTrash />,
                              'data-attr': 'workflow-tile-step-delete',
                              onClick: () => onNodesDelete([node]),
                              disabledReason: selectedNodeCanBeDeleted ? undefined : 'Clean up branching steps first',
                          },
                      ]
                    : []
            }
        >
            <div
                onContextMenu={(event) => {
                    event.preventDefault()
                    openStepMenu(action.id)
                }}
            >
                {children}
            </div>
        </LemonMenu>
    )
}
