'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { v4 as uuidv4 } from 'uuid'
import { db, enqueueSyncItem } from '@/lib/db/dexie'
import { useAuthStore } from '@/stores/auth.store'
import { TopBar } from '@/components/layout/top-bar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Producer } from '@/types'
import { parseProducersCSV, type ProducerCSVRow } from '@/lib/utils/csv-import-producers'

export default function ProducersPage() {
  const { workspace } = useAuthStore()
  const [producers, setProducers] = useState<Producer[]>([])
  const [search, setSearch] = useState('')

  // CSV import state
  const csvInputRef = useRef<HTMLInputElement>(null)
  const [csvPreview, setCsvPreview] = useState<ProducerCSVRow[] | null>(null)
  const [csvErrors, setCsvErrors] = useState<string[]>([])
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    db.producers.orderBy('name').toArray().then(setProducers)
  }, [])

  const filtered = producers.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.city ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (p.cpf_cnpj ?? '').includes(search)
  )

  async function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const { rows, errors } = parseProducersCSV(text)
    setCsvPreview(rows)
    setCsvErrors(errors)
    e.target.value = ''
  }

  async function confirmImport() {
    if (!csvPreview || !workspace) return
    setImporting(true)
    const now = new Date().toISOString()

    for (const row of csvPreview) {
      const id = uuidv4()
      const producer: Producer = {
        id,
        workspace_id: workspace.id,
        name:     row.name,
        phone:    row.phone,
        email:    row.email,
        cpf_cnpj: row.cpf_cnpj,
        sex:      row.sex,
        state:    row.state,
        city:     row.city,
        locality: row.locality,
        status:   row.status,
        notes:    row.notes,
        created_at: now,
        updated_at: now,
      }
      await db.producers.add(producer)
      await enqueueSyncItem('producers', 'insert', id, producer as unknown as Record<string, unknown>)
    }

    const all = await db.producers.orderBy('name').toArray()
    setProducers(all)
    setCsvPreview(null)
    setCsvErrors([])
    setImporting(false)
  }

  return (
    <>
      <TopBar
        title="Produtores"
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => csvInputRef.current?.click()}>
              Importar CSV
            </Button>
            <Link href="/producers/new">
              <Button size="sm">+ Novo</Button>
            </Link>
          </div>
        }
      />

      <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvFile} />

      <div className="px-4 py-4 flex flex-col gap-4">

        {/* CSV preview */}
        {csvPreview !== null && (
          <Card className="border-brand-200 bg-brand-50">
            <h3 className="font-semibold text-gray-900 mb-1">
              {csvPreview.length} produtor{csvPreview.length !== 1 ? 'es' : ''} encontrado{csvPreview.length !== 1 ? 's' : ''} no CSV
            </h3>

            {csvErrors.length > 0 && (
              <div className="mb-3 p-3 bg-orange-50 rounded-xl border border-orange-200">
                <p className="text-xs font-medium text-orange-700 mb-1">Avisos de importação:</p>
                {csvErrors.map((e, i) => (
                  <p key={i} className="text-xs text-orange-600">{e}</p>
                ))}
              </div>
            )}

            {csvPreview.length > 0 && (
              <div className="mb-3 flex flex-col gap-1 max-h-48 overflow-y-auto">
                {csvPreview.map((row, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm py-1 border-b border-brand-100 last:border-0">
                    <span className="font-medium text-gray-800 flex-1 truncate">{row.name}</span>
                    {row.city && <span className="text-xs text-gray-500 shrink-0">{row.city}{row.state ? `/${row.state}` : ''}</span>}
                    <Badge variant={row.status === 'inactive' ? 'gray' : 'green'}>
                      {row.status === 'inactive' ? 'Inativo' : 'Ativo'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              {csvPreview.length > 0 && (
                <Button size="sm" loading={importing} onClick={confirmImport} className="flex-1">
                  Importar {csvPreview.length} produtor{csvPreview.length !== 1 ? 'es' : ''}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => { setCsvPreview(null); setCsvErrors([]) }}>
                Cancelar
              </Button>
            </div>
          </Card>
        )}

        {/* Search */}
        <input
          type="search"
          placeholder="Buscar por nome, cidade ou CPF/CNPJ..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
        />

        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg">Nenhum produtor encontrado</p>
            <Link href="/producers/new">
              <Button className="mt-4">Cadastrar produtor</Button>
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((producer) => (
              <Link key={producer.id} href={`/producers/${producer.id}`}>
                <Card className="flex items-center gap-3 active:scale-[0.98] transition-transform cursor-pointer">
                  <div className="w-12 h-12 bg-brand-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <span className="text-brand-700 font-bold text-lg">
                      {producer.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900 truncate">{producer.name}</p>
                      {producer.status === 'inactive' && (
                        <Badge variant="gray">Inativo</Badge>
                      )}
                    </div>
                    {(producer.city || producer.phone) && (
                      <p className="text-sm text-gray-500 truncate">
                        {[producer.city, producer.state].filter(Boolean).join('/') || producer.phone}
                      </p>
                    )}
                  </div>
                  <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
