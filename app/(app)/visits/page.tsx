'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { db } from '@/lib/db/dexie'
import { TopBar } from '@/components/layout/top-bar'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Visit, Producer, Property } from '@/types'
import { formatDateTime, formatDuration } from '@/lib/utils/dates'

type VisitWithDetails = Visit & { producer?: Producer; property?: Property }

export default function VisitsPage() {
  const [visits, setVisits] = useState<VisitWithDetails[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all')

  useEffect(() => {
    async function load() {
      const all = await db.visits.orderBy('started_at').reverse().toArray()
      const enriched = await Promise.all(
        all.map(async (v) => ({
          ...v,
          producer: await db.producers.get(v.producer_id),
          property: v.property_id ? await db.properties.get(v.property_id) : undefined,
        }))
      )
      setVisits(enriched)
    }
    load()
  }, [])

  const filtered = visits.filter((v) => {
    const matchesSearch =
      !search ||
      v.producer?.name.toLowerCase().includes(search.toLowerCase()) ||
      v.property?.name.toLowerCase().includes(search.toLowerCase()) ||
      v.property?.municipality.toLowerCase().includes(search.toLowerCase())
    const matchesFilter =
      filter === 'all' || v.status === filter
    return matchesSearch && matchesFilter
  })

  return (
    <>
      <TopBar title="Visitas" />
      <div className="px-4 py-4 flex flex-col gap-3">

        {/* Search + filter */}
        <div className="flex flex-col gap-2">
          <input
            type="search"
            placeholder="Buscar por produtor ou propriedade..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <div className="flex gap-2">
            {(['all', 'active', 'completed'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                  filter === f
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                {f === 'all' ? 'Todas' : f === 'active' ? 'Ativas' : 'Concluídas'}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12">
            {visits.length === 0 ? (
              <>
                <p className="text-gray-400 text-lg">Nenhuma visita registrada</p>
                <Link href="/visits/new">
                  <Button className="mt-4">Iniciar visita</Button>
                </Link>
              </>
            ) : (
              <p className="text-gray-400">Nenhuma visita encontrada</p>
            )}
          </div>
        ) : (
          filtered.map((visit) => (
            <Link key={visit.id} href={`/visits/${visit.id}`}>
              <Card className="flex flex-col gap-2 active:scale-[0.98] transition-transform cursor-pointer">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-gray-900 truncate">{visit.producer?.name ?? '—'}</p>
                  <Badge variant={visit.status === 'active' ? 'green' : 'gray'}>
                    {visit.status === 'active' ? 'Em andamento' : 'Concluída'}
                  </Badge>
                </div>
                {visit.property && (
                  <p className="text-sm text-gray-500">{visit.property.name} · {visit.property.municipality}</p>
                )}
                <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                  <span>{formatDateTime(visit.started_at)}</span>
                  <span>·</span>
                  <span>{formatDuration(visit.started_at, visit.ended_at)}</span>
                  {!visit.synced_at && (
                    <>
                      <span>·</span>
                      <span className="text-orange-500 font-medium">Não sincronizado</span>
                    </>
                  )}
                </div>
              </Card>
            </Link>
          ))
        )}
      </div>
    </>
  )
}
