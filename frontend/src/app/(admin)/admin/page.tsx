'use client';
import Link from 'next/link';
import { Users, Swords, Building2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { getPlayers, getQueue } from '@/lib/api';
import type { Player, Match } from '@/lib/api';

const quickActions = [
  { href: '/admin/players', label: 'Add Player'    },
  { href: '/admin/queue',   label: 'Queue'         },
  { href: '/admin/queue',   label: 'Generate Match'},
  { href: '/admin/billing', label: 'Billing'       },
];

const navLinks = [
  { href: '/admin/players', label: 'Players', desc: 'Manage registered players and skill levels'  },
  { href: '/admin/queue',   label: 'Queue',   desc: 'Live court queue and match generator'        },
  { href: '/admin/billing', label: 'Billing', desc: 'Per-player tabs for drinks and shuttlecocks' },
];

export default function AdminDashboard() {
  const [playerCount, setPlayerCount] = useState<number | string>('—');
  const [matchCount,  setMatchCount]  = useState<number | string>('—');

  useEffect(() => {
    const load = async () => {
      const [players, queue]: [Player[], Match[]] = await Promise.all([getPlayers(), getQueue()]);
      setPlayerCount(players.length);
      setMatchCount(queue.length);
    };
    load();
  }, []);

  const statCards = [
    { label: 'Total Players',  value: playerCount, sub: 'Registered',   color: '#7c3aed', icon: Users     },
    { label: 'Active Matches', value: matchCount,  sub: 'On court now', color: '#0ea5e9', icon: Swords    },
    { label: 'Courts',         value: '4',         sub: 'Available',    color: '#10b981', icon: Building2 },
  ];

  return (
    <div className="w-full font-sans">

      {/* Header */}
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Welcome back, Admin</p>
      </div>

      {/* Stat cards */}
      <div className="stats-grid grid grid-cols-3 gap-4 mb-6">
        {statCards.map(s => (
          <div key={s.label} className="stat-card">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">{s.label}</p>
              <p className="text-[1.85rem] font-bold text-gray-900 leading-none mb-1">{s.value}</p>
              <p className="text-[0.72rem] text-gray-400">{s.sub}</p>
            </div>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${s.color}15` }}>
              <s.icon size={16} color={s.color} strokeWidth={1.75} />
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-white border border-gray-200 rounded-xl px-6 py-5 mb-6">
        <p className="text-sm font-semibold text-gray-900 mb-4">Quick Actions</p>
        <div className="actions-grid grid grid-cols-4 gap-2.5">
          {quickActions.map(a => (
            <Link key={a.label} href={a.href} className="qa-card">
              <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center">
                <div className="w-3 h-3 rounded-sm bg-gray-400" />
              </div>
              <span className="text-xs font-semibold text-gray-700 leading-snug">{a.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Sections */}
      <div className="bg-white border border-gray-200 rounded-xl px-6 py-5 mb-6">
        <p className="text-sm font-semibold text-gray-900 mb-3">Sections</p>
        <div>
          {navLinks.map((n, i) => (
            <Link
              key={n.href}
              href={n.href}
              className="section-link"
              style={{ borderBottom: i < navLinks.length - 1 ? '1px solid #f3f4f6' : 'none', borderRadius: 0 }}
            >
              <div>
                <p className="text-sm font-medium text-gray-700">{n.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{n.desc}</p>
              </div>
              <span className="text-sm text-gray-300 shrink-0 ml-4">→</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white border border-gray-200 rounded-xl px-6 py-5">
        <p className="text-sm font-semibold text-gray-900 mb-3">Recent Activity</p>
        <div className="p-6 text-center bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-400">Recent matches and updates will appear here.</p>
        </div>
      </div>
    </div>
  );
}