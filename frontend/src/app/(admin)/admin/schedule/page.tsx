'use client';
import { useState, useEffect, useCallback } from 'react';
import { sileo } from 'sileo';
import { useSocketEvent } from '@/hooks/useSocketEvent';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScheduleRule {
  _id:        string;
  dayOfWeek:  number;
  dayName:    string;
  isClosed:   boolean;
  openTime:   string;
  closeTime:  string;
}

interface ScheduleBlock {
  _id:       string;
  date:      string;
  courts:    number[];
  blockType: 'day' | 'range';
  startTime: string;
  endTime:   string;
  reason:    string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TIME_OPTIONS = [
  '00:00','01:00','02:00','03:00','04:00','05:00','06:00',
  '07:00','08:00','09:00','10:00','11:00','12:00','13:00',
  '14:00','15:00','16:00','17:00','18:00','19:00','20:00',
  '21:00','22:00','23:00',
];

function fmt12(time: string) {
  if (!time) return '—';
  const [h] = time.split(':').map(Number);
  const ampm   = h >= 12 ? 'PM' : 'AM';
  const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${display}:00 ${ampm}`;
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Select({ value, onChange, options, className = '' }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`bg-white border border-gray-200 rounded-md px-2.5 py-1.5 text-sm text-gray-700 outline-none focus:border-green-400 ${className}`}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ── Weekly Rules Panel ────────────────────────────────────────────────────────

function WeeklyRulesPanel({ rules, onUpdate }: {
  rules: ScheduleRule[];
  onUpdate: () => void;
}) {
  const [saving, setSaving] = useState<number | null>(null);

  // In WeeklyRulesPanel — updateRule
  const updateRule = async (dayOfWeek: number, patch: Partial<ScheduleRule>) => {
    setSaving(dayOfWeek);
    try {
      await fetch(`/api/proxy/schedule/rules/${dayOfWeek}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(patch),
      });
      sileo.success({ title: 'Schedule updated' });
      onUpdate();
    } catch {
      sileo.error({ title: 'Failed to update schedule' });
    } finally {
      setSaving(null);
    }
  };

  const timeOpts = TIME_OPTIONS.map(t => ({ value: t, label: fmt12(t) }));

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Weekly Schedule</h2>
          <p className="text-xs text-gray-400 mt-0.5">Default open hours per day of week</p>
        </div>
      </div>

      <div className="divide-y divide-gray-50">
        {rules.map(rule => (
          <div key={rule.dayOfWeek}
            className="px-5 py-3.5 flex items-center gap-4 flex-wrap">

            {/* Day name */}
            <div className="w-24 shrink-0">
              <span className="text-sm font-medium text-gray-700">{rule.dayName}</span>
            </div>

            {/* Closed toggle */}
            <label className="flex items-center gap-2 cursor-pointer shrink-0">
              <div
                className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                  rule.isClosed ? 'bg-red-400' : 'bg-green-400'
                }`}
                onClick={() => updateRule(rule.dayOfWeek, { isClosed: !rule.isClosed })}
              >
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  rule.isClosed ? 'translate-x-0.5' : 'translate-x-4'
                }`} />
              </div>
              <span className={`text-xs font-medium ${rule.isClosed ? 'text-red-500' : 'text-green-600'}`}>
                {rule.isClosed ? 'Closed' : 'Open'}
              </span>
            </label>

            {/* Time range — only if open */}
            {!rule.isClosed && (
              <div className="flex items-center gap-2">
                <Select
                  value={rule.openTime}
                  onChange={v => updateRule(rule.dayOfWeek, { openTime: v })}
                  options={timeOpts}
                />
                <span className="text-xs text-gray-400">to</span>
                <Select
                  value={rule.closeTime}
                  onChange={v => updateRule(rule.dayOfWeek, { closeTime: v })}
                  options={timeOpts}
                />
              </div>
            )}

            {/* Saving indicator */}
            {saving === rule.dayOfWeek && (
              <span className="text-xs text-gray-400 ml-auto">Saving...</span>
            )}

            {/* Summary pill */}
            {saving !== rule.dayOfWeek && (
              <span className={`ml-auto text-[0.65rem] px-2.5 py-1 rounded-full border font-medium ${
                rule.isClosed
                  ? 'bg-red-50 border-red-200 text-red-500'
                  : 'bg-green-50 border-green-200 text-green-700'
              }`}>
                {rule.isClosed ? 'Closed all day' : `${fmt12(rule.openTime)} – ${fmt12(rule.closeTime)}`}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Add Block Form ────────────────────────────────────────────────────────────

function AddBlockForm({ onAdded }: { onAdded: () => void }) {
  const [open,      setOpen]      = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [form, setForm] = useState({
    date:      todayStr(),
    blockType: 'day' as 'day' | 'range',
    courts:    [] as number[],
    startTime: '18:00',
    endTime:   '21:00',
    reason:    '',
  });

  const toggleCourt = (c: number) => {
    setForm(f => ({
      ...f,
      courts: f.courts.includes(c) ? f.courts.filter(x => x !== c) : [...f.courts, c],
    }));
  };

  const submit = async () => {
    setSaving(true);
    // In AddBlockForm — submit
    try{
      const res = await fetch('/api/proxy/schedule/blocks', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      sileo.success({ title: 'Block added' });
      setOpen(false);
      setForm({ date: todayStr(), blockType: 'day', courts: [], startTime: '18:00', endTime: '21:00', reason: '' });
      onAdded();
    } catch (err: unknown) {
      sileo.error({ title: (err as Error).message || 'Failed to add block' });
    } finally {
      setSaving(false);
    }
  };

  const timeOpts = TIME_OPTIONS.map(t => ({ value: t, label: fmt12(t) }));

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 transition-colors"
      >
        + Add Block
      </button>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-4">New Schedule Block</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        {/* Date */}
        <div>
          <label className="block text-[0.65rem] font-semibold tracking-widest uppercase text-gray-400 mb-1.5">Date</label>
          <input
            type="date"
            min={todayStr()}
            value={form.date}
            onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            className="w-full bg-white border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-700 outline-none focus:border-green-400"
          />
        </div>

        {/* Block type */}
        <div>
          <label className="block text-[0.65rem] font-semibold tracking-widest uppercase text-gray-400 mb-1.5">Block Type</label>
          <div className="flex gap-2">
            {(['day', 'range'] as const).map(t => (
              <button key={t}
                onClick={() => setForm(f => ({ ...f, blockType: t }))}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium border transition-all ${
                  form.blockType === t
                    ? 'bg-gray-900 border-gray-900 text-white'
                    : 'bg-white border-gray-200 text-gray-500'
                }`}>
                {t === 'day' ? 'Full Day' : 'Time Range'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Time range — only for 'range' type */}
      {form.blockType === 'range' && (
        <div className="flex items-center gap-3 mb-4">
          <div>
            <label className="block text-[0.65rem] font-semibold tracking-widest uppercase text-gray-400 mb-1.5">From</label>
            <Select value={form.startTime} onChange={v => setForm(f => ({ ...f, startTime: v }))} options={timeOpts} />
          </div>
          <span className="text-gray-400 mt-5">→</span>
          <div>
            <label className="block text-[0.65rem] font-semibold tracking-widest uppercase text-gray-400 mb-1.5">To</label>
            <Select value={form.endTime} onChange={v => setForm(f => ({ ...f, endTime: v }))} options={timeOpts} />
          </div>
        </div>
      )}

      {/* Courts */}
      <div className="mb-4">
        <label className="block text-[0.65rem] font-semibold tracking-widest uppercase text-gray-400 mb-1.5">
          Courts Affected
        </label>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setForm(f => ({ ...f, courts: [] }))}
            className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
              form.courts.length === 0
                ? 'bg-gray-900 border-gray-900 text-white'
                : 'bg-white border-gray-200 text-gray-500'
            }`}>
            All Courts
          </button>
          {[1, 2, 3, 4].map(c => (
            <button key={c}
              onClick={() => toggleCourt(c)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                form.courts.includes(c)
                  ? 'bg-green-50 border-green-300 text-green-700'
                  : 'bg-white border-gray-200 text-gray-500'
              }`}>
              Court {c}
            </button>
          ))}
        </div>
        <p className="text-[0.65rem] text-gray-400 mt-1">
          {form.courts.length === 0 ? 'All courts will be blocked.' : `Only Court ${form.courts.join(', ')} will be blocked.`}
        </p>
      </div>

      {/* Reason */}
      <div className="mb-5">
        <label className="block text-[0.65rem] font-semibold tracking-widest uppercase text-gray-400 mb-1.5">
          Reason <span className="text-gray-300 normal-case">(shown to admin only)</span>
        </label>
        <input
          className="w-full bg-white border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-700 outline-none focus:border-green-400"
          placeholder="e.g. Queue session, Private event, Maintenance..."
          value={form.reason}
          onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
        />
      </div>

      <div className="flex gap-2">
        <button onClick={submit} disabled={saving}
          className="px-4 py-2 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors">
          {saving ? 'Saving...' : 'Save Block'}
        </button>
        <button onClick={() => setOpen(false)}
          className="px-4 py-2 bg-white border border-gray-200 text-gray-500 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Blocks List ───────────────────────────────────────────────────────────────

function BlocksList({ blocks, onDelete }: {
  blocks: ScheduleBlock[];
  onDelete: (id: string) => void;
}) {
  if (blocks.length === 0) {
    return (
      <div className="py-10 text-center border border-dashed border-gray-200 rounded-xl">
        <p className="text-sm text-gray-300">No specific blocks added yet.</p>
        <p className="text-xs text-gray-300 mt-1">Weekly schedule applies by default.</p>
      </div>
    );
  }

  // Group by date
  const grouped = blocks.reduce((acc, b) => {
    if (!acc[b.date]) acc[b.date] = [];
    acc[b.date].push(b);
    return acc;
  }, {} as Record<string, ScheduleBlock[]>);

  return (
    <div className="space-y-4">
      {Object.entries(grouped)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, items]) => (
          <div key={date}>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-sm font-semibold text-gray-700">{fmtDate(date)}</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-50">
              {items.map(block => (
                <div key={block._id} className="px-5 py-3.5 flex items-center gap-4">
                  {/* Type badge */}
                  <span className={`text-[0.65rem] font-semibold tracking-wide px-2.5 py-1 rounded-full border shrink-0 ${
                    block.blockType === 'day'
                      ? 'bg-red-50 border-red-200 text-red-500'
                      : 'bg-orange-50 border-orange-200 text-orange-600'
                  }`}>
                    {block.blockType === 'day' ? 'Full Day' : 'Time Range'}
                  </span>

                  {/* Time range (if applicable) */}
                  {block.blockType === 'range' && (
                    <span className="text-sm text-gray-600 font-mono">
                      {fmt12(block.startTime)} – {fmt12(block.endTime)}
                    </span>
                  )}

                  {/* Courts */}
                  <span className="text-xs text-gray-400">
                    {block.courts.length === 0
                      ? 'All courts'
                      : `Court ${block.courts.join(', ')}`}
                  </span>

                  {/* Reason */}
                  {block.reason && (
                    <span className="text-xs text-gray-400 italic truncate max-w-[160px]">
                      "{block.reason}"
                    </span>
                  )}

                  {/* Delete */}
                  <button
                    onClick={() => onDelete(block._id)}
                    className="ml-auto text-gray-300 hover:text-red-400 transition-colors text-sm"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const [rules,   setRules]   = useState<ScheduleRule[]>([]);
  const [blocks,  setBlocks]  = useState<ScheduleBlock[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesRes, blocksRes] = await Promise.all([
        fetch('/api/proxy/schedule/rules'),
        fetch('/api/proxy/schedule/blocks'),
      ]);
      const rulesData  = await rulesRes.json();
      const blocksData = await blocksRes.json();
      setRules(Array.isArray(rulesData)   ? rulesData  : []);
      setBlocks(Array.isArray(blocksData) ? blocksData : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useSocketEvent('schedule:updated', useCallback(() => { load(); }, [load]));

  // deleteBlock
  const deleteBlock = async (id: string) => {
    if (!confirm('Remove this block?')) return;
    await fetch(`/api/proxy/schedule/blocks/${id}`, { method: 'DELETE' });
    sileo.success({ title: 'Block removed' });
    load();
  };

  return (
    <div className="w-full font-sans">
      {/* Header */}
      <div className="mb-8 pb-6 border-b border-gray-100">
        <p className="text-[0.72rem] font-medium tracking-wide uppercase text-gray-400 mb-1.5">Management</p>
        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Schedule</h1>
        <p className="text-sm text-gray-400 mt-1">
          Control when users can book courts. Weekly rules apply by default; specific date blocks override them.
        </p>
      </div>

      {loading ? (
        <div className="p-16 text-center text-gray-300 text-sm">Loading...</div>
      ) : (
        <div className="space-y-8">
          {/* Weekly rules */}
          <section>
            <h2 className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-3">
              Weekly Defaults
            </h2>
            <WeeklyRulesPanel rules={rules} onUpdate={load} />
          </section>

          {/* Date-specific blocks */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-xs font-semibold tracking-widest uppercase text-gray-400">
                  Date-Specific Blocks
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Override the weekly schedule for a specific date or court
                </p>
              </div>
              <AddBlockForm onAdded={load} />
            </div>
            <BlocksList blocks={blocks} onDelete={deleteBlock} />
          </section>
        </div>
      )}
    </div>
  );
}