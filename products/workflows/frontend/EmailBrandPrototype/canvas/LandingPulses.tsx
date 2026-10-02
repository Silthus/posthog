import { SourceTag } from '../shared/SourceTag'
// PROTOTYPE (throwaway): flashes the part of the email a newly found brand value just changed.
import { BrandFieldKey, BrandSimulation } from '../simulation'
import { chipPlacement, regionPlacement } from './previewModel'

export function LandingPulses({
    sim,
    scale,
    keys,
}: {
    sim: BrandSimulation
    scale: number
    keys: BrandFieldKey[]
}): JSX.Element {
    return (
        <>
            {keys.map((key) => (
                <div key={key} className="pointer-events-none">
                    <div
                        className="absolute rounded-md outline-2 outline-offset-2 outline-success motion-safe:animate-pulse"
                        style={regionPlacement(key, scale)}
                    />
                    <div
                        className="absolute z-10 animate-fade-in rounded-full bg-surface-primary shadow-sm"
                        style={chipPlacement(key, scale)}
                    >
                        <SourceTag source={sim.state.sources[key]} />
                    </div>
                </div>
            ))}
        </>
    )
}
