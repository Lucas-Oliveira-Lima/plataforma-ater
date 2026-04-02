'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { db } from '@/lib/db/dexie'
import { useAuthStore } from '@/stores/auth.store'
import { TopBar } from '@/components/layout/top-bar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { Profile, Visit, Producer, Property } from '@/types'

interface TechStats {
  profile: Profile
  visitsTotal: number
  visitsDone: number
  visitsPending: number
}

export default function AdminPage() {
  const router = useRouter()
  const { profile, workspace } = useAuthStore()
  const [techStats, setTechStats] = useState<TechStats[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (!profile) return
    if (profile.role !== 'admin') { router.replace('/dashboard'); return }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  async function load() {
    if (!workspace) return
    const supabase = createClient()
    const { data: members } = await supabase
      .from('profiles')
      .select('*')
      .eq('workspace_id', workspace.id)
      .order('full_name')

    if (!members) { setLoading(false); return }

    const visits = await db.visits.toArray()
    const stats: TechStats[] = (members as Profile[]).map((m) => {
      const memberVisits = visits.filter((v) => v.technician_id === m.id)
      return {
        profile: m,
        visitsTotal: memberVisits.length,
        visitsDone: memberVisits.filter((v) => v.status === 'completed').length,
        visitsPending: memberVisits.filter((v) => v.status === 'active' || v.status === 'scheduled').length,
      }
    })
    setTechStats(stats)
    setLoading(false)
  }

  async function handleExport() {
    if (!workspace) return
    setExporting(true)
    try {
      const [producers, properties, visits] = await Promise.all([
        db.producers.toArray(),
        db.properties.toArray(),
        db.visits.toArray(),
      ])

      const producerMap = new Map(producers.map((p) => [p.id, p]))
      const propMap = new Map(properties.map((p) => [p.id, p]))
      const techMap = new Map(techStats.map((t) => [t.profile.id, t.profile.full_name]))

      const enrichedProperties = properties.map((p) => ({
        ...p,
        producer_name: producerMap.get(p.producer_id)?.name,
      }))
      const enrichedVisits = visits.map((v) => ({
        ...v,
        producer_name: producerMap.get(v.producer_id)?.name,
        property_name: v.property_id ? propMap.get(v.property_id)?.name : undefined,
        technician_name: techMap.get(v.technician_id) ?? 'Desconhecido',
      }))

      const { exportToExcel } = await import('@/lib/utils/export-excel')
      await exportToExcel({ producers, properties: enrichedProperties, visits: enrichedVisits }, workspace.name)
    } finally {
      setExporting(false)
    }
  }

  const totalVisits = techStats.reduce((s, t) => s + t.visitsTotal, 0)
  const totalDone = techStats.reduce((s, t) => s + t.visitsDone, 0)

  return (
    <>
      <TopBar title="Painel Admin" backHref="/dashboard" />
      <div className="px-4 py-4 flex flex-col gap-4">

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3">
          <Card padding="sm" className="flex flex-col gap-1">
            <p className="text-2xl font-bold text-gray-900">{techStats.length}</p>
            <p className="text-xs text-gray-500">Técnicos</p>
          </Card>
          <Card padding="sm" className="flex flex-col gap-1">
            <p className="text-2xl font-bold text-gray-900">{totalVisits}</p>
            <p className="text-xs text-gray-500">Visitas totais</p>
          </Card>
          <Card padding="sm" className="flex flex-col gap-1">
            <p className="text-2xl font-bold text-green-600">{totalDone}</p>
            <p className="text-xs text-gray-500">Concluídas</p>
          </Card>
          <Card padding="sm" className="flex flex-col gap-1">
            <p className="text-2xl font-bold text-orange-500">{totalVisits - totalDone}</p>
            <p className="text-xs text-gray-500">Em aberto</p>
          </Card>
        </div>

        {/* Quick links */}
        <div className="flex gap-2">
          <Link href="/admin/members" className="flex-1">
            <Card padding="sm" className="flex items-center gap-2 cursor-pointer">
              <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
              <span className="text-sm font-medium text-gray-700">Gerenciar técnicos</span>
            </Card>
          </Link>
          <Link href="/admin/checklist" className="flex-1">
            <Card padding="sm" className="flex items-center gap-2 cursor-pointer">
              <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium text-gray-700">Checklist padrão</span>
            </Card>
          </Link>
        </div>

        {/* Export */}
        <Button variant="secondary" onClick={handleExport} loading={exporting}>
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          {exporting ? 'Exportando...' : 'Exportar dados (Excel)'}
        </Button>

        {/* Technician list */}
        <div>
          <h3 className="font-semibold text-gray-900 mb-3">Desempenho por técnico</h3>
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-4">Carregando...</p>
          ) : (
            <div className="flex flex-col gap-3">
              {techStats.map((t) => (
                <Card key={t.profile.id} padding="sm">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                      {t.profile.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">{t.profile.full_name}</p>
                      <p className="text-xs text-gray-500">{t.profile.role === 'admin' ? 'Administrador' : 'Técnico'}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-lg font-bold text-gray-900">{t.visitsTotal}</p>
                      <p className="text-xs text-gray-500">Total</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-green-600">{t.visitsDone}</p>
                      <p className="text-xs text-gray-500">Concluídas</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-orange-500">{t.visitsPending}</p>
                      <p className="text-xs text-gray-500">Em aberto</p>
                    </div>
                  </div>
                  {t.visitsTotal > 0 && (
                    <div className="mt-2">
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div
                          className="bg-brand-600 h-1.5 rounded-full transition-all"
                          style={{ width: `${Math.round((t.visitsDone / t.visitsTotal) * 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 mt-1 text-right">
                        {Math.round((t.visitsDone / t.visitsTotal) * 100)}% concluídas
                      </p>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
