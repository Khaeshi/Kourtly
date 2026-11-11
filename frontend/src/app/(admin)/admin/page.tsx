'use client';
import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import {
  askAnalytics,
  getPlayers,
  getQueue,
  OfflineUnavailableError,
  proxyFetch,
} from '@/lib/api';
import type { Player, Match } from '@/lib/api';
import { useCapabilities } from '@/lib/entitlements';
import { useConnectivity } from '@/lib/connectivity';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { Button, buttonClass } from '@/app/components/ui/Button';
import { StatusDot } from '@/app/components/ui/StatusDot';
import { AdminHeader } from '@/app/components/ui/AdminHeader';

// ── Types ─────────────────────────────────────────────────────────────────────

type Period = 'today' | 'week' | 'month' | 'year';

interface AnalyticsSummary {
  period: Period;
  timezone?: string;
  dateRange: { start: string; end: string };
  comparison?: {
    dateRange: { start: string; end: string };
    revenue: number;
    changePercent: number | null;
  };
  reservations: { total: number; confirmed: number; pending: number; cancelled: number; completed: number };
  billing: { totalRevenue: number; reservationRevenue: number; combinedRevenue: number; paidTabs: number; avgPerTab: number };
  tabs?: { open: { count: number; total: number }; unpaid: { count: number; total: number } };
  payments?: { online: number; counter: number; courtFees: number; items: number };
  players: { total: number; active: number };
  queue: { matchesPlayed: number };
  revenueByDay: { date: string; reservationRevenue: number; billingRevenue: number; total: number }[];
  courtUtilization: { court: number; bookings: number; hours: number }[];
  topItems: { itemId: string | null; name: string; quantity: number; revenue: number }[];
  peakHours: { hour: number; label: string; count: number }[];
  statusBreakdown: { status: string; count: number }[];
  bookingsByWeekdayHour?: { weekday: number; hour: number; count: number }[];
  todayUtilization?: { bookedHours: number; openHours: number; bookedShare: number };
  lowStockItems?: { itemId: string; name: string; stockOnHand: number; lowStockThreshold: number; soldToday: number }[];
  monthlyRevenueGoal?: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Today',
  week:  'This Week',
  month: 'This Month',
  year:  'This Year',
};

const STATUS_COLOR: Record<string, string> = {
  confirmed: '#1F8A7A',
  pending:   '#B8821A',
  cancelled: '#C4401F',
  completed: '#8A9A94',
};

const fmt  = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 0 })}`;
const fmtK = (n: number) => n >= 1000 ? `₱${(n / 1000).toFixed(1)}k` : `₱${n}`;

const quickActions = [
  { href: '/admin/players',     label: 'Add player'     },
  { href: '/admin/queue',       label: 'Open queue'     },
  { href: '/admin/queue',       label: 'Generate match' },
  { href: '/admin/billing',     label: 'Open billing'   },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#F4F0E6] border border-[#C9C3B3] rounded-lg px-3 py-2 shadow-[0_8px_20px_rgba(14,36,32,.18)] text-xs text-[#0E2420]">
      <p className="font-bold mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="ad-mono" style={{ color: p.color }}>
          {p.name}: {p.name.toLowerCase().includes('revenue') || p.name.toLowerCase().includes('billing') || p.name.toLowerCase().includes('reservation')
            ? fmt(p.value) : p.value}
        </p>
      ))}
    </div>
  );
}

function Chunk({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <p className="ad-eyebrow">{eyebrow}</p>
      <h2 className="font-display text-[1.75rem] mt-1 mb-4">{title}</h2>
      {children}
    </section>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <h3 className="text-base font-bold mb-2">{title}</h3>
      {children}
    </div>
  );
}

function Skeleton({ h }: { h: number }) {
  return <div aria-hidden="true" style={{ height: h }} className="bg-[#E1DBCB] rounded-md animate-pulse motion-reduce:animate-none" />;
}

function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="py-8">
      <p className="font-bold">{title}</p>
      <p className="ad-muted text-sm mt-0.5">{hint}</p>
    </div>
  );
}

const TICK = { fontSize: 11, fill: '#5B6B66', fontFamily: 'var(--font-jetbrains-mono), monospace' };

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
    const capabilities = useCapabilities();
  const { status } = useConnectivity();
  const offline = status !== 'online';
  const offlineTitle = offline ? 'Reconnect to make changes' : undefined;
  // ── Live counts (existing) ─────────────────────────────────────────────────
  const [playerCount, setPlayerCount] = useState<number | string>('—');
  const [matchCount,  setMatchCount]  = useState<number | string>('—');
  const [courtCount,  setCourtCount]  = useState<number | string>('—');

  // ── Analytics ─────────────────────────────────────────────────────────────
  const [period,  setPeriod]  = useState<Period>('week');
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError,   setAnalyticsError]   = useState('');
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  // Load live counts
  useEffect(() => {
    const load = async () => {
      if (capabilities.modules.queue) {
        const [players, queue]: [Player[], Match[]] = await Promise.all([getPlayers(), getQueue()]);
        setPlayerCount(players.length);
        setMatchCount(queue.length);
      }
    };
    void load().catch(error => {
      console.error('Could not load dashboard player and queue counts.', error);
      setPlayerCount('Not cached yet. Open this page once while online.');
      setMatchCount('Not cached yet. Open this page once while online.');
    });
  }, [capabilities.modules.queue]);

  useEffect(() => {
    void proxyFetch<{ courtCount?: number }>('/court/me')
      .then(court => setCourtCount(typeof court.courtCount === 'number' ? court.courtCount : '—'))
      .catch(error => {
        console.error('Could not load the court count.', error);
        setCourtCount(error instanceof OfflineUnavailableError
          ? 'Not cached yet. Open this page once while online.'
          : '—');
      });
  }, []);

  // Load analytics
  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    setAnalyticsError('');
    try {
      const result = await proxyFetch<AnalyticsSummary>(`/analytics/summary?period=${period}`);
      setAnalytics(result);
    } catch (error) {
      setAnalytics(null);
      setAnalyticsError(error instanceof OfflineUnavailableError ? 'Not cached yet. Open this page once while online.' :
        error instanceof Error ? error.message : 'Could not load analytics.');
    } finally {
      setAnalyticsLoading(false);
    }
  }, [period]);

  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);

  const onAskAnalytics = useCallback(async () => {
    if (offline) return;
    const question = aiQuestion.trim();
    if (!question) return;
    setAiLoading(true);
    setAiError('');
    try {
      const result = await askAnalytics(question, period);
      setAiAnswer(result.answer);
    } catch (err: any) {
      setAiError(err.message || 'AI unavailable — check the charts above.');
      setAiAnswer('');
    } finally {
      setAiLoading(false);
    }
  }, [aiQuestion, offline, period]);

  // ── Derived stat cards (merges live + analytics) ───────────────────────────
  const statCards = [
    { label: 'Players',        value: playerCount, sub: 'Registered' },
    { label: 'Active matches', value: matchCount,  sub: 'On court now', tone: 'text-[#1F8A7A]' },
    { label: 'Courts',         value: courtCount,  sub: 'Available' },
    {
      label: 'Revenue',
      value: analytics ? fmtK(analytics.billing.combinedRevenue) : '—',
      sub: PERIOD_LABELS[period].toLowerCase(),
    },
    {
      label: 'Reservations',
      value: analytics ? String(analytics.reservations.total) : '—',
      sub: `${analytics?.reservations.confirmed ?? 0} confirmed`,
    },
    {
      label: 'Avg tab',
      value: analytics ? fmtK(analytics.billing.avgPerTab) : '—',
      sub: `${analytics?.billing.paidTabs ?? 0} tabs paid`,
    },
  ];
  // The counts can hold a "not cached" sentence; show it once as a note instead of inside a big number.
  const countNote = [playerCount, matchCount, courtCount].find(v => typeof v === 'string' && v.length > 1) as string | undefined;
  const bigValue = (v: number | string) => (typeof v === 'string' && v.length > 6 ? '—' : v);

  // ── Chart data ─────────────────────────────────────────────────────────────
  const revenueChart = (analytics?.revenueByDay ?? []).map(d => ({
    ...d,
    label: period === 'year'
      ? format(parseISO(d.date), 'MMM')
      : format(parseISO(d.date), 'MMM d'),
  }));

  // Aggregate by month for year view
  const chartData = period === 'year'
    ? Object.values(
        revenueChart.reduce((acc, d) => {
          const key = d.label;
          if (!acc[key]) acc[key] = { label: key, reservationRevenue: 0, billingRevenue: 0, total: 0 };
          acc[key].reservationRevenue += d.reservationRevenue;
          acc[key].billingRevenue     += d.billingRevenue;
          acc[key].total              += d.total;
          return acc;
        }, {} as Record<string, any>)
      )
    : revenueChart;

  const pieData = (analytics?.statusBreakdown ?? [])
    .filter(s => s.count > 0)
    .map(s => ({
      name:  s.status.charAt(0).toUpperCase() + s.status.slice(1),
      value: s.count,
      color: STATUS_COLOR[s.status] ?? '#8A9A94',
    }));

  const courts = analytics?.courtUtilization ?? [];
  const maxHours = Math.max(1, ...courts.map(c => c.hours));
  const peak = analytics?.peakHours ?? [];
  const peakMax = Math.max(0, ...peak.map(h => h.count));
  const busiest = peakMax > 0 ? peak.find(h => h.count === peakMax) : undefined;
  const awaiting = analytics?.reservations.pending ?? 0;
  const allowed = (href: string) => {
    if (href.includes('queue') || href.includes('players')) return capabilities.modules.queue;
    if (href.includes('billing')) return capabilities.modules.item_tabs;
    return true;
  };

  return (
    <div className="w-full">
      {analyticsError && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {analyticsError}
        </p>
      )}

      {/* ── Header ── */}
      <AdminHeader title="Dashboard" right={
        <div className="flex gap-2 flex-wrap">
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}
              className={`filter-btn${period === p ? ' active' : ''}`}>
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      } />
      <p className="ad-muted text-sm -mt-3 mb-6">Welcome back, Admin</p>

      {/* ── Key figures ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-[#C9C3B3] border-y border-[#C9C3B3]">
        {statCards.map(s => (
          <div key={s.label} className="bg-[#F4F0E6] px-4 py-3">
            <p className="ad-eyebrow mb-1">{s.label}</p>
            <p className={`ad-mono text-[clamp(1.25rem,2.6vw,1.9rem)] font-bold leading-none ${s.tone ?? ''}`}>{bigValue(s.value)}</p>
            <p className="ad-muted text-xs mt-1.5">{s.sub}</p>
          </div>
        ))}
      </div>
      {countNote && <p className="ad-muted text-sm mt-3">{countNote}</p>}

      {/* ── Needs attention ── */}
      <Chunk eyebrow="Right now" title="Needs attention">
        {analyticsLoading ? (
          <Skeleton h={48} />
        ) : !analytics ? (
          <p className="ad-muted text-sm">This could not be checked right now.</p>
        ) : awaiting > 0 ? (
          <div className="flex items-center justify-between gap-3 flex-wrap border-y border-[#E1DBCB] py-3">
            <StatusDot tone="wait">
              <b>{awaiting} reservation{awaiting !== 1 ? 's' : ''} awaiting payment</b>
              <span className="ad-muted"> · {PERIOD_LABELS[period].toLowerCase()}</span>
            </StatusDot>
            <Link href="/admin/reservation" className={buttonClass('ghost')}>Review</Link>
          </div>
        ) : (
          <StatusDot tone="ok">All clear. Nothing is waiting on you.</StatusDot>
        )}
      </Chunk>

      {/* ── Revenue ── */}
      <Chunk eyebrow="Money" title={`Revenue · ${PERIOD_LABELS[period]}`}>
        {analytics && (
          <div className="flex gap-6 flex-wrap mb-3">
            {[
              { label: 'Reservation', color: '#0E2420', value: analytics.billing.reservationRevenue },
              { label: 'Billing',     color: '#1F8A7A', value: analytics.billing.totalRevenue },
            ].map(l => (
              <div key={l.label}>
                <p className="flex items-center gap-1.5 text-xs ad-muted">
                  <span aria-hidden="true" className="w-2.5 h-2.5 rounded-sm" style={{ background: l.color }} />{l.label}
                </p>
                <p className="ad-mono text-lg font-bold">{fmt(l.value)}</p>
              </div>
            ))}
            <div>
              <p className="text-xs ad-muted">Previous period</p>
              <p className="ad-mono text-lg font-bold">{fmt(analytics.comparison?.revenue ?? 0)}</p>
              <p className="ad-muted text-xs">
                {analytics.comparison?.changePercent == null
                  ? 'No previous-period revenue'
                  : `${analytics.comparison.changePercent >= 0 ? '+' : ''}${analytics.comparison.changePercent}% vs previous`}
              </p>
            </div>
          </div>
        )}

        {analyticsLoading ? (
          <Skeleton h={200} />
        ) : analyticsError ? (
          <Empty title="Revenue is unavailable." hint={analyticsError} />
        ) : chartData.every(d => d.total === 0) ? (
          <Empty title="No revenue yet." hint="Paid reservations and tabs for this period will show here." />
        ) : (
          <div role="img" aria-label={`Revenue ${PERIOD_LABELS[period].toLowerCase()}: reservations ${fmt(analytics?.billing.reservationRevenue ?? 0)}, billing ${fmt(analytics?.billing.totalRevenue ?? 0)}`}>
            <ResponsiveContainer width="100%" height={210}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E1DBCB" vertical={false} />
                <XAxis dataKey="label" tick={TICK} axisLine={false} tickLine={false} />
                <YAxis tick={TICK} axisLine={false} tickLine={false} tickFormatter={v => fmtK(v)} width={52} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="reservationRevenue" name="Reservation Revenue"
                  stroke="#0E2420" strokeWidth={2} fill="#0E2420" fillOpacity={0.1} />
                <Area type="monotone" dataKey="billingRevenue" name="Billing Revenue"
                  stroke="#1F8A7A" strokeWidth={2} fill="#1F8A7A" fillOpacity={0.12} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Chunk>

      <Chunk eyebrow="Operations" title="Tabs and payments">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Open tabs', value: analytics ? `${analytics.tabs?.open.count ?? 0} · ${fmt(analytics.tabs?.open.total ?? 0)}` : '—' },
            { label: 'Unpaid tabs', value: analytics ? `${analytics.tabs?.unpaid.count ?? 0} · ${fmt(analytics.tabs?.unpaid.total ?? 0)}` : '—' },
            { label: 'Online payments', value: analytics ? fmt(analytics.payments?.online ?? 0) : '—' },
            { label: 'Counter payments', value: analytics ? fmt(analytics.payments?.counter ?? 0) : '—' },
            { label: 'Court fees', value: analytics ? fmt(analytics.payments?.courtFees ?? 0) : '—' },
            { label: 'Items', value: analytics ? fmt(analytics.payments?.items ?? 0) : '—' },
            {
              label: 'Today booked share',
              value: analytics
                ? `${Math.round((analytics.todayUtilization?.bookedShare ?? 0) * 100)}%`
                : '—',
            },
            {
              label: 'Monthly goal',
              value: analytics?.monthlyRevenueGoal ? fmt(analytics.monthlyRevenueGoal) : 'Not set',
            },
          ].map(card => (
            <div key={card.label} className="border-y border-[#E1DBCB] py-3">
              <p className="ad-eyebrow">{card.label}</p>
              <p className="ad-mono mt-1 text-lg font-bold">{card.value}</p>
              {card.label === 'Today booked share' && analytics && (
                <p className="ad-muted text-xs">
                  {analytics.todayUtilization?.bookedHours ?? 0}h / {analytics.todayUtilization?.openHours ?? 0}h open
                </p>
              )}
            </div>
          ))}
        </div>
      </Chunk>

      {/* ── Busy times ── */}
      <Chunk eyebrow="Busy times" title="When people play">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          <Block title="Peak booking hours">
            {analyticsLoading ? (
              <Skeleton h={170} />
            ) : peakMax === 0 ? (
              <Empty title="No bookings yet." hint="Booked hours for this period will show here." />
            ) : (
              <>
                <div role="img" aria-label={`Bookings by hour. Busiest: ${busiest?.label}, ${peakMax} bookings.`}>
                  <ResponsiveContainer width="100%" height={170}>
                    <BarChart data={peak} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E1DBCB" vertical={false} />
                      <XAxis dataKey="label" tick={{ ...TICK, fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={TICK} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="count" name="Bookings" radius={[3, 3, 0, 0]}>
                        {peak.map((h, i) => <Cell key={i} fill={h.count === peakMax ? '#0E2420' : '#1F8A7A'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {busiest && <p className="ad-muted text-sm mt-2">Busiest hour: <b className="text-[#0E2420]">{busiest.label}</b> with {peakMax} booking{peakMax !== 1 ? 's' : ''}.</p>}
              </>
            )}
          </Block>

          <Block title="Court hours">
            {analyticsLoading ? (
              <Skeleton h={170} />
            ) : courts.length === 0 ? (
              <Empty title="No court activity yet." hint="Hours booked per court will show here." />
            ) : (
              courts.map(c => (
                <div key={c.court} className="flex items-center gap-3 py-2.5 border-b border-[#E1DBCB]">
                  <span className="w-16 text-sm font-medium shrink-0">Court {c.court}</span>
                  <span className="flex-1 h-2.5 bg-[#E1DBCB] rounded-sm overflow-hidden" aria-hidden="true">
                    <i className="block h-full bg-[#0E2420]" style={{ width: `${(c.hours / maxHours) * 100}%` }} />
                  </span>
                  <span className="ad-mono text-sm font-bold w-10 text-right shrink-0">{c.hours}h</span>
                  <span className="ad-muted text-xs w-20 text-right shrink-0">{c.bookings} booking{c.bookings !== 1 ? 's' : ''}</span>
                </div>
              ))
            )}
          </Block>
        </div>
      </Chunk>

      <Chunk eyebrow="Booking pattern" title="Bookings by weekday and hour">
        {analyticsLoading ? (
          <Skeleton h={120} />
        ) : !analytics?.bookingsByWeekdayHour?.length ? (
          <Empty title="No booked slots in this period." hint="Confirmed and completed reservations appear here." />
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, weekday) => {
              const rows = (analytics.bookingsByWeekdayHour ?? []).filter(item => item.weekday === weekday);
              return (
                <div key={day} className="border-t border-[#C9C3B3] py-2">
                  <p className="ad-eyebrow">{day}</p>
                  {rows.length ? rows.sort((a, b) => b.count - a.count).slice(0, 3).map(row => (
                    <p key={row.hour} className="ad-mono mt-1 text-xs">
                      {`${String(row.hour).padStart(2, '0')}:00`} · {row.count}
                    </p>
                  )) : <p className="ad-muted mt-1 text-xs">No bookings</p>}
                </div>
              );
            })}
          </div>
        )}
      </Chunk>

      <Chunk eyebrow="Inventory" title="Low stock">
        {analyticsLoading ? (
          <Skeleton h={80} />
        ) : !analytics?.lowStockItems?.length ? (
          <Empty title="No low-stock items." hint="Tracked active items at or below their threshold appear here." />
        ) : (
          analytics.lowStockItems.map(item => (
            <div key={item.itemId} className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E1DBCB] py-2.5">
              <b>{item.name}</b>
              <span className="ad-mono text-sm">
                {item.stockOnHand} left · threshold {item.lowStockThreshold} · sold today {item.soldToday}
              </span>
            </div>
          ))
        )}
      </Chunk>

      {/* ── Reservations and items ── */}
      <Chunk eyebrow="Reservations and items" title="How bookings end up">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          <Block title="Reservation status">
            {analyticsLoading ? (
              <Skeleton h={150} />
            ) : pieData.length === 0 ? (
              <Empty title="No reservations yet." hint="Outcomes for this period will show here." />
            ) : (
              <div className="flex items-center gap-5 flex-wrap">
                <div role="img" aria-label={`Reservation status: ${pieData.map(d => `${d.name} ${d.value}`).join(', ')}`}>
                  <ResponsiveContainer width={140} height={140}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65}
                        dataKey="value" paddingAngle={2} stroke="none">
                        {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip formatter={(value, name) => [value, name]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 min-w-[180px]">
                  {pieData.map(d => (
                    <div key={d.name} className="flex items-center justify-between py-2 border-b border-[#E1DBCB]">
                      <span className="flex items-center gap-2 text-sm">
                        <span aria-hidden="true" className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />{d.name}
                      </span>
                      <span className="ad-mono text-sm">
                        <b>{d.value}</b>
                        <span className="ad-muted text-xs"> ({analytics && analytics.reservations.total > 0
                          ? Math.round(d.value / analytics.reservations.total * 100)
                          : 0}%)</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Block>

          <Block title="Top billing items">
            {analyticsLoading ? (
              <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} h={34} />)}</div>
            ) : (analytics?.topItems ?? []).length === 0 ? (
              <Empty title="No billing sales yet." hint="Items charged to tabs rank here." />
            ) : (
              (analytics?.topItems ?? []).slice(0, 6).map((item, i) => {
                const maxRevenue = analytics!.topItems[0].revenue;
                const pct = maxRevenue > 0 ? (item.revenue / maxRevenue) * 100 : 0;
                return (
                  <div key={item.name} className="flex items-center gap-3 py-2.5 border-b border-[#E1DBCB]">
                    <span className="ad-mono ad-muted text-xs w-4 shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <div className="mt-1 h-1.5 bg-[#E1DBCB] rounded-sm overflow-hidden" aria-hidden="true">
                        <div className="h-full bg-[#1F8A7A]" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="ad-mono text-sm font-bold">{fmt(item.revenue)}</p>
                      <p className="ad-muted text-xs">×{item.quantity}</p>
                    </div>
                  </div>
                );
              })
            )}
          </Block>
        </div>
      </Chunk>

      {/* ── Ask analytics + quick actions ── */}
      <section className="mt-12 border-t border-[#C9C3B3] pt-6">
        <h2 className="text-[17px] font-bold mb-3">Ask analytics</h2>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label htmlFor="db-ask" className="ad-label">Ask about your court data</label>
            <input
              id="db-ask"
              value={aiQuestion}
              onChange={(e) => setAiQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !aiLoading && !offline) onAskAnalytics(); }}
              placeholder="Which hour is busiest on Fridays?"
              className="ad-input"
            />
          </div>
          <Button v="primary" onClick={onAskAnalytics} loading={aiLoading} disabled={!aiQuestion.trim() || offline} title={offlineTitle}>
            {aiLoading ? 'Asking...' : 'Ask'}
          </Button>
        </div>
        <div aria-live="polite">
          {aiError && <p className="ad-error">{aiError}</p>}
          {aiAnswer && (
            <div className="mt-3 rounded-md bg-[#EDE8D8] p-4">
              <p className="ad-eyebrow mb-1">Powered by AI</p>
              <p className="text-sm leading-relaxed">{aiAnswer}</p>
            </div>
          )}
        </div>

        <h2 className="text-[17px] font-bold mt-8 mb-3">Quick actions</h2>
        <div className="flex gap-2 flex-wrap">
          {quickActions.filter(a => allowed(a.href)).map(a => (
            <Link key={a.label} href={a.href} className={buttonClass('ghost')}>{a.label}</Link>
          ))}
        </div>
      </section>

    </div>
  );
}
