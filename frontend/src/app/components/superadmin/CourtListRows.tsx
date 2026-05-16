'use client';

export const STATUS_STYLES: Record<string, string> = {
  active:    'text-green-700 bg-green-50 border-green-200',
  trial:     'text-amber-700 bg-amber-50 border-amber-200',
  expired:   'text-red-600 bg-red-50 border-red-200',
  suspended: 'text-gray-500 bg-gray-100 border-gray-200',
};

export interface SuperAdminCourtRow {
  _id: string;
  name: string;
  slug: string;
  adminEmail: string;
  courtCount: number;
  subscription: { status: string; plan: string; amount: number };
}

export interface CourtActionsProps {
  court: SuperAdminCourtRow;
  acting: string | null;
  onActivate: (court: SuperAdminCourtRow) => void;
  onExtendTrial: (courtId: string) => void;
  onSuspend: (court: SuperAdminCourtRow) => void;
  onReactivate: (court: SuperAdminCourtRow) => void;
  onEndSubscription: (court: SuperAdminCourtRow) => void;
}

function ActionBtn({
  label,
  busy,
  variant,
  onClick,
}: {
  label: string;
  busy: boolean;
  variant: 'green' | 'red' | 'amber' | 'gray';
  onClick: () => void;
}) {
  const styles = {
    green: 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100',
    red:   'border-red-200 bg-red-50 text-red-600 hover:bg-red-100',
    amber: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
    gray:  'border-gray-300 bg-gray-100 text-gray-700 hover:bg-gray-200',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`px-2.5 py-1 rounded-md text-[0.68rem] font-medium border cursor-pointer transition-all disabled:opacity-50 ${styles[variant]}`}
    >
      {busy ? '...' : label}
    </button>
  );
}

export function CourtSubscriptionActions(props: CourtActionsProps) {
  const { court, acting, onActivate, onExtendTrial, onSuspend, onReactivate, onEndSubscription } = props;
  const busy = acting === court._id;
  const st = court.subscription.status;

  return (
    <div className="flex gap-1.5 flex-wrap">
      {st === 'trial' && (
        <>
          <ActionBtn label="Activate" busy={busy} variant="green" onClick={() => onActivate(court)} />
          <ActionBtn label="+7 days" busy={busy} variant="amber" onClick={() => onExtendTrial(court._id)} />
        </>
      )}
      {st === 'active' && (
        <ActionBtn label="Suspend" busy={busy} variant="red" onClick={() => onSuspend(court)} />
      )}
      {(st === 'suspended' || st === 'expired') && (
        <ActionBtn label="Reactivate" busy={busy} variant="green" onClick={() => onReactivate(court)} />
      )}
      {(st === 'trial' || st === 'active' || st === 'suspended') && (
        <ActionBtn label="End subscription" busy={busy} variant="gray" onClick={() => onEndSubscription(court)} />
      )}
    </div>
  );
}

interface CourtListRowsProps extends Omit<CourtActionsProps, 'court'> {
  courts: SuperAdminCourtRow[];
  emptyMessage?: string;
  /** mobile = cards only, desktop = table only, all = responsive both */
  mode?: 'all' | 'mobile' | 'desktop';
}

export function CourtListRows({
  courts,
  acting,
  onActivate,
  onExtendTrial,
  onSuspend,
  onReactivate,
  onEndSubscription,
  emptyMessage = 'No courts found.',
  mode = 'all',
}: CourtListRowsProps) {
  if (courts.length === 0) {
    return <div className="py-12 text-center text-gray-400 text-sm">{emptyMessage}</div>;
  }

  const showMobile = mode === 'all' || mode === 'mobile';
  const showDesktop = mode === 'all' || mode === 'desktop';

  return (
    <>
      {showMobile && (
      <div className="md:hidden flex flex-col divide-y divide-gray-100">
        {courts.map((court) => (
          <div key={court._id} className="px-4 py-4 space-y-3">
            <div className="min-w-0">
              <p className="text-[0.9rem] font-semibold text-gray-900">{court.name}</p>
              <p className="text-[0.68rem] text-gray-400 font-mono">/{court.slug}</p>
              <p className="text-[0.72rem] text-gray-500 mt-1 break-all">{court.adminEmail}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-[0.62rem] font-semibold uppercase px-2 py-0.5 rounded-[3px] border ${STATUS_STYLES[court.subscription.status]}`}>
                {court.subscription.status}
              </span>
              <span className="text-[0.65rem] text-gray-400 font-mono">
                ₱{court.subscription.amount.toLocaleString()}/{court.subscription.plan === 'annual' ? 'yr' : 'mo'}
              </span>
              <span className="text-[0.65rem] text-gray-500">{court.courtCount} courts</span>
            </div>
            <CourtSubscriptionActions
              court={court}
              acting={acting}
              onActivate={onActivate}
              onExtendTrial={onExtendTrial}
              onSuspend={onSuspend}
              onReactivate={onReactivate}
              onEndSubscription={onEndSubscription}
            />
          </div>
        ))}
      </div>
      )}

      {showDesktop && (
      <div className="hidden md:block overflow-x-auto">
        <div className="min-w-[720px]">
          <div
            className="grid px-5 py-2.5 border-b border-gray-100 bg-gray-50 text-[0.65rem] font-semibold tracking-[0.08em] uppercase text-gray-400"
            style={{ gridTemplateColumns: '1fr 140px 110px 70px 220px' }}
          >
            <span>Court</span><span>Admin</span><span>Plan</span><span>Courts</span><span>Actions</span>
          </div>
          {courts.map((court, i) => (
            <div
              key={court._id}
              className="grid items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors"
              style={{
                gridTemplateColumns: '1fr 140px 110px 70px 220px',
                borderBottom: i < courts.length - 1 ? '1px solid #f9fafb' : 'none',
              }}
            >
              <div className="min-w-0">
                <div className="text-[0.85rem] font-medium text-gray-900 truncate">{court.name}</div>
                <div className="text-[0.68rem] text-gray-400 font-mono">/{court.slug}</div>
              </div>
              <div className="text-[0.72rem] text-gray-500 truncate">{court.adminEmail}</div>
              <div className="flex flex-col gap-1">
                <span className={`text-[0.62rem] font-semibold uppercase px-2 py-0.5 rounded-[3px] border w-fit ${STATUS_STYLES[court.subscription.status]}`}>
                  {court.subscription.status}
                </span>
                <span className="text-[0.65rem] text-gray-400 font-mono">
                  ₱{court.subscription.amount.toLocaleString()}/{court.subscription.plan === 'annual' ? 'yr' : 'mo'}
                </span>
              </div>
              <div className="text-[0.82rem] font-mono text-gray-700">{court.courtCount}</div>
              <CourtSubscriptionActions
                court={court}
                acting={acting}
                onActivate={onActivate}
                onExtendTrial={onExtendTrial}
                onSuspend={onSuspend}
                onReactivate={onReactivate}
                onEndSubscription={onEndSubscription}
              />
            </div>
          ))}
        </div>
      </div>
      )}
    </>
  );
}
