'use client'
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { db } from '@/lib/db/dexie'
import { useAuthStore } from '@/stores/auth.store'
import { TopBar } from '@/components/layout/top-bar'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Visit, Producer } from '@/types'

type VisitWithProducer = Visit & { producer?: Producer }

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

function getVisitDate(v: Visit): string {
  return (v.scheduled_at ?? v.started_at).slice(0, 10)
}

export default function CalendarPage() {
  const { workspace } = useAuthStore()
  const [visits, setVisits] = useState<VisitWithProducer[]>([])
  const [today] = useState(() => new Date())
  const [cursor, setCursor] = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  useEffect(() => {
    if (!workspace) return
    async function load() {
      const vs = await db.visits.where('workspace_id').equals(workspace!.id).toArray()
      const enriched = await Promise.all(vs.map(async (v) => ({
        ...v,
        producer: await db.producers.get(v.producer_id),
      })))
      setVisits(enriched)
    }
    load()
  }, [workspace])

  const year = cursor.getFullYear()
  const month = cursor.getMonth()

  const visitsByDay = useMemo(() => {
    const map = new Map<string, VisitWithProducer[]>()
    for (const v of visits) {
      const day = getVisitDate(v)
      if (!map.has(day)) map.set(day, [])
      map.get(day)!.push(v)
    }
    return map
  }, [visits])

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const todayStr = today.toISOString().slice(0, 10)

  function prevMonth() {
    setCursor(new Date(year, month - 1, 1))
    setSelectedDay(null)
  }
  function nextMonth() {
    setCursor(new Date(year, month + 1, 1))
    setSelectedDay(null)
  }

  const selectedVisits = selectedDay ? (visitsByDay.get(selectedDay) ?? []) : []

  return (
    <>
      <TopBar title="Calendário" backHref="/visits" />
      <div className="px-4 py-4 flex flex-col gap-4">

        {/* Month header */}
        <div className="flex items-center justify-between">
          <button onClick={prevMonth} className="p-2 rounded-xl hover:bg-gray-100">
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <p className="font-semibold text-gray-900">{MONTHS[month]} {year}</p>
          <button onClick={nextMonth} className="p-2 rounded-xl hover:bg-gray-100">
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Calendar grid */}
        <Card padding="sm">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map((d, i) => (
              <div key={i} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7 gap-y-1">
            {/* Empty cells before month start */}
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const dayVisits = visitsByDay.get(dayStr) ?? []
              const isToday = dayStr === todayStr
              const isSelected = dayStr === selectedDay

              return (
                <button
                  key={day}
                  onClick={() => setSelectedDay(isSelected ? null : dayStr)}
                  className={`flex flex-col items-center py-1 rounded-lg transition-colors ${
                    isSelected ? 'bg-brand-600 text-white' :
                    isToday ? 'bg-brand-100 text-brand-700' :
                    'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  <span className="text-sm font-medium">{day}</span>
                  {dayVisits.length > 0 && (
                    <div className="flex gap-0.5 mt-0.5">
                      {dayVisits.slice(0, 3).map((v, j) => (
                        <span
                          key={j}
                          className={`w-1.5 h-1.5 rounded-full ${
                            isSelected ? 'bg-white' :
                            v.status === 'scheduled' ? 'bg-orange-400' :
                            v.status === 'completed' ? 'bg-green-500' :
                            'bg-brand-500'
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </Card>

        {/* Legend */}
        <div className="flex gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-brand-500" />Ativa</div>
          <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />Concluída</div>
          <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400" />Agendada</div>
        </div>

        {/* Selected day visits */}
        {selectedDay && (
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">
              {new Date(selectedDay + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h3>
            {selectedVisits.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhuma visita neste dia</p>
            ) : (
              <div className="flex flex-col gap-2">
                {selectedVisits.map((v) => (
                  <Link key={v.id} href={`/visits/${v.id}`}>
                    <Card padding="sm" className="flex items-center gap-3 cursor-pointer active:scale-[0.98] transition-transform">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm truncate">{v.producer?.name ?? '—'}</p>
                        <p className="text-xs text-gray-500">
                          {v.scheduled_at ? `Agendada: ${new Date(v.scheduled_at).toLocaleDateString('pt-BR')}` : new Date(v.started_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <Badge variant={v.status === 'completed' ? 'gray' : v.status === 'scheduled' ? 'yellow' : 'green'}>
                        {v.status === 'active' ? 'Ativa' : v.status === 'scheduled' ? 'Agendada' : 'Concluída'}
                      </Badge>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* New scheduled visit */}
        <Link href="/visits/new">
          <button className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors">
            + Agendar nova visita
          </button>
        </Link>
      </div>
    </>
  )
}
