// PROTOTYPE (throwaway): a fake of the Cloudflare Domain Connect approval page, so the auto path is clickable.
import { LemonButton, LemonModal, LemonTag } from '@posthog/lemon-ui'

import cloudflareLogo from 'lib/components/DomainConnect/assets/cloudflare.svg'

import { SetupSimulation } from '../simulation'

export function CloudflareApprovalOverlay({ sim }: { sim: SetupSimulation }): JSX.Element {
    const { state, derived, actions } = sim
    return (
        <LemonModal
            isOpen={state.cloudflareOverlayOpen}
            onClose={actions.cancelCloudflareApproval}
            simple
            hideCloseButton
            width={520}
            zIndex="1168"
        >
            <div className="flex flex-col">
                <div className="flex items-center justify-between gap-2 px-5 py-3 border-b bg-[#fff5ed]">
                    <img src={cloudflareLogo} alt="Cloudflare" className="h-6" />
                    <LemonTag type="warning">Simulated approval page</LemonTag>
                </div>
                <div className="px-5 py-4 flex flex-col gap-3">
                    <h3 className="m-0 text-lg">PostHog wants to update DNS for {derived.sendingDomain}</h3>
                    <p className="m-0 text-secondary text-sm">
                        It will add {derived.records.length} records. Nothing else changes. You can remove them later
                        from the Cloudflare dashboard.
                    </p>
                    <ul className="m-0 pl-5 text-sm space-y-0.5 max-h-48 overflow-auto">
                        {derived.records.map((record) => (
                            <li key={record.name + record.type} className="truncate font-mono text-xs">
                                <span className="inline-block w-12 text-secondary">{record.type}</span>
                                {record.name}
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="flex justify-end gap-2 px-5 py-3 border-t">
                    <LemonButton type="secondary" onClick={actions.cancelCloudflareApproval}>
                        Cancel
                    </LemonButton>
                    <LemonButton
                        type="primary"
                        onClick={actions.approveCloudflare}
                        className="[&>span]:bg-[#f6821f] [&>span]:border-[#f6821f]"
                    >
                        Authorize
                    </LemonButton>
                </div>
            </div>
        </LemonModal>
    )
}
