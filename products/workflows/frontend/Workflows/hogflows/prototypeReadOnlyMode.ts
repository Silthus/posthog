// PROTOTYPE ONLY. Throwaway switch so stories can render the alternatives of the read-only canvas
// side by side. Not a real feature surface: a module variable, no reactivity, no persistence.

import { useValues } from 'kea'

import { codeManagedReason } from '../codeManagedWorkflow'
import { workflowLogic } from '../workflowLogic'

export interface PrototypeReadOnlyMode {
    /** Canvas grips, duplicate and delete icons: taken out, or left in place but inert. */
    affordances: 'removed' | 'disabled'
    /** The auto-save toggle and the "Last saved in ..." text. */
    autosave: 'hidden' | 'disabled'
    /** How node configuration inputs are locked. */
    panelInputs: 'readOnly' | 'disabled'
}

const DEFAULT_MODE: PrototypeReadOnlyMode = {
    affordances: 'removed',
    autosave: 'hidden',
    panelInputs: 'disabled',
}

let currentMode: PrototypeReadOnlyMode = { ...DEFAULT_MODE }

export function setPrototypeReadOnlyMode(mode: Partial<PrototypeReadOnlyMode> = {}): void {
    currentMode = { ...DEFAULT_MODE, ...mode }
}

export function getPrototypeReadOnlyMode(): PrototypeReadOnlyMode {
    return currentMode
}

export interface WorkflowReadOnlyState {
    readOnly: boolean
    reason: string
    mode: PrototypeReadOnlyMode
}

/** Read-only state of the workflow the canvas is rendering, plus the prototype switch. */
export function useWorkflowReadOnly(): WorkflowReadOnlyState {
    const { canEditWorkflow, workflow } = useValues(workflowLogic)
    return {
        readOnly: !canEditWorkflow,
        reason: codeManagedReason(workflow),
        mode: getPrototypeReadOnlyMode(),
    }
}
