// PROTOTYPE (throwaway): remembers which brand values each file produced, and which just landed, so the canvas can animate them.
import { useEffect, useRef, useState } from 'react'

import { BRAND_FIELD_ORDER, BrandFieldKey, BrandState } from '../simulation'

export interface LandedSignals {
    byFile: Record<string, BrandFieldKey[]>
    recent: BrandFieldKey[]
}

export function useLandedSignals(sources: BrandState['sources'], runs: number): LandedSignals {
    const previous = useRef({ sources, runs })
    const [byFile, setByFile] = useState<Record<string, BrandFieldKey[]>>({})
    const [recent, setRecent] = useState<BrandFieldKey[]>([])

    useEffect(() => {
        const prev = previous.current
        previous.current = { sources, runs }
        const newRun = prev.runs !== runs
        const landed = BRAND_FIELD_ORDER.filter((key) => sources[key] && sources[key] !== prev.sources[key])
        if (newRun) {
            setByFile({})
        }
        if (!landed.length) {
            return
        }
        setByFile((current) => {
            const next = newRun ? {} : { ...current }
            for (const key of landed) {
                const file = sources[key]?.file ?? ''
                next[file] = [...(next[file] ?? []).filter((existing) => existing !== key), key]
            }
            return next
        })
        setRecent(landed)
    }, [sources, runs])

    useEffect(() => {
        if (!recent.length) {
            return
        }
        const timer = setTimeout(() => setRecent([]), 1600)
        return () => clearTimeout(timer)
    }, [recent])

    return { byFile, recent }
}
