import { PostgresRouter } from '~/common/utils/db/postgres'

import { OrganizationMembersService } from './organization-members.service'

describe('sandbox organization membership decisions', () => {
    it('rejects a member response that outlasts its one-minute decision', async () => {
        let now = 0
        const organizationId = '00000000-0000-0000-0000-000000000001'
        const query = jest
            .fn()
            .mockResolvedValueOnce({ rows: [{ id: 1, organization_id: organizationId }] })
            .mockImplementationOnce(() => {
                now = 60_000
                return Promise.resolve({ rows: [{ organization_id: organizationId, email: 'member@example.com' }] })
            })
        const service = new OrganizationMembersService({ query } as unknown as PostgresRouter, () => now)

        await expect(service.getBlockedRecipients(1, ['member@example.com'])).rejects.toThrow('expired')
    })

    it('shares a bounded organization lookup across repeated sends and refreshes it after a minute', async () => {
        let now = 0
        let organizationId = '00000000-0000-0000-0000-000000000001'
        const query = jest.fn((_use, _sql, _params, operation) =>
            Promise.resolve({
                rows:
                    operation === 'fetch-sandbox-team-organization'
                        ? [{ id: 1, organization_id: organizationId }]
                        : [{ organization_id: organizationId, email: 'member@example.com' }],
            })
        )
        const service = new OrganizationMembersService({ query } as unknown as PostgresRouter, () => now)

        expect(await service.getBlockedRecipients(1, ['member@example.com'])).toEqual([])
        expect(await service.getBlockedRecipients(1, ['member@example.com'])).toEqual([])
        expect(
            query.mock.calls.filter(([, , , operation]) => operation === 'fetch-sandbox-team-organization')
        ).toHaveLength(1)

        now = 60_001
        organizationId = '00000000-0000-0000-0000-000000000002'
        expect(await service.getBlockedRecipients(1, ['member@example.com'])).toEqual([])
        expect(
            query.mock.calls.filter(([, , , operation]) => operation === 'fetch-sandbox-team-organization')
        ).toHaveLength(2)
    })
})
