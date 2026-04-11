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
import { Badge } from '@/components/ui/badge'
import type { Profile, Visit, Producer, Property, Crop, FinancialRecord, CacauObservacoesTecnicas } from '@/types'
import {
  calcNotaAnaliseTecnica, calcNotaBoasPraticas,
  CULTURE_OPTIONS,
} from '@/lib/utils/cacau-scores'

interface TechStats {
  profile: Profile
  visitsTotal: number
  visitsDone: number
  visitsPending: number
  cacauCropsCount: number
  avgScoreCSCacau: number | null
}

interface FinancialSummary {
  totalReceitas: number
  totalDespesas: number
  margem: number
  recordCount: number
  topProducersByRevenue: { name: string; receita: number }[]
}

interface CacauSummary {
  totalCrops: number
  avgProductivity: number | null
  benchmarkKgHa: number
  avgScoreCSCacau: number | null
  producersAboveBenchmark: number
  cropsByStatus: Record<string, number>
  municipioBreakdown: { municipio: string; count: number }[]
}

export default function AdminPage() {
  const router = useRouter()
  const { profile, workspace } = useAuthStore()
  const [techStats, setTechStats] = useState<TechStats[]>([])
  const [financialSummary, setFinancialSummary] = useState<FinancialSummary | null>(null)
  const [cacauSummary, setCacauSummary] = useState<CacauSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [activeTab, setActiveTab] = useState<'geral' | 'financeiro' | 'cacau'>('geral')
  const [showKoboImport, setShowKoboImport] = useState(false)
  const [koboImporting, setKoboImporting] = useState(false)
  const [koboResult, setKoboResult] = useState<{ created: number; updated: number; errors: string[] } | null>(null)

  useEffect(() => {
    if (!profile) return
    if (profile.role !== 'admin') { router.replace('/dashboard'); return }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile])

  async function load() {
    if (!workspace) return
    const supabase = createClient()

    // ── Técnicos ─────────────────────────────────────────────
    const { data: members } = await supabase
      .from('profiles')
      .select('*')
      .eq('workspace_id', workspace.id)
      .order('full_name')

    if (!members) { setLoading(false); return }

    // ── Dados locais (offline-first) ─────────────────────────
    const [visits, crops, financials, cacauObsList] = await Promise.all([
      db.visits.toArray(),
      db.crops.toArray(),
      db.financial_records.toArray(),
      db.cacau_observacoes_tecnicas.toArray(),
    ])

    // ── TechStats ────────────────────────────────────────────
    const visitsByTech = new Map<string, Visit[]>()
    for (const v of visits) {
      const list = visitsByTech.get(v.technician_id) ?? []
      list.push(v)
      visitsByTech.set(v.technician_id, list)
    }

    // Mapear obs por visita para calcular score por técnico
    const obsByVisit = new Map(cacauObsList.map((o) => [o.visit_id, o]))

    const stats: TechStats[] = (members as Profile[]).map((m) => {
      const memberVisits = visitsByTech.get(m.id) ?? []
      const cacauCrops = crops.filter((c) => {
        return memberVisits.some((v) => v.producer_id === c.producer_id) && c.culture === 'cacau'
      })

      const scores: number[] = memberVisits
        .map((v) => obsByVisit.get(v.id))
        .filter((o): o is CacauObservacoesTecnicas => !!o)
        .map((o) => (calcNotaAnaliseTecnica(o) + calcNotaBoasPraticas(o)) / 2)

      return {
        profile: m,
        visitsTotal: memberVisits.length,
        visitsDone: memberVisits.filter((v) => v.status === 'completed').length,
        visitsPending: memberVisits.filter((v) => v.status === 'active' || v.status === 'scheduled').length,
        cacauCropsCount: cacauCrops.length,
        avgScoreCSCacau: scores.length > 0 ? scores.reduce((s, v) => s + v, 0) / scores.length : null,
      }
    })
    setTechStats(stats)

    // ── Financeiro ───────────────────────────────────────────
    const totalReceitas = financials.filter((f) => f.type === 'receita').reduce((s, f) => s + f.amount, 0)
    const totalDespesas = financials.filter((f) => f.type === 'despesa').reduce((s, f) => s + f.amount, 0)

    // Top produtores por receita
    const revByProducer = new Map<string, number>()
    for (const f of financials.filter((f) => f.type === 'receita')) {
      revByProducer.set(f.producer_id, (revByProducer.get(f.producer_id) ?? 0) + f.amount)
    }
    const producers = await db.producers.toArray()
    const producerMap = new Map(producers.map((p) => [p.id, p]))
    const topProducers = [...revByProducer.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, receita]) => ({ name: producerMap.get(id)?.name ?? 'Desconhecido', receita }))

    setFinancialSummary({
      totalReceitas,
      totalDespesas,
      margem: totalReceitas - totalDespesas,
      recordCount: financials.length,
      topProducersByRevenue: topProducers,
    })

    // ── CSCacau ───────────────────────────────────────────────
    const cacauCrops = crops.filter((c) => c.culture === 'cacau')
    const benchmarkKgHa = workspace.cacau_benchmark_kg_ha ?? 847

    const produtividades = cacauCrops
      .filter((c) => c.producao_ano_anterior_kg !== null && c.area_cacau_producao_ha !== null && c.area_cacau_producao_ha! > 0)
      .map((c) => c.producao_ano_anterior_kg! / c.area_cacau_producao_ha!)

    const avgProductivity = produtividades.length > 0
      ? produtividades.reduce((s, v) => s + v, 0) / produtividades.length
      : null

    const producersAboveBenchmark = produtividades.filter((p) => p >= benchmarkKgHa).length

    const allScores = cacauObsList.map((o) => (calcNotaAnaliseTecnica(o) + calcNotaBoasPraticas(o)) / 2)
    const avgScoreCSCacau = allScores.length > 0
      ? allScores.reduce((s, v) => s + v, 0) / allScores.length
      : null

    const cropsByStatus: Record<string, number> = {}
    for (const c of cacauCrops) {
      cropsByStatus[c.status] = (cropsByStatus[c.status] ?? 0) + 1
    }

    // Distribuição por município
    const muniCount = new Map<string, number>()
    for (const c of cacauCrops) {
      const prod = producerMap.get(c.producer_id)
      const muni = prod?.city ?? 'Não informado'
      muniCount.set(muni, (muniCount.get(muni) ?? 0) + 1)
    }
    const municipioBreakdown = [...muniCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([municipio, count]) => ({ municipio, count }))

    setCacauSummary({
      totalCrops: cacauCrops.length,
      avgProductivity,
      benchmarkKgHa,
      avgScoreCSCacau,
      producersAboveBenchmark,
      cropsByStatus,
      municipioBreakdown,
    })

    setLoading(false)
  }

  async function handleExport() {
    if (!workspace) return
    setExporting(true)
    try {
      const [producers, properties, visits, crops, financials, cacauObsList] = await Promise.all([
        db.producers.toArray(),
        db.properties.toArray(),
        db.visits.toArray(),
        db.crops.toArray(),
        db.financial_records.toArray(),
        db.cacau_observacoes_tecnicas.toArray(),
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
      const enrichedCrops = crops.map((c) => ({
        ...c,
        producer_name: producerMap.get(c.producer_id)?.name,
        property_name: c.property_id ? propMap.get(c.property_id)?.name : undefined,
      }))
      const enrichedFinancials = financials.map((f) => ({
        ...f,
        producer_name: producerMap.get(f.producer_id)?.name,
      }))

      const { exportToExcel } = await import('@/lib/utils/export-excel')
      await exportToExcel({
        producers,
        properties: enrichedProperties,
        visits: enrichedVisits,
        crops: enrichedCrops,
        financials: enrichedFinancials,
        cacauObsList,
      }, workspace.name)
    } finally {
      setExporting(false)
    }
  }

  async function handleKoboImport(formType: 'diagnostico' | 'visita_cacau', file: File) {
    setKoboImporting(true)
    setKoboResult(null)
    try {
      const text = await file.text()
      const submissions = JSON.parse(text)
      const arr = Array.isArray(submissions) ? submissions : submissions.results ?? [submissions]

      const res = await fetch('/api/kobo/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form_type: formType, submissions: arr }),
      })
      const data = await res.json()
      setKoboResult(data)
      if (res.ok) load()
    } catch (err) {
      setKoboResult({ created: 0, updated: 0, errors: [String(err)] })
    } finally {
      setKoboImporting(false)
    }
  }

  const totalVisits = techStats.reduce((s, t) => s + t.visitsTotal, 0)
  const totalDone = techStats.reduce((s, t) => s + t.visitsDone, 0)

  return (
    <>
      <TopBar title="Painel Admin" backHref="/dashboard" />
      <div className="px-4 py-4 flex flex-col gap-4">

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          <Card padding="sm">
            <p className="text-2xl font-bold text-gray-900">{techStats.length}</p>
            <p className="text-xs text-gray-500">Técnicos</p>
          </Card>
          <Card padding="sm">
            <p className="text-2xl font-bold text-gray-900">{totalVisits}</p>
            <p className="text-xs text-gray-500">Visitas totais</p>
          </Card>
          <Card padding="sm">
            <p className="text-2xl font-bold text-green-600">{totalDone}</p>
            <p className="text-xs text-gray-500">Concluídas</p>
          </Card>
          <Card padding="sm">
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
              <span className="text-sm font-medium text-gray-700">Técnicos</span>
            </Card>
          </Link>
          <Link href="/admin/checklist" className="flex-1">
            <Card padding="sm" className="flex items-center gap-2 cursor-pointer">
              <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium text-gray-700">Checklist</span>
            </Card>
          </Link>
        </div>

        {/* Export */}
        <Button variant="secondary" onClick={handleExport} loading={exporting}>
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          {exporting ? 'Exportando...' : 'Exportar dados completos (Excel)'}
        </Button>

        {/* Kobo Import */}
        <Card padding="sm">
          <button
            className="w-full flex items-center justify-between"
            onClick={() => { setShowKoboImport((v) => !v); setKoboResult(null) }}
          >
            <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <svg className="w-4 h-4 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              Importar dados do KoboToolbox
            </span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${showKoboImport ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showKoboImport && (
            <div className="mt-4 flex flex-col gap-4">
              <p className="text-xs text-gray-500">
                Exporte as submissões do KoboToolbox em formato <strong>JSON</strong> e importe aqui.
                Use <em>Diagnóstico</em> para criar/atualizar produtores e propriedades;
                use <em>Visita Técnica</em> para importar visitas, safras e observações CSCacau.
              </p>

              <KoboFileInput
                label="Formulário de Diagnóstico / Linha de Base"
                description="Cria ou atualiza produtores e propriedades"
                accept=".json"
                loading={koboImporting}
                onFile={(file) => handleKoboImport('diagnostico', file)}
              />

              <KoboFileInput
                label="Formulário de Visita Técnica de Cacau"
                description="Importa visitas, safras cacau e observações CSCacau"
                accept=".json"
                loading={koboImporting}
                onFile={(file) => handleKoboImport('visita_cacau', file)}
              />

              {koboImporting && (
                <p className="text-sm text-brand-600 text-center animate-pulse">Importando submissões...</p>
              )}

              {koboResult && (
                <div className={`rounded-xl p-3 text-sm ${koboResult.errors.length > 0 ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'}`}>
                  <p className="font-semibold mb-1">
                    {koboResult.errors.length === 0 ? 'Importação concluída' : 'Importação com avisos'}
                  </p>
                  <p className="text-gray-600">
                    {koboResult.created} criados · {koboResult.updated} atualizados
                  </p>
                  {koboResult.errors.length > 0 && (
                    <details className="mt-2">
                      <summary className="text-xs text-yellow-700 cursor-pointer">{koboResult.errors.length} erro(s)</summary>
                      <ul className="mt-1 space-y-1">
                        {koboResult.errors.map((e, i) => (
                          <li key={i} className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">{e}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {(['geral', 'financeiro', 'cacau'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'border-b-2 border-brand-600 text-brand-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'geral' ? 'Geral' : tab === 'financeiro' ? 'Financeiro' : 'CSCacau'}
            </button>
          ))}
        </div>

        {/* ── Tab: Geral (técnicos) ──────────────────────── */}
        {activeTab === 'geral' && (
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
                    <div className="grid grid-cols-4 gap-2 text-center">
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
                      <div>
                        <p className="text-lg font-bold text-amber-700">{t.avgScoreCSCacau !== null ? t.avgScoreCSCacau.toFixed(1) : '—'}</p>
                        <p className="text-xs text-gray-500">CSCacau</p>
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
        )}

        {/* ── Tab: Financeiro ───────────────────────────── */}
        {activeTab === 'financeiro' && (
          <div className="flex flex-col gap-4">
            {financialSummary === null || financialSummary.recordCount === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">
                Nenhum registro financeiro cadastrado ainda.
              </p>
            ) : (
              <>
                {/* Resumo financeiro */}
                <div className="grid grid-cols-3 gap-3">
                  <Card padding="sm" className="text-center">
                    <p className="text-lg font-bold text-green-700">
                      R$ {financialSummary.totalReceitas.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </p>
                    <p className="text-xs text-gray-500">Receitas</p>
                  </Card>
                  <Card padding="sm" className="text-center">
                    <p className="text-lg font-bold text-red-700">
                      R$ {financialSummary.totalDespesas.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </p>
                    <p className="text-xs text-gray-500">Despesas</p>
                  </Card>
                  <Card padding="sm" className="text-center">
                    <p className={`text-lg font-bold ${financialSummary.margem >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                      R$ {financialSummary.margem.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </p>
                    <p className="text-xs text-gray-500">Margem</p>
                  </Card>
                </div>

                <p className="text-xs text-gray-400 text-center">
                  {financialSummary.recordCount} registros financeiros no período
                </p>

                {/* Top produtores por receita */}
                {financialSummary.topProducersByRevenue.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Top produtores por receita</h4>
                    <div className="flex flex-col gap-2">
                      {financialSummary.topProducersByRevenue.map((p, i) => (
                        <Card key={i} padding="sm" className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-green-700">{i + 1}</span>
                          </div>
                          <p className="flex-1 text-sm font-medium text-gray-900 truncate">{p.name}</p>
                          <p className="text-sm font-semibold text-green-700 shrink-0">
                            R$ {p.receita.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Tab: CSCacau ──────────────────────────────── */}
        {activeTab === 'cacau' && (
          <div className="flex flex-col gap-4">
            {cacauSummary === null || cacauSummary.totalCrops === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">
                Nenhuma safra de cacau cadastrada ainda.
              </p>
            ) : (
              <>
                {/* KPIs principais */}
                <div className="grid grid-cols-2 gap-3">
                  <Card padding="sm" className="text-center">
                    <p className="text-2xl font-bold text-amber-700">{cacauSummary.totalCrops}</p>
                    <p className="text-xs text-gray-500">Lavouras de cacau</p>
                  </Card>
                  <Card padding="sm" className="text-center">
                    <p className="text-2xl font-bold text-amber-700">
                      {cacauSummary.avgScoreCSCacau !== null ? cacauSummary.avgScoreCSCacau.toFixed(1) : '—'}
                    </p>
                    <p className="text-xs text-gray-500">Score CSCacau médio</p>
                  </Card>
                  <Card padding="sm" className="text-center">
                    <p className="text-2xl font-bold text-gray-900">
                      {cacauSummary.avgProductivity !== null
                        ? `${cacauSummary.avgProductivity.toFixed(0)} kg/ha`
                        : '—'}
                    </p>
                    <p className="text-xs text-gray-500">Produtividade média</p>
                  </Card>
                  <Card padding="sm" className="text-center">
                    <p className="text-2xl font-bold text-gray-500">{cacauSummary.benchmarkKgHa} kg/ha</p>
                    <p className="text-xs text-gray-500">Benchmark regional</p>
                  </Card>
                </div>

                {/* Gap vs benchmark */}
                {cacauSummary.avgProductivity !== null && (
                  <Card>
                    <p className="font-medium text-gray-900 mb-3">Produtividade vs Benchmark</p>
                    <div className="flex flex-col gap-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Produtividade média</span>
                        <span className="font-semibold">{cacauSummary.avgProductivity.toFixed(0)} kg/ha</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-3 relative">
                        <div
                          className="h-3 rounded-full bg-amber-500 transition-all"
                          style={{ width: `${Math.min(100, (cacauSummary.avgProductivity / (cacauSummary.benchmarkKgHa * 1.5)) * 100)}%` }}
                        />
                        {/* Marcador do benchmark */}
                        <div
                          className="absolute top-0 h-3 w-0.5 bg-green-600"
                          style={{ left: `${Math.min(100, (cacauSummary.benchmarkKgHa / (cacauSummary.benchmarkKgHa * 1.5)) * 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-gray-400">
                        <span>0</span>
                        <span className="text-green-600">▲ Benchmark {cacauSummary.benchmarkKgHa} kg/ha</span>
                        <span>{(cacauSummary.benchmarkKgHa * 1.5).toFixed(0)}</span>
                      </div>
                      <div className="flex justify-between text-sm mt-1">
                        <span className="text-gray-600">Gap médio</span>
                        <span className={`font-semibold ${cacauSummary.avgProductivity >= cacauSummary.benchmarkKgHa ? 'text-green-600' : 'text-red-600'}`}>
                          {cacauSummary.avgProductivity >= cacauSummary.benchmarkKgHa
                            ? `+${(cacauSummary.avgProductivity - cacauSummary.benchmarkKgHa).toFixed(0)} kg/ha acima`
                            : `-${(cacauSummary.benchmarkKgHa - cacauSummary.avgProductivity).toFixed(0)} kg/ha abaixo`}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400">
                        {cacauSummary.producersAboveBenchmark} de {cacauSummary.totalCrops} produtores atingem o benchmark
                      </p>
                    </div>
                  </Card>
                )}

                {/* Status das lavouras */}
                {Object.keys(cacauSummary.cropsByStatus).length > 0 && (
                  <Card>
                    <p className="font-medium text-gray-900 mb-3">Status das lavouras</p>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(cacauSummary.cropsByStatus).map(([status, count]) => {
                        const labels: Record<string, string> = {
                          planejada: 'Planejadas', em_andamento: 'Em andamento',
                          colhida: 'Colhidas', perdida: 'Perdidas',
                        }
                        const colors: Record<string, string> = {
                          planejada: 'bg-yellow-50 text-yellow-700',
                          em_andamento: 'bg-green-50 text-green-700',
                          colhida: 'bg-gray-50 text-gray-700',
                          perdida: 'bg-red-50 text-red-700',
                        }
                        return (
                          <div key={status} className={`rounded-xl p-3 text-center ${colors[status] ?? 'bg-gray-50 text-gray-700'}`}>
                            <p className="text-xl font-bold">{count}</p>
                            <p className="text-xs">{labels[status] ?? status}</p>
                          </div>
                        )
                      })}
                    </div>
                  </Card>
                )}

                {/* Distribuição por município */}
                {cacauSummary.municipioBreakdown.length > 0 && (
                  <Card>
                    <p className="font-medium text-gray-900 mb-3">Distribuição por município</p>
                    <div className="flex flex-col gap-2">
                      {cacauSummary.municipioBreakdown.map(({ municipio, count }) => {
                        const pct = Math.round((count / cacauSummary.totalCrops) * 100)
                        return (
                          <div key={municipio}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-gray-700 truncate">{municipio}</span>
                              <span className="text-gray-500 shrink-0 ml-2">{count} ({pct}%)</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-1.5">
                              <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </Card>
                )}

                {/* Score CSCacau por técnico */}
                {techStats.some((t) => t.avgScoreCSCacau !== null) && (
                  <Card>
                    <p className="font-medium text-gray-900 mb-3">Score CSCacau por técnico</p>
                    <div className="flex flex-col gap-3">
                      {techStats
                        .filter((t) => t.avgScoreCSCacau !== null)
                        .sort((a, b) => (b.avgScoreCSCacau ?? 0) - (a.avgScoreCSCacau ?? 0))
                        .map((t) => (
                          <div key={t.profile.id} className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                              <span className="text-xs font-bold text-amber-700">
                                {t.profile.full_name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between text-sm mb-1">
                                <span className="text-gray-700 truncate">{t.profile.full_name}</span>
                                <span className="font-semibold text-amber-700 shrink-0 ml-2">
                                  {t.avgScoreCSCacau!.toFixed(1)}/10
                                </span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-2">
                                <div
                                  className="bg-amber-500 h-2 rounded-full"
                                  style={{ width: `${(t.avgScoreCSCacau! / 10) * 100}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        ))
                      }
                    </div>
                  </Card>
                )}
              </>
            )}
          </div>
        )}

      </div>
    </>
  )
}

// ── KoboFileInput ─────────────────────────────────────────────
function KoboFileInput({ label, description, accept, loading, onFile }: {
  label: string
  description: string
  accept: string
  loading: boolean
  onFile: (file: File) => void
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-700 mb-0.5">{label}</p>
      <p className="text-xs text-gray-400 mb-2">{description}</p>
      <label className={`flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl border-2 border-dashed transition-colors cursor-pointer text-sm font-medium
        ${loading ? 'border-gray-200 text-gray-300 pointer-events-none' : 'border-brand-300 text-brand-600 hover:bg-brand-50'}`}>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        Selecionar arquivo JSON
        <input
          type="file"
          accept={accept}
          className="hidden"
          disabled={loading}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) { onFile(f); e.target.value = '' } }}
        />
      </label>
    </div>
  )
}
