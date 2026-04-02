'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { db, enqueueSyncItem } from '@/lib/db/dexie'
import { useAuthStore } from '@/stores/auth.store'
import { TopBar } from '@/components/layout/top-bar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Producer, Property } from '@/types'
import { formatDate } from '@/lib/utils/dates'
import { v4 as uuidv4 } from 'uuid'

export default function ProducerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { workspace } = useAuthStore()
  const [producer, setProducer] = useState<Producer | null>(null)
  const [properties, setProperties] = useState<Property[]>([])
  const [showPropertyForm, setShowPropertyForm] = useState(false)
  const [editingProperty, setEditingProperty] = useState<Property | null>(null)

  useEffect(() => {
    async function load() {
      const p = await db.producers.get(id)
      if (!p) { router.push('/producers'); return }
      setProducer(p)
      const props = await db.properties.where('producer_id').equals(id).toArray()
      setProperties(props)
    }
    load()
  }, [id, router])

  async function deleteProducer() {
    if (!confirm('Excluir este produtor e todas as suas propriedades?')) return
    const props = await db.properties.where('producer_id').equals(id).toArray()
    for (const p of props) {
      await db.properties.delete(p.id)
      await enqueueSyncItem('properties', 'delete', p.id, { id: p.id })
    }
    await db.producers.delete(id)
    await enqueueSyncItem('producers', 'delete', id, { id })
    router.push('/producers')
  }

  async function deleteProperty(propId: string) {
    if (!confirm('Excluir esta propriedade?')) return
    await db.properties.delete(propId)
    await enqueueSyncItem('properties', 'delete', propId, { id: propId })
    setProperties((prev) => prev.filter((p) => p.id !== propId))
  }

  if (!producer) return <div className="p-8 text-center text-gray-400">Carregando...</div>

  return (
    <>
      <TopBar
        title={producer.name}
        backHref="/producers"
        action={
          <Link href={`/producers/${id}/edit`}>
            <Button size="sm" variant="ghost">Editar</Button>
          </Link>
        }
      />
      <div className="px-4 py-4 flex flex-col gap-4">

        {/* Info card */}
        <Card>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">{producer.name}</h2>
              <Badge variant="green">Ativo</Badge>
            </div>
            {producer.phone && (
              <a href={`tel:${producer.phone}`} className="flex items-center gap-2 text-gray-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                </svg>
                {producer.phone}
              </a>
            )}
            {producer.email && (
              <a href={`mailto:${producer.email}`} className="flex items-center gap-2 text-gray-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
                {producer.email}
              </a>
            )}
            {producer.notes && (
              <p className="text-gray-500 text-sm mt-1">{producer.notes}</p>
            )}
            <p className="text-xs text-gray-400 mt-1">Cadastrado em {formatDate(producer.created_at)}</p>
          </div>
        </Card>

        {/* Properties */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Propriedades</h3>
            <Button variant="ghost" size="sm" onClick={() => { setShowPropertyForm(!showPropertyForm); setEditingProperty(null) }}>
              + Adicionar
            </Button>
          </div>

          {showPropertyForm && !editingProperty && (
            <PropertyForm
              producerId={id}
              workspaceId={workspace?.id ?? ''}
              onSaved={(prop) => {
                setProperties((prev) => [...prev, prop])
                setShowPropertyForm(false)
              }}
            />
          )}

          {properties.length === 0 && !showPropertyForm ? (
            <p className="text-gray-400 text-sm py-4 text-center">Nenhuma propriedade cadastrada</p>
          ) : (
            <div className="flex flex-col gap-2">
              {properties.map((prop) => (
                <div key={prop.id}>
                  {editingProperty?.id === prop.id ? (
                    <PropertyForm
                      producerId={id}
                      workspaceId={workspace?.id ?? ''}
                      existing={prop}
                      onSaved={(updated) => {
                        setProperties((prev) => prev.map((p) => p.id === updated.id ? updated : p))
                        setEditingProperty(null)
                      }}
                      onCancel={() => setEditingProperty(null)}
                    />
                  ) : (
                    <Card padding="sm" className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{prop.name}</p>
                        <p className="text-xs text-gray-500">
                          {prop.municipality}{prop.area_ha ? ` · ${prop.area_ha} ha` : ''}
                          {prop.car_code ? ` · CAR: ${prop.car_code}` : ''}
                        </p>
                        {(prop.gps_lat !== null) && (
                          <p className="text-xs text-gray-400">GPS: {prop.gps_lat?.toFixed(4)}, {prop.gps_lng?.toFixed(4)}</p>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => setEditingProperty(prop)}
                          className="p-1.5 text-gray-400 hover:text-brand-600 rounded-lg"
                          title="Editar"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                          </svg>
                        </button>
                        <button
                          onClick={() => deleteProperty(prop.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg"
                          title="Excluir"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </Card>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-2">
          <Link href={`/visits/new?producer_id=${id}`} className="flex-1">
            <Button className="w-full" size="lg">Nova Visita</Button>
          </Link>
          <Button variant="danger" size="lg" onClick={deleteProducer}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </Button>
        </div>
      </div>
    </>
  )
}

// ── Inline property form (create + edit) ─────────────────────
function PropertyForm({
  producerId,
  workspaceId,
  existing,
  onSaved,
  onCancel,
}: {
  producerId: string
  workspaceId: string
  existing?: Property
  onSaved: (prop: Property) => void
  onCancel?: () => void
}) {
  const [name, setName] = useState(existing?.name ?? '')
  const [municipality, setMunicipality] = useState(existing?.municipality ?? '')
  const [areaHa, setAreaHa] = useState(existing?.area_ha?.toString() ?? '')
  const [carCode, setCarCode] = useState(existing?.car_code ?? '')
  const [gpsLat, setGpsLat] = useState(existing?.gps_lat?.toString() ?? '')
  const [gpsLng, setGpsLng] = useState(existing?.gps_lng?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [capturingGps, setCapturingGps] = useState(false)

  async function captureGps() {
    setCapturingGps(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLat(pos.coords.latitude.toFixed(6))
        setGpsLng(pos.coords.longitude.toFixed(6))
        setCapturingGps(false)
      },
      () => setCapturingGps(false),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  async function save() {
    if (!name || !municipality) return
    setSaving(true)
    const now = new Date().toISOString()
    const prop: Property = {
      id: existing?.id ?? uuidv4(),
      workspace_id: workspaceId,
      producer_id: producerId,
      name,
      municipality,
      car_code: carCode || null,
      area_ha: areaHa ? parseFloat(areaHa) : null,
      gps_lat: gpsLat ? parseFloat(gpsLat) : null,
      gps_lng: gpsLng ? parseFloat(gpsLng) : null,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    }
    if (existing) {
      await db.properties.update(prop.id, prop)
      await enqueueSyncItem('properties', 'update', prop.id, prop as unknown as Record<string, unknown>)
    } else {
      await db.properties.add(prop)
      await enqueueSyncItem('properties', 'insert', prop.id, prop as unknown as Record<string, unknown>)
    }
    setSaving(false)
    onSaved(prop)
  }

  return (
    <Card className="mb-3 flex flex-col gap-3">
      <h4 className="font-medium text-gray-700">{existing ? 'Editar propriedade' : 'Nova propriedade'}</h4>
      <input
        className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
        placeholder="Nome da propriedade *"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
        placeholder="Município *"
        value={municipality}
        onChange={(e) => setMunicipality(e.target.value)}
      />
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="Área (ha)"
          type="number"
          value={areaHa}
          onChange={(e) => setAreaHa(e.target.value)}
        />
        <input
          className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="Código CAR"
          value={carCode}
          onChange={(e) => setCarCode(e.target.value)}
        />
      </div>
      {/* GPS da propriedade */}
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <input
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Latitude"
            type="number"
            step="any"
            value={gpsLat}
            onChange={(e) => setGpsLat(e.target.value)}
          />
        </div>
        <div className="flex-1">
          <input
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Longitude"
            type="number"
            step="any"
            value={gpsLng}
            onChange={(e) => setGpsLng(e.target.value)}
          />
        </div>
        <Button variant="secondary" onClick={captureGps} loading={capturingGps} className="shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
          </svg>
        </Button>
      </div>
      <div className="flex gap-2">
        <Button onClick={save} loading={saving} disabled={!name || !municipality} className="flex-1">
          {existing ? 'Salvar alterações' : 'Salvar propriedade'}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        )}
      </div>
    </Card>
  )
}
