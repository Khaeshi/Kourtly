'use client';
import Link from 'next/link';
import { Users, Swords, Building2, TrendingUp, Calendar, ShoppingBag, PiggyBank, Package } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { askAnalytics, getPlayers, getQueue } from '@/lib/api';
import { API_BASE } from '@/lib/config';
import type { Player, Match } from '@/lib/api';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

// ── Types ─────────────────────────────────────────────────────────────────────

type Period = 'today' | 'week' | 'month' | 'year';

interface AnalyticsSummary {
  period: Period;
  dateRange: { start: string; end: string };
  reservations: { total: number; confirmed: number; pending: number; cancelled: number; completed: number };
  billing: {
    totalRevenue: number;
    reservationRevenue: number;
    combinedRevenue: number;
    paidTabs: number;
    avgPerTab: number;
    totalCOGS?: number;
    grossProfit?: number;
    cashTabRevenue?: number;
    playerTabRevenue?: number;
  };
  players: { total: number; active: number };
  queue: { matchesPlayed: number };
  revenueByDay: { date: string; reservationRevenue: number; billingRevenue: number; total: number }[];
  courtUtilization: { court: number; bookings: number; hours: number }[];
  topItems: { name: string; quantity: number; revenue: number; cost?: number; grossProfit?: number }[];
  peakHours: { hour: number; label: string; count: number }[];
  statusBreakdown: { status: string; count: number }[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Today',
  week:  'This Week',
  month: 'This Month',
  year:  'This Year',
};

const STATUS_COLOR: Record<string, string> = {
  confirmed: '#16a34a',
  pending:   '#d97706',
  cancelled: '#ef4444',
  completed: '#6b7280',
};

const COURT_COLORS = ['#16a34a', '#0891b2', '#7c3aed', '#d97706'];

const fmt  = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 0 })}`;
const fmtK = (n: number) => n >= 1000 ? `₱${(n / 1000).toFixed(1)}k` : `₱${n}`;

const quickActions = [
  { href: '/admin/players',     label: 'Add Player'     },
  { href: '/admin/queue',       label: 'Queue'          },
  { href: '/admin/queue',       label: 'Generate Match' },
  { href: '/admin/billing',     label: 'Billing'        },
];

const navLinks = [
  { href: '/admin/players',     label: 'Players',     desc: 'Manage registered players and skill levels'  },
  { href: '/admin/queue',       label: 'Queue',       desc: 'Live court queue and match generator'        },
  { href: '/admin/billing',     label: 'Billing',     desc: 'Per-player tabs for drinks and shuttlecocks' },
  { href: '/admin/reservation', label: 'Reservations',desc: 'Manage court bookings and confirmations'     },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {p.name.toLowerCase().includes('revenue') || p.name.toLowerCase().includes('billing') || p.name.toLowerCase().includes('reservation')
            || p.name.toLowerCase().includes('profit') || p.name.toLowerCase().includes('cogs')
            ? fmt(p.value) : p.value}
        </p>
      ))}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-[0.65rem] font-semibold tracking-widest uppercase text-gray-400 mb-3">{children}</p>;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  // ── Live counts (existing) ─────────────────────────────────────────────────
  const [playerCount, setPlayerCount] = useState<number | string>('—');
  const [matchCount,  setMatchCount]  = useState<number | string>('—');

  // ── Analytics ─────────────────────────────────────────────────────────────
  const [period,  setPeriod]  = useState<Period>('week');
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError,   setAnalyticsError]   = useState('');
  const [payoutTransfers, setPayoutTransfers] = useState<any[]>([]);
  const [payoutStatusFilter, setPayoutStatusFilter] = useState<'all' | 'queued' | 'succeeded' | 'failed'>('all');
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  // Load live counts
  useEffect(() => {
    const load = async () => {
      const [players, queue]: [Player[], Match[]] = await Promise.all([getPlayers(), getQueue()]);
      setPlayerCount(players.length);
      setMatchCount(queue.length);
    };
    load();
  }, []);

  // Load analytics
  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    setAnalyticsError('');
    try {
      const res = await fetch(`${API_BASE}/analytics/summary?period=${period}`);
      if (!res.ok) throw new Error('Failed to load analytics');
      setAnalytics(await res.json());
    } catch (e: any) {
      setAnalyticsError(e.message);
    } finally {
      setAnalyticsLoading(false);
    }
  }, [period]);

  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);

  const loadPayoutTransfers = useCallback(() => {
    fetch(`/api/proxy/payout-transfers?limit=10&status=${payoutStatusFilter}`)
      .then(r => r.json())
      .then(setPayoutTransfers)
      .catch(() => setPayoutTransfers([]));
  }, [payoutStatusFilter]);

  useEffect(() => {
    loadPayoutTransfers();
  }, [loadPayoutTransfers]);

  const onAskAnalytics = useCallback(async () => {
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
  }, [aiQuestion, period]);

  // ── Derived stat cards (merges live + analytics) ───────────────────────────
  const statCards = [
    {
      label: 'Total Players', value: playerCount,
      sub: 'Registered', color: '#7c3aed', icon: Users,
    },
    {
      label: 'Active Matches', value: matchCount,
      sub: 'On court now', color: '#0ea5e9', icon: Swords,
    },
    {
      label: 'Courts', value: '4',
      sub: 'Available', color: '#10b981', icon: Building2,
    },
    {
      label: 'Revenue',
      value: analytics ? fmtK(analytics.billing.combinedRevenue) : '—',
      sub: PERIOD_LABELS[period].toLowerCase(), color: '#d97706', icon: TrendingUp,
    },
    {
      label: 'Gross profit',
      value: analytics ? fmtK(analytics.billing.grossProfit ?? 0) : '—',
      sub: 'POS after COGS', color: '#059669', icon: PiggyBank,
    },
    {
      label: 'COGS',
      value: analytics ? fmtK(analytics.billing.totalCOGS ?? 0) : '—',
      sub: 'Catalog cost on sold lines', color: '#64748b', icon: Package,
    },
    {
      label: 'Reservations',
      value: analytics ? String(analytics.reservations.total) : '—',
      sub: `${analytics?.reservations.confirmed ?? 0} confirmed`, color: '#16a34a', icon: Calendar,
    },
    {
      label: 'Avg Tab',
      value: analytics ? fmtK(analytics.billing.avgPerTab) : '—',
      sub: `${analytics?.billing.paidTabs ?? 0} tabs paid`, color: '#0891b2', icon: ShoppingBag,
    },
  ];

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
      color: STATUS_COLOR[s.status] ?? '#9ca3af',
    }));

  return (
    <div className="w-full font-sans">

      {/* ── Header ── */}
      <div className="mb-7 flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Welcome back, Admin</p>
        </div>
        {/* Period selector */}
        <div className="flex gap-1 flex-wrap">
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                period === p
                  ? 'bg-gray-900 border-gray-900 text-white'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
              }`}>
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Stat cards (live + analytics incl. profit) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
        {statCards.map(s => (
          <div key={s.label} className="stat-card">
            <div className="flex items-start justify-between w-full">
              <div>
                <p className="text-[0.65rem] font-medium text-gray-500 mb-1.5">{s.label}</p>
                <p className="text-xl font-bold text-gray-900 leading-none mb-1 font-mono">{s.value}</p>
                <p className="text-[0.65rem] text-gray-400">{s.sub}</p>
              </div>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${s.color}15` }}>
                <s.icon size={14} color={s.color} strokeWidth={1.75} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Revenue chart ── */}
      <div className="bg-white border border-gray-200 rounded-xl px-5 py-5 mb-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <SectionTitle>Revenue — {PERIOD_LABELS[period]}</SectionTitle>
          {analytics && (
            <div className="flex gap-4">
              {[
                { label: 'Reservation', color: '#16a34a', value: analytics.billing.reservationRevenue },
                { label: 'Billing',     color: '#0891b2', value: analytics.billing.totalRevenue },
              ].map(l => (
                <div key={l.label} className="text-right">
                  <div className="flex items-center gap-1.5 justify-end mb-0.5">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ background: l.color }} />
                    <span className="text-[0.65rem] text-gray-400">{l.label}</span>
                  </div>
                  <span className="font-mono text-sm font-semibold text-gray-700">{fmt(l.value)}</span>
                </div>
              ))}
            </div>
          )}
          {analytics && typeof analytics.billing.cashTabRevenue === 'number' && (
            <p className="text-[0.65rem] text-gray-400 mt-2 text-right w-full">
              POS tabs: cash {fmt(analytics.billing.cashTabRevenue)} · player {fmt(analytics.billing.playerTabRevenue ?? 0)}
            </p>
          )}
        </div>

        {analyticsLoading ? (
          <div className="h-48 bg-gray-50 rounded-lg animate-pulse" />
        ) : analyticsError ? (
          <div className="h-48 flex items-center justify-center text-gray-400 text-sm">{analyticsError}</div>
        ) : chartData.every(d => d.total === 0) ? (
          <div className="h-48 flex items-center justify-center text-gray-300 text-sm">No revenue data for this period</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={190}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="resGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#16a34a" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#16a34a" stopOpacity={0}    />
                  </linearGradient>
                  <linearGradient id="bilGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#0891b2" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#0891b2" stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false}
                  tickFormatter={v => fmtK(v)} width={48} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="reservationRevenue" name="Reservation Revenue"
                  stroke="#16a34a" strokeWidth={2} fill="url(#resGrad)" />
                <Area type="monotone" dataKey="billingRevenue" name="Billing Revenue"
                  stroke="#0891b2" strokeWidth={2} fill="url(#bilGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </>
        )}
      </div>

      {/* ── Court utilization + Status breakdown ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

        {/* Court utilization */}
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-5">
          <SectionTitle>Court Utilization</SectionTitle>
          {analyticsLoading ? (
            <div className="h-40 bg-gray-50 rounded-lg animate-pulse" />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={analytics?.courtUtilization ?? []} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="court" tickFormatter={v => `Court ${v}`}
                    tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="bookings" name="Bookings" radius={[4, 4, 0, 0]}>
                    {(analytics?.courtUtilization ?? []).map((_, i) => (
                      <Cell key={i} fill={COURT_COLORS[i % COURT_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-gray-50">
                {(analytics?.courtUtilization ?? []).map((c, i) => (
                  <div key={c.court} className="text-center">
                    <p className="font-mono text-sm font-bold" style={{ color: COURT_COLORS[i] }}>{c.hours}h</p>
                    <p className="text-[0.6rem] text-gray-400 tracking-widest uppercase">Court {c.court}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Reservation status */}
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-5">
          <SectionTitle>Reservation Status</SectionTitle>
          {analyticsLoading ? (
            <div className="h-40 bg-gray-50 rounded-lg animate-pulse" />
          ) : pieData.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-gray-300 text-sm">No reservations this period</div>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65}
                    dataKey="value" paddingAngle={3}>
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name) => [value, name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {pieData.map(d => (
                  <div key={d.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: d.color }} />
                      <span className="text-xs text-gray-600">{d.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-sm font-semibold text-gray-800">{d.value}</span>
                      <span className="text-[0.65rem] text-gray-400">
                        ({analytics && analytics.reservations.total > 0
                          ? Math.round(d.value / analytics.reservations.total * 100)
                          : 0}%)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Peak hours + Top items ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

        {/* Peak hours */}
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-5">
          <SectionTitle>Peak Booking Hours</SectionTitle>
          {analyticsLoading ? (
            <div className="h-36 bg-gray-50 rounded-lg animate-pulse" />
          ) : (analytics?.peakHours ?? []).every(h => h.count === 0) ? (
            <div className="h-36 flex items-center justify-center text-gray-300 text-sm">No bookings this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={analytics?.peakHours ?? []} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name="Bookings" fill="#16a34a" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top billing items */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <SectionTitle>Top Billing Items</SectionTitle>
          </div>
          {analyticsLoading ? (
            <div className="p-5 space-y-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}
            </div>
          ) : (analytics?.topItems ?? []).length === 0 ? (
            <div className="p-10 text-center text-gray-300 text-sm">No billing data this period</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {(analytics?.topItems ?? []).slice(0, 6).map((item, i) => {
                const maxRevenue = analytics!.topItems[0].revenue;
                const pct = maxRevenue > 0 ? (item.revenue / maxRevenue) * 100 : 0;
                return (
                  <div key={item.name} className="px-5 py-3 flex items-center gap-3">
                    <span className="font-mono text-[0.65rem] text-gray-300 w-4 shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-700 truncate">{item.name}</p>
                      <div className="mt-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-green-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-xs font-semibold text-gray-800">{fmt(item.revenue)}</p>
                      <p className="text-[0.6rem] text-gray-400">×{item.quantity}</p>
                      <p
                        className="text-[0.6rem] text-emerald-600 font-medium"
                        title={typeof item.cost === 'number' ? `COGS ${fmt(item.cost)}` : undefined}
                      >
                        GP {fmt(item.grossProfit ?? 0)}
                        {item.revenue > 0
                          ? ` · ${Math.round(((item.grossProfit ?? 0) / item.revenue) * 100)}% margin`
                          : ''}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Quick Actions (existing) ── */}
      <div className="bg-white border border-gray-200 rounded-xl px-6 py-5 mb-6">
        <p className="text-sm font-semibold text-gray-900 mb-3">Ask Analytics</p>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              value={aiQuestion}
              onChange={(e) => setAiQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !aiLoading) onAskAnalytics(); }}
              placeholder="Ask anything about your court data..."
              className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-gray-400"
            />
            <button
              onClick={onAskAnalytics}
              disabled={aiLoading || !aiQuestion.trim()}
              className="px-3 py-2 rounded-md bg-gray-900 text-white text-xs font-medium disabled:opacity-50"
            >
              {aiLoading ? 'Asking...' : 'Ask'}
            </button>
          </div>
          {aiError && <p className="text-xs text-red-600">{aiError}</p>}
          {aiAnswer && (
            <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
              <p className="text-xs text-gray-400 mb-1">Powered by AI</p>
              <p className="text-sm text-gray-700 leading-relaxed">{aiAnswer}</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl px-6 py-5 mb-6">
        <p className="text-sm font-semibold text-gray-900 mb-4">Quick Actions</p>
        <div className="actions-grid grid grid-cols-4 gap-2.5">
          {quickActions.map(a => (
            <Link key={a.label} href={a.href} className="qa-card">
              <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                <div className="w-3 h-3 rounded-sm bg-gray-300" />
              </div>
              <span className="text-xs font-semibold text-gray-700 leading-snug">{a.label}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl px-6 py-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-gray-900">Recent Payout Transfers</p>
          <select
            value={payoutStatusFilter}
            onChange={e => setPayoutStatusFilter(e.target.value as any)}
            className="text-xs border border-gray-200 rounded px-2 py-1"
          >
            <option value="all">All</option>
            <option value="queued">Queued</option>
            <option value="succeeded">Succeeded</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        {payoutTransfers.length === 0 ? (
          <p className="text-xs text-gray-400">No payout transfers yet.</p>
        ) : (
          <div className="space-y-2">
            {payoutTransfers.map((t: any) => (
              <div key={t._id} className="flex justify-between items-center text-xs border-b border-gray-50 pb-2">
                <span className="text-gray-500 font-mono">{new Date(t.createdAt).toLocaleString()}</span>
                <span className="text-gray-700 font-mono">₱{Number(t.amount || 0).toFixed(2)}</span>
                <div className="flex items-center gap-2">
                  <span className={t.status === 'succeeded' ? 'text-green-600' : t.status === 'failed' ? 'text-red-600' : 'text-amber-600'}>
                    {t.status}
                  </span>
                  {t.status === 'failed' && (
                    <button
                      onClick={async () => {
                        await fetch(`/api/proxy/payout-transfers/${t._id}/retry`, { method: 'POST' });
                        loadPayoutTransfers();
                      }}
                      className="text-[10px] px-2 py-1 border border-blue-200 bg-blue-50 text-blue-700 rounded"
                    >
                      Retry
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Sections nav (existing) ── */}
      <div className="bg-white border border-gray-200 rounded-xl px-6 py-5">
        <p className="text-sm font-semibold text-gray-900 mb-3">Sections</p>
        <div>
          {navLinks.map((n, i) => (
            <Link key={n.href} href={n.href} className="section-link"
              style={{ borderBottom: i < navLinks.length - 1 ? '1px solid #f3f4f6' : 'none', borderRadius: 0 }}>
              <div>
                <p className="text-sm font-medium text-gray-700">{n.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{n.desc}</p>
              </div>
              <span className="text-sm text-gray-300 shrink-0 ml-4">→</span>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}