// PROTOTYPE (throwaway): the shared shape of every side panel state: heading, scrolling body, pinned actions.
import { ReactNode } from 'react'

interface PanelLayoutProps {
    title: string
    description?: ReactNode
    children?: ReactNode
    footer?: ReactNode
}

export function PanelLayout({ title, description, children, footer }: PanelLayoutProps): JSX.Element {
    return (
        <div className="flex flex-col min-h-0 grow animate-fade-in">
            <div className="flex flex-col gap-3 p-4 overflow-y-auto grow min-h-0">
                <div className="flex flex-col gap-1">
                    <h2 className="m-0 text-lg font-bold leading-tight">{title}</h2>
                    {description && <div className="text-sm text-secondary">{description}</div>}
                </div>
                {children}
            </div>
            {footer && <div className="flex flex-col gap-2 p-3 border-t bg-surface-primary">{footer}</div>}
        </div>
    )
}
