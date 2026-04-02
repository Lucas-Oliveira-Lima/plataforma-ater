'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { db } from '@/lib/db/dexie'
import { TopBar } from '@/components/layout/top-bar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Form } from '@/types'
import { formatDate } from '@/lib/utils/dates'

export default function FormsPage() {
  const [forms, setForms] = useState<Form[]>([])

  useEffect(() => {
    db.forms.orderBy('created_at').reverse().toArray().then(setForms)
  }, [])

  return (
    <>
      <TopBar
        title="Formulários"
        action={
          <Link href="/forms/new">
            <Button size="sm">+ Novo</Button>
          </Link>
        }
      />
      <div className="px-4 py-4 flex flex-col gap-3">
        {forms.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg mb-4">Nenhum formulário criado</p>
            <Link href="/forms/new">
              <Button>Criar formulário</Button>
            </Link>
          </div>
        ) : (
          forms.map((form) => (
            <Link key={form.id} href={`/forms/${form.id}`}>
              <Card className="flex items-center gap-3 active:scale-[0.98] transition-transform cursor-pointer">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{form.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant={form.is_active ? 'green' : 'gray'}>
                      {form.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                    <span className="text-xs text-gray-400">{formatDate(form.created_at)}</span>
                  </div>
                </div>
                <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </Card>
            </Link>
          ))
        )}
      </div>
    </>
  )
}
