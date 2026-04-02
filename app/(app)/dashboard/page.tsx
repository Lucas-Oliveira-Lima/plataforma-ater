'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { db } from '@/lib/db/dexie'
import { useAuthStore } from '@/stores/auth.store'
import { TopBar } from '@/components/layout/top-bar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Visit, Producer } from '@/types'
import { formatDateTime } from '@/lib/utils/dates'

interface Stats {
  totalVisits: number
  activeVisits: number
  totalProducers: number
  totalForms: number
}

export default function DashboardPage() {
  const { profile, workspace } = useAuthStore()
  const [stats, setStats] = useState<Stats>({ totalVisits: 0, activeVisits: 0, totalProducers: 0, totalForms: 0 })
  const [recentVisits, setRecentVisits] = useState<(Visit & { producer?: Producer })[]>([])

  useEffect(() => {
    async function load() {
      const [visits, producers, forms] = await Promise.all([
        db.visits.toArray(),
        db.producers.count(),
        db.forms.count(),
      ])

      const active = visits.filter((v) => v.status === 'active')
      setStats({
        totalVisits: visits.length,
        activeVisits: active.length,
        totalProducers: producers,
        totalForms: forms,
      })

      const recent = visits
        .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
        .slice(0, 5)

      const enriched = await Promise.all(
        recent.map(async (v) => ({
          ...v,
          producer: await db.producers.get(v.producer_id),
        }))
      )
      setRecentVisits(enriched)
    }
    load()
  }, [])

  const firstName = profile?.full_name?.split(' ')[0] ?? 'Técnico'

  return (
    <>
      <TopBar
        title={workspace?.name ?? 'ATER'}
        action={
          <Link href="/profile">
            <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white text-sm font-bold">
              {profile?.full_name?.charAt(0).toUpperCase() ?? '?'}
            </div>
          </Link>
        }
      />
      <div className="px-4 py-4 flex flex-col gap-4">

        {/* Greeting */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Olá, {firstName}!</h2>
          <p className="text-gray-500 text-sm mt-0.5">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/visits">
            <StatCard
              label="Visitas"
              value={stats.totalVisits}
              icon="📋"
              highlight={stats.activeVisits > 0 ? `${stats.activeVisits} ativa${stats.activeVisits > 1 ? 's' : ''}` : undefined}
            />
          </Link>
          <Link href="/producers">
            <StatCard label="Produtores" value={stats.totalProducers} icon="👨‍🌾" />
          </Link>
          <Link href="/forms">
            <StatCard label="Formulários" value={stats.totalForms} icon="📝" />
          </Link>
          <Link href="/visits/new" className="block">
            <div className="bg-brand-600 rounded-2xl p-4 flex flex-col gap-1 h-full min-h-[88px] items-center justify-center text-white shadow-sm">
              <span className="text-3xl">+</span>
              <span className="text-sm font-semibold">Nova visita</span>
            </div>
          </Link>
        </div>

        {/* Active visit banner */}
        {stats.activeVisits > 0 && (
          <Card className="bg-green-50 border-green-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                <span className="text-lg">🌿</span>
              </div>
              <div className="flex-1">
                <p className="font-semibold text-green-900">Visita em andamento</p>
                <p className="text-sm text-green-700">Você tem {stats.activeVisits} visita{stats.activeVisits > 1 ? 's' : ''} ativa{stats.activeVisits > 1 ? 's' : ''}</p>
              </div>
              <Link href="/visits">
                <Button size="sm" variant="secondary">Ver</Button>
              </Link>
            </div>
          </Card>
        )}

        {/* Recent visits */}
        {recentVisits.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">Visitas recentes</h3>
              <Link href="/visits" className="text-brand-600 text-sm font-medium">Ver todas</Link>
            </div>
            <div className="flex flex-col gap-2">
              {recentVisits.map((visit) => (
                <Link key={visit.id} href={`/visits/${visit.id}`}>
                  <Card padding="sm" className="flex items-center gap-3 active:scale-[0.98] transition-transform cursor-pointer">
                    <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0 text-lg">
                      🌾
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate text-sm">{visit.producer?.name ?? '—'}</p>
                      <p className="text-xs text-gray-400">{formatDateTime(visit.started_at)}</p>
                    </div>
                    <Badge variant={visit.status === 'active' ? 'green' : 'gray'}>
                      {visit.status === 'active' ? 'Ativa' : 'Concluída'}
                    </Badge>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div>
          <h3 className="font-semibold text-gray-900 mb-3">Acesso rápido</h3>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/producers/new">
              <Card padding="sm" className="flex items-center gap-2 active:scale-[0.98] transition-transform cursor-pointer">
                <span className="text-2xl">👨‍🌾</span>
                <span className="text-sm font-medium text-gray-700">Novo produtor</span>
              </Card>
            </Link>
            <Link href="/map">
              <Card padding="sm" className="flex items-center gap-2 active:scale-[0.98] transition-transform cursor-pointer">
                <span className="text-2xl">🗺️</span>
                <span className="text-sm font-medium text-gray-700">Ver mapa</span>
              </Card>
            </Link>
            <Link href="/visits/calendar">
              <Card padding="sm" className="flex items-center gap-2 active:scale-[0.98] transition-transform cursor-pointer">
                <span className="text-2xl">📅</span>
                <span className="text-sm font-medium text-gray-700">Calendário</span>
              </Card>
            </Link>
            <Link href="/forms/new">
              <Card padding="sm" className="flex items-center gap-2 active:scale-[0.98] transition-transform cursor-pointer">
                <span className="text-2xl">📝</span>
                <span className="text-sm font-medium text-gray-700">Novo formulário</span>
              </Card>
            </Link>
            <Link href="/profile">
              <Card padding="sm" className="flex items-center gap-2 active:scale-[0.98] transition-transform cursor-pointer">
                <span className="text-2xl">👤</span>
                <span className="text-sm font-medium text-gray-700">Meu perfil</span>
              </Card>
            </Link>
            {profile?.role === 'admin' && (
              <Link href="/admin">
                <Card padding="sm" className="flex items-center gap-2 active:scale-[0.98] transition-transform cursor-pointer">
                  <span className="text-2xl">⚙️</span>
                  <span className="text-sm font-medium text-gray-700">Painel admin</span>
                </Card>
              </Link>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function StatCard({ label, value, icon, highlight }: {
  label: string
  value: number
  icon: string
  highlight?: string
}) {
  return (
    <Card padding="sm" className="flex flex-col gap-1 h-full min-h-[88px]">
      <div className="flex items-center justify-between">
        <span className="text-2xl">{icon}</span>
        {highlight && <Badge variant="green">{highlight}</Badge>}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 font-medium">{label}</p>
    </Card>
  )
}
