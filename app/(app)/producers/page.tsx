'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { db } from '@/lib/db/dexie'
import { TopBar } from '@/components/layout/top-bar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { Producer } from '@/types'

export default function ProducersPage() {
  const [producers, setProducers] = useState<Producer[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function load() {
      const all = await db.producers.orderBy('name').toArray()
      setProducers(all)
    }
    load()
  }, [])

  const filtered = producers.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
      <TopBar
        title="Produtores"
        action={
          <Link href="/producers/new">
            <Button size="sm">+ Novo</Button>
          </Link>
        }
      />
      <div className="px-4 py-4 flex flex-col gap-4">
        <input
          type="search"
          placeholder="Buscar produtor..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
        />

        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg">Nenhum produtor cadastrado</p>
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
                    <p className="font-semibold text-gray-900 truncate">{producer.name}</p>
                    {producer.phone && (
                      <p className="text-sm text-gray-500">{producer.phone}</p>
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
