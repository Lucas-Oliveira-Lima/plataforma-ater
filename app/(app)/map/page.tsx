'use client'
import { useEffect, useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { db } from '@/lib/db/dexie'
import { useAuthStore } from '@/stores/auth.store'
import { TopBar } from '@/components/layout/top-bar'
import type { Property, Producer } from '@/types'

const PropertiesMap = dynamic(() => import('@/components/map/properties-map'), { ssr: false })

export default function MapPage() {
  const { workspace } = useAuthStore()
  const [properties, setProperties] = useState<(Property & { producer?: Producer })[]>([])
  const [producers, setProducers] = useState<Producer[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProducerId, setSelectedProducerId] = useState('')

  useEffect(() => {
    async function load() {
      if (!workspace) return
      const [props, prods] = await Promise.all([
        db.properties.where('workspace_id').equals(workspace.id).toArray(),
        db.producers.where('workspace_id').equals(workspace.id).toArray(),
      ])
      const producerMap = new Map(prods.map((p) => [p.id, p]))
      setProperties(props.map((p) => ({ ...p, producer: producerMap.get(p.producer_id) })))
      setProducers(prods)
      setLoading(false)
    }
    load()
  }, [workspace])

  const filtered = useMemo(() =>
    selectedProducerId
      ? properties.filter((p) => p.producer_id === selectedProducerId)
      : properties,
    [properties, selectedProducerId]
  )

  const withGps = filtered.filter((p) => p.gps_lat !== null && p.gps_lng !== null)

  return (
    <>
      <TopBar title="Mapa de Propriedades" backHref="/dashboard" />
      <div className="px-4 py-4 flex flex-col gap-4">

        {/* Filter */}
        <div className="flex items-center gap-2">
          <select
            className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
            value={selectedProducerId}
            onChange={(e) => setSelectedProducerId(e.target.value)}
          >
            <option value="">Todos os produtores ({properties.filter(p => p.gps_lat !== null).length} propriedades)</option>
            {producers.map((p) => {
              const count = properties.filter((prop) => prop.producer_id === p.id && prop.gps_lat !== null).length
              return (
                <option key={p.id} value={p.id}>
                  {p.name} ({count} propriedade{count !== 1 ? 's' : ''})
                </option>
              )
            })}
          </select>
          {selectedProducerId && (
            <button
              onClick={() => setSelectedProducerId('')}
              className="p-3 text-gray-400 hover:text-gray-600 rounded-xl border border-gray-200"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <p className="text-sm text-gray-500 -mt-2">
          {withGps.length} de {filtered.length} propriedade{filtered.length !== 1 ? 's' : ''} com GPS
        </p>

        {loading ? (
          <div className="h-80 flex items-center justify-center text-gray-400 text-sm">
            Carregando mapa...
          </div>
        ) : withGps.length === 0 ? (
          <div className="h-80 flex flex-col items-center justify-center text-gray-400 gap-2">
            <svg className="w-12 h-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
            </svg>
            <p className="text-sm">
              {selectedProducerId ? 'Este produtor não tem propriedades com GPS' : 'Nenhuma propriedade com GPS cadastrada'}
            </p>
          </div>
        ) : (
          <div className="h-[calc(100vh-240px)] rounded-xl overflow-hidden border border-gray-200">
            <PropertiesMap
              properties={filtered}
              zoom={withGps.length === 1 ? 13 : 7}
            />
          </div>
        )}

        {withGps.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="font-medium text-gray-800 text-sm">
              Propriedades no mapa {selectedProducerId && `— ${producers.find(p => p.id === selectedProducerId)?.name}`}
            </h3>
            {withGps.map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                <span className="w-3 h-3 rounded-full bg-brand-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-800">{p.name}</p>
                  <p className="text-xs text-gray-500">{p.producer?.name} · {p.municipality}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
