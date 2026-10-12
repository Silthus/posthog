import { PostgresRouter, PostgresUse } from '~/common/utils/db/postgres'
import { LazyLoader } from '~/common/utils/lazy-loader'

type OrganizationMemberSnapshot = {
    emails: ReadonlySet<string>
    expiresAt: number
}

type TeamOrganizationSnapshot = { organizationId: string; expiresAt: number }

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
                const { rows } = await postgres.query<{ id: number; organization_id: string }>(
                    PostgresUse.COMMON_WRITE,
                    'SELECT id, organization_id FROM posthog_team WHERE id = ANY($1::bigint[])',
                    [teamIds.map(Number)],
                    'fetch-sandbox-team-organization'
                )
                return Object.fromEntries(
                    rows.map((team) => [String(team.id), { organizationId: team.organization_id, expiresAt }])
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
                const { rows } = await postgres.query<{ organization_id: string; email: string }>(
                    PostgresUse.COMMON_WRITE,
                    `SELECT membership.organization_id, users.email
                     FROM posthog_organizationmembership AS membership
                     JOIN posthog_user AS users ON users.id = membership.user_id
                     WHERE membership.organization_id = ANY($1::uuid[])
                       AND users.is_active = true AND users.is_email_verified = true`,
                    [organizationIds],
                    'fetch-organization-email-members'
                )
                const emailsByOrganization: Record<string, Set<string>> = Object.fromEntries(
                    organizationIds.map((id) => [id, new Set<string>()])
                )
                for (const row of rows) {
                    emailsByOrganization[row.organization_id].add(row.email.trim().toLowerCase())
                }
                return Object.fromEntries(
                    Object.entries(emailsByOrganization).map(([id, emails]) => [id, { emails, expiresAt }])
                )
            },
        })
    }

    public async getOrganizationId(teamId: number): Promise<string> {
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
        return snapshot.organizationId
    }

    public async getBlockedRecipients(teamId: number, recipients: string[]): Promise<string[]> {
        const expiresAt = this.now() + MAX_SNAPSHOT_AGE_MS
        const organizationId = await this.getOrganizationId(teamId)
        let snapshot = await this.snapshots.get(organizationId)
        if (snapshot && this.now() >= snapshot.expiresAt && this.now() < expiresAt) {
            this.snapshots.markForRefresh(organizationId)
            snapshot = await this.snapshots.get(organizationId)
        }
        if (!snapshot) {
            throw new Error('Could not check organization members')
        }
        if (this.now() >= Math.min(expiresAt, snapshot.expiresAt)) {
            this.snapshots.markForRefresh(organizationId)
            throw new Error('The organization member check expired')
        }
        return recipients.filter((email) => !snapshot.emails.has(email.trim().toLowerCase()))
    }
}
