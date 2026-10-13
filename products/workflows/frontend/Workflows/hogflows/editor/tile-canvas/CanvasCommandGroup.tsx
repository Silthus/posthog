import { BindLogic, useActions, useValues } from 'kea'

import { IconEllipsis } from '@posthog/icons'
import { LemonButton, LemonMenu } from '@posthog/lemon-ui'

import { WorkflowLogicProps } from '../../../workflowLogic'
import { tileCanvasLogic } from './tileCanvasLogic'
import { useCanvasCommands } from './useCanvasCommands'

function CanvasCommandButtons(): JSX.Element {
    const { panelMode } = useValues(tileCanvasLogic)
    const { togglePanel } = useActions(tileCanvasLogic)
    const { panel, morePanels, view } = useCanvasCommands()
    const moreIsActive = morePanels.some((command) => command.mode === panelMode)

    return (
        <div className="flex flex-wrap items-center gap-1" data-attr="workflow-tile-commands">
            {panel.map((command) => (
                <LemonButton
                    key={command.id}
                    size="small"
                    icon={command.icon}
                    active={panelMode === command.mode}
                    onClick={() => togglePanel(command.mode)}
                    data-attr={`workflow-tile-command-${command.id}`}
                >
                    {command.label}
                </LemonButton>
            ))}
            <LemonMenu
                items={[
                    {
                        items: morePanels.map((command) => ({
                            label: command.label,
                            icon: command.icon,
                            active: panelMode === command.mode,
                            onClick: () => togglePanel(command.mode),
                            'data-attr': `workflow-tile-command-${command.id}`,
                        })),
                    },
                    {
                        items: view.map((command) => ({
                            label: command.label,
                            icon: command.icon,
                            onClick: command.run,
                            'data-attr': `workflow-tile-command-${command.id}`,
                        })),
                    },
                ]}
            >
                <LemonButton
                    size="small"
                    icon={<IconEllipsis />}
                    active={moreIsActive}
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
