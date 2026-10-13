import { expectLogic } from 'kea-test-utils'

import { initKeaTests } from '~/test/init'

import { tileCanvasLogic } from './tileCanvasLogic'

describe('tileCanvasLogic', () => {
    let logic: ReturnType<typeof tileCanvasLogic.build>

    beforeEach(() => {
        initKeaTests()
        logic = tileCanvasLogic()
        logic.mount()
    })

    it('opens a panel mode and closes it again from the same command', async () => {
        await expectLogic(logic, () => logic.actions.togglePanel('logs')).toMatchValues({ panelMode: 'logs' })
        await expectLogic(logic, () => logic.actions.togglePanel('logs')).toMatchValues({
            panelMode: null,
            isPanelOpen: false,
        })
    })

    it('keeps the selected step when the panel switches mode', async () => {
        const stepId = logic.values.workflow.actions[0].id
        logic.actions.selectStep(stepId)

        await expectLogic(logic, () => logic.actions.togglePanel('logs')).toMatchValues({
            panelMode: 'logs',
            selectedNodeId: stepId,
        })
    })

    it('leaves history for the build mode of a step picked on the canvas', async () => {
        const stepId = logic.values.workflow.actions[0].id
        await expectLogic(logic, () => logic.actions.togglePanel('history')).toMatchValues({ panelMode: 'history' })

        await expectLogic(logic, () => logic.actions.selectStep(stepId)).toMatchValues({
            panelMode: 'build',
            selectedNodeId: stepId,
        })
    })
})
