import { useReactFlow } from '@xyflow/react'
import { useValues } from 'kea'
import { MutableRefObject, RefObject, useEffect, useRef } from 'react'

import { canvasBounds } from './tileCanvasLayout'
import { tileCanvasLogic } from './tileCanvasLogic'
import { Point, readableFitViewport, Size, viewportAfterResize, viewportToFit } from './tileCanvasModel'

const FOCUS_MS = 400

const sizeOf = (element: HTMLElement): Size => ({ width: element.clientWidth, height: element.clientHeight })

function useSelectedStepBox(): MutableRefObject<(Point & Size) | undefined> {
    const { layout, measuredSizes, selectedNodeId } = useValues(tileCanvasLogic)
    const box = useRef<(Point & Size) | undefined>()
    const position = selectedNodeId ? layout?.positions[selectedNodeId] : undefined
    const size = selectedNodeId ? measuredSizes?.[selectedNodeId] : undefined
    box.current = position && size ? { ...position, width: size.width, height: size.height } : undefined
    return box
}

/** Without this, the graph stays pinned to the left edge as the docked panel opens and closes, so it
 * slides out of view or off centre. */
function useViewportFollowsResize(wrapperRef: RefObject<HTMLDivElement>): void {
    const reactFlow = useReactFlow()
    const selectedStepBox = useSelectedStepBox()
    useEffect(() => {
        const wrapper = wrapperRef.current
        if (!wrapper) {
            return
        }
        let previous = sizeOf(wrapper)
        const observer = new ResizeObserver(() => {
            const next = sizeOf(wrapper)
            if (next.width === previous.width && next.height === previous.height) {
                return
            }
            if (previous.width > 0 && previous.height > 0) {
                void reactFlow.setViewport(
                    viewportAfterResize(reactFlow.getViewport(), previous, next, selectedStepBox.current)
                )
            }
            previous = next
        })
        observer.observe(wrapper)
        return () => observer.disconnect()
    }, [reactFlow, wrapperRef, selectedStepBox])
}

/** Edits keep the viewport the person panned or zoomed to; only an explicit fit request moves it. */
function useFitOnRequest(wrapperRef: RefObject<HTMLDivElement>): void {
    const reactFlow = useReactFlow()
    const { fitRequest, layout, measuredSizes } = useValues(tileCanvasLogic)
    useEffect(() => {
        const wrapper = wrapperRef.current
        const bounds = layout && measuredSizes ? canvasBounds(layout, measuredSizes) : undefined
        if (wrapper && bounds) {
            void reactFlow.setViewport(readableFitViewport(bounds, sizeOf(wrapper)))
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fitRequest])
}

function useFocusOnFrame(wrapperRef: RefObject<HTMLDivElement>): void {
    const reactFlow = useReactFlow()
    const { frameFocus } = useValues(tileCanvasLogic)
    useEffect(() => {
        const wrapper = wrapperRef.current
        if (!wrapper || !frameFocus) {
            return
        }
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        void reactFlow.setViewport(viewportToFit(frameFocus.box, sizeOf(wrapper), reactFlow.getViewport().zoom), {
            duration: reduceMotion ? 0 : FOCUS_MS,
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [frameFocus?.request])
}

export function useCanvasViewport(wrapperRef: RefObject<HTMLDivElement>): void {
    useViewportFollowsResize(wrapperRef)
    useFitOnRequest(wrapperRef)
    useFocusOnFrame(wrapperRef)
}
