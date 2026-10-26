import { PostgresRouter, PostgresUse } from '~/common/utils/db/postgres'
import { LazyLoader } from '~/common/utils/lazy-loader'

type OrganizationMemberSnapshot = {
    verifiedEmails: ReadonlySet<string>
    unverifiedEmails: ReadonlySet<string>
    expiresAt: number
}

export type BlockedRecipient = { readonly address: string; readonly unverifiedMember: boolean }

export type TeamOrganizationSnapshot = {
    readonly organizationId: string
    readonly sandboxSenderBlocked: boolean
    readonly expiresAt: number
}

const MAX_SNAPSHOT_AGE_MS = 60_000
const REFRESH_AGE_MS = MAX_SNAPSHOT_AGE_MS - 1_000

export class OrganizationMembersService {
    private snapshots: LazyLoader<OrganizationMemberSnapshot>
    private organizations: LazyLoader<TeamOrganizationSnapshot>

    constructor(
        postgres: PostgresRouter,
        private now: () => number = Date.now
    ) {
        this.organizations = new LazyLoader({
            name: 'sandbox_team_organizations',
            refreshAgeMs: REFRESH_AGE_MS,
            refreshJitterMs: 0,
            bufferMs: 0,
            loader: async (teamIds) => {
                const expiresAt = this.now() + MAX_SNAPSHOT_AGE_MS
                const { rows } = await postgres.query<{
                    id: number
                    organization_id: string
                    sandbox_sender_blocked: boolean
                }>(
                    PostgresUse.COMMON_WRITE,
                    `SELECT team.id, team.organization_id, block.id IS NOT NULL AS sandbox_sender_blocked
                     FROM posthog_team AS team
                     LEFT JOIN workflows_sandboxsenderorganizationblock AS block
                       ON block.organization_id = team.organization_id
                     WHERE team.id = ANY($1::bigint[])`,
                    [teamIds.map(Number)],
                    'fetch-sandbox-team-organization'
                )
                return Object.fromEntries(
                    rows.map((team) => [
                        String(team.id),
                        {
                            organizationId: team.organization_id,
                            sandboxSenderBlocked: team.sandbox_sender_blocked === true,
                            expiresAt,
                        },
                    ])
                )
            },
        })
        this.snapshots = new LazyLoader({
            name: 'organization_email_members',
            refreshAgeMs: REFRESH_AGE_MS,
            refreshJitterMs: 0,
            bufferMs: 0,
            loader: async (organizationIds) => {
                const expiresAt = this.now() + MAX_SNAPSHOT_AGE_MS
                const { rows } = await postgres.query<{
                    organization_id: string
                    email: string
                    is_email_verified: boolean | null
                }>(
                    PostgresUse.COMMON_WRITE,
                    `SELECT membership.organization_id, users.email, users.is_email_verified
                     FROM posthog_organizationmembership AS membership
                     JOIN posthog_user AS users ON users.id = membership.user_id
                     JOIN posthog_organization AS organization ON organization.id = membership.organization_id
                     WHERE membership.organization_id = ANY($1::uuid[])
                       AND users.is_active = true
                       AND organization.is_active IS NOT FALSE`,
                    [organizationIds],
                    'fetch-organization-email-members'
                )
                const members: Record<string, { verified: Set<string>; unverified: Set<string> }> = Object.fromEntries(
                    organizationIds.map((id) => [id, { verified: new Set<string>(), unverified: new Set<string>() }])
                )
                for (const row of rows) {
                    const { verified, unverified } = members[row.organization_id]
                    ;(row.is_email_verified === true ? verified : unverified).add(row.email.trim().toLowerCase())
                }
                return Object.fromEntries(
                    Object.entries(members).map(([id, { verified, unverified }]) => [
                        id,
                        { verifiedEmails: verified, unverifiedEmails: unverified, expiresAt },
                    ])
                )
            },
        })
    }

    public async getOrganizationSnapshot(teamId: number): Promise<TeamOrganizationSnapshot> {
        const key = String(teamId)
        let snapshot = await this.organizations.get(key)
        if (snapshot && this.now() >= snapshot.expiresAt) {
            this.organizations.markForRefresh(key)
            snapshot = await this.organizations.get(key)
        }
        if (!snapshot) {
            throw new Error('Could not identify the organization for this team')
        }
        if (this.now() >= snapshot.expiresAt) {
            this.organizations.markForRefresh(key)
            throw new Error('The organization lookup expired')
        }
        return snapshot
    }

    public async getBlockedRecipients(
        teamId: number,
        recipients: string[],
        organizationSnapshot?: TeamOrganizationSnapshot
    ): Promise<BlockedRecipient[]> {
        const expiresAt = this.now() + MAX_SNAPSHOT_AGE_MS
        const organization = organizationSnapshot ?? (await this.getOrganizationSnapshot(teamId))
        if (this.now() >= organization.expiresAt) {
            throw new Error('The organization lookup expired')
        }
        const { organizationId } = organization
        let snapshot = await this.snapshots.get(organizationId)
        if (snapshot && this.now() >= snapshot.expiresAt && this.now() < Math.min(expiresAt, organization.expiresAt)) {
            this.snapshots.markForRefresh(organizationId)
            snapshot = await this.snapshots.get(organizationId)
        }
        if (!snapshot) {
            throw new Error('Could not check organization members')
        }
        if (this.now() >= Math.min(expiresAt, snapshot.expiresAt, organization.expiresAt)) {
            this.snapshots.markForRefresh(organizationId)
            throw new Error('The organization member check expired')
        }
        return recipients
            .filter((email) => !snapshot.verifiedEmails.has(email.trim().toLowerCase()))
            .map((address) => ({
                address,
                unverifiedMember: snapshot.unverifiedEmails.has(address.trim().toLowerCase()),
            }))
    }
}
