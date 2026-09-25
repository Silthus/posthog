// PROTOTYPE (throwaway): placeholder a variant worker replaces with their own variant.
export function PrototypeComingSoon({ name }: { name: string }): JSX.Element {
    return (
        <div className="border border-dashed rounded p-8 text-center text-secondary">
            <div className="font-semibold text-primary">Coming soon</div>
            <div>The {name} variant isn't built yet.</div>
        </div>
    )
}
