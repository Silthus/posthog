// PROTOTYPE (throwaway): one bordered block of the Email brand page.
interface SectionProps {
    title: string
    description?: string
    children: React.ReactNode
    'data-attr'?: string
}

export function Section({ title, description, children, 'data-attr': dataAttr }: SectionProps): JSX.Element {
    return (
        <section className="rounded-lg border bg-surface-primary p-4 flex flex-col gap-4" data-attr={dataAttr}>
            <div className="flex flex-col gap-0.5">
                <h2 className="m-0 text-base font-semibold">{title}</h2>
                {description && <p className="m-0 text-xs text-secondary">{description}</p>}
            </div>
            {children}
        </section>
    )
}
