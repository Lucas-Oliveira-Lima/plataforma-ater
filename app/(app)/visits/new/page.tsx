'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { v4 as uuidv4 } from 'uuid'
import { db, enqueueSyncItem } from '@/lib/db/dexie'
import { useAuthStore } from '@/stores/auth.store'
import { useVisitStore } from '@/stores/visit.store'
import { useGps } from '@/hooks/use-gps'
import { TopBar } from '@/components/layout/top-bar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import type { Producer, Property } from '@/types'

export default function NewVisitPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { workspace, profile } = useAuthStore()
  const { setActiveVisit } = useVisitStore()
  const { coords, loading: gpsLoading, error: gpsError, capture } = useGps()

  const [producers, setProducers] = useState<Producer[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [selectedProducerId, setSelectedProducerId] = useState(searchParams.get('producer_id') ?? '')
  const [selectedPropertyId, setSelectedPropertyId] = useState('')
  const [mode, setMode] = useState<'now' | 'schedule'>('now')
  const [scheduledAt, setScheduledAt] = useState('')
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    db.producers.orderBy('name').toArray().then(setProducers)
  }, [])

  useEffect(() => {
    if (selectedProducerId) {
      db.properties.where('producer_id').equals(selectedProducerId).toArray().then(setProperties)
    } else {
      setProperties([])
      setSelectedPropertyId('')
    }
  }, [selectedProducerId])

  useEffect(() => {
    if (mode === 'now') capture()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  async function startVisit() {
    if (!workspace || !profile || !selectedProducerId) return
    if (mode === 'schedule' && !scheduledAt) return
    setStarting(true)

    const id = uuidv4()
    const now = new Date().toISOString()

    const isScheduled = mode === 'schedule'

    const visit = {
      id,
      workspace_id: workspace.id,
      technician_id: profile.id,
      producer_id: selectedProducerId,
      property_id: selectedPropertyId || null,
      status: isScheduled ? 'scheduled' as const : 'active' as const,
      started_at: now,
      ended_at: null,
      notes: null,
      gps_lat: isScheduled ? null : (coords?.lat ?? null),
      gps_lng: isScheduled ? null : (coords?.lng ?? null),
      audio_urls: [],
      photo_urls: [],
      scheduled_at: isScheduled ? new Date(scheduledAt).toISOString() : null,
      signature_url: null,
      synced_at: null,
      created_at: now,
      updated_at: now,
    }

    // Auto-populate checklist from templates
    const templates = await db.checklist_templates.where('workspace_id').equals(workspace.id).sortBy('order_index')
    const checklistItems = templates.map((t, i) => ({
      id: uuidv4(),
      workspace_id: workspace.id,
      visit_id: id,
      label: t.label,
      checked: false,
      order_index: i,
      created_at: now,
      updated_at: now,
    }))

    await db.visits.add(visit)
    await enqueueSyncItem('visits', 'insert', id, visit as unknown as Record<string, unknown>)

    for (const item of checklistItems) {
      await db.checklist_items.add(item)
      await enqueueSyncItem('checklist_items', 'insert', item.id, item as unknown as Record<string, unknown>)
    }

    if (!isScheduled) setActiveVisit(visit)
    router.push(isScheduled ? '/visits/calendar' : `/visits/${id}`)
  }

  return (
    <>
      <TopBar title="Nova Visita" backHref="/visits" />
      <div className="px-4 py-6 flex flex-col gap-4">

        {/* Mode tabs */}
        <div className="flex rounded-xl border border-gray-200 overflow-hidden">
          <button
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${mode === 'now' ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            onClick={() => setMode('now')}
          >
            Iniciar agora
          </button>
          <button
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${mode === 'schedule' ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            onClick={() => setMode('schedule')}
          >
            Agendar
          </button>
        </div>

        {/* GPS status (only for immediate) */}
        {mode === 'now' && (
          <Card padding="sm" className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${coords ? 'bg-green-100' : 'bg-yellow-100'}`}>
              <svg className={`w-5 h-5 ${coords ? 'text-green-700' : 'text-yellow-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
            </div>
            <div className="flex-1">
              {gpsLoading && <p className="text-sm text-yellow-700">Obtendo localização...</p>}
              {coords && <p className="text-sm text-green-700 font-medium">GPS capturado ({coords.lat.toFixed(5)}, {coords.lng.toFixed(5)})</p>}
              {gpsError && <p className="text-sm text-red-600">GPS indisponível — visita sem localização</p>}
              {!gpsLoading && !coords && !gpsError && <p className="text-sm text-gray-500">Aguardando GPS...</p>}
            </div>
            {!gpsLoading && (
              <Button variant="ghost" size="sm" onClick={capture}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              </Button>
            )}
          </Card>
        )}

        {/* Scheduled date (only for schedule mode) */}
        {mode === 'schedule' && (
          <Input
            label="Data e hora planejada"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            required
          />
        )}

        {/* Producer select */}
        <Select
          label="Produtor"
          required
          placeholder="Selecione o produtor..."
          options={producers.map((p) => ({ value: p.id, label: p.name }))}
          value={selectedProducerId}
          onChange={(e) => setSelectedProducerId(e.target.value)}
        />

        {/* Property select */}
        {properties.length > 0 && (
          <Select
            label="Propriedade"
            placeholder="Selecione a propriedade..."
            options={properties.map((p) => ({ value: p.id, label: `${p.name} — ${p.municipality}` }))}
            value={selectedPropertyId}
            onChange={(e) => setSelectedPropertyId(e.target.value)}
          />
        )}

        <Button
          size="lg"
          className="mt-4 w-full"
          disabled={!selectedProducerId || (mode === 'schedule' && !scheduledAt)}
          loading={starting}
          onClick={startVisit}
        >
          {mode === 'schedule' ? 'Agendar visita' : 'Iniciar visita'}
        </Button>
      </div>
    </>
  )
}
