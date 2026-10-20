import { useValues } from 'kea'

import { DnsRecordsSummary } from '../components/DnsRecordsSummary'
import { FirstSenderCard } from '../components/FirstSenderCard'
import { NextWorkflowCard } from '../components/NextWorkflowCard'
import { StepHeading } from '../components/StepHeading'
import { emailDomainAutoConfigureLogic } from '../emailDomainAutoConfigureLogic'
import { emailDomainSenderLogic } from '../emailDomainSenderLogic'
import { emailDomainStatusLogic } from '../emailDomainStatusLogic'
import { HedgehogRocket } from '../hoggies'

export function ReadyStep(): JSX.Element {
    const { domain } = useValues(emailDomainSenderLogic)
    const { records, foundCount, allRecordsFound } = useValues(emailDomainStatusLogic)
    const { hostName } = useValues(emailDomainAutoConfigureLogic)
    const host = hostName ?? 'your DNS host'
    return (
        <div className="flex flex-col gap-8">
            <div className="rounded-xl border border-success bg-success-highlight p-6 @md:p-8">
                <StepHeading
                    Hoggie={HedgehogRocket}
                    title={
                        <>
                            You can send from <span className="font-mono break-all">{domain}</span>
                        </>
                    }
                    lead={
                        allRecordsFound
                            ? `All ${records.length} settings are in place. Inboxes now know these emails really come from you.`
                            : `The email provider verified this domain. ${foundCount} of ${records.length} settings are in place, so add the rest at ${host}.`
                    }
                />
            </div>
            <FirstSenderCard />
            <DnsRecordsSummary
                missing={records.filter((record) => record.status === 'pending')}
                needsAttention={!allRecordsFound}
            />
            <NextWorkflowCard />
        </div>
    )
}
