import { BindLogic, useActions, useValues } from 'kea'

import { IconEllipsis } from '@posthog/icons'
import { LemonButton, LemonMenu } from '@posthog/lemon-ui'

import { WorkflowLogicProps } from '../../../workflowLogic'
import { tileCanvasLogic } from './tileCanvasLogic'
import { useCanvasCommands } from './useCanvasCommands'

function CanvasCommandButtons(): JSX.Element {
    const { openPanelMode } = useValues(tileCanvasLogic)
    const { togglePanel } = useActions(tileCanvasLogic)
    const { panel, view } = useCanvasCommands()

    return (
        <div className="flex items-center gap-1 border-l pl-3" data-attr="workflow-tile-commands">
            {panel.map((command) => (
                <LemonButton
                    key={command.id}
                    size="small"
                    icon={command.icon}
                    active={openPanelMode === command.mode}
                    onClick={() => togglePanel(command.mode)}
                    data-attr={`workflow-tile-command-${command.id}`}
                >
                    {command.label}
                </LemonButton>
            ))}
            <LemonMenu
                items={view.map((command) => ({
                    label: command.label,
                    icon: command.icon,
                    onClick: command.run,
                    'data-attr': `workflow-tile-command-${command.id}`,
                }))}
            >
                <LemonButton
                    size="small"
                    icon={<IconEllipsis />}
                    tooltip="More"
                    aria-label="More canvas commands"
                    data-attr="workflow-tile-command-more"
                />
            </LemonMenu>
        </div>
    )
}

/** The canvas commands for the workflow bar, which sits above the canvas and outside its logic binding. */
export function CanvasCommandGroup(props: WorkflowLogicProps): JSX.Element {
    return (
        <BindLogic logic={tileCanvasLogic} props={props}>
            <CanvasCommandButtons />
        </BindLogic>
    )
}
