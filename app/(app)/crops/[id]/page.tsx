'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { db, enqueueSyncItem } from '@/lib/db/dexie'
import { useAuthStore } from '@/stores/auth.store'
import { TopBar } from '@/components/layout/top-bar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Crop, Producer, Property, FinancialRecord } from '@/types'
import { formatDate } from '@/lib/utils/dates'
import {
  CULTURE_OPTIONS, CROP_STATUS_LABELS, CROP_STATUS_COLORS,
  DESPESA_CATEGORIES, RECEITA_CATEGORIES,
  CACAU_SUBCATEGORIES_INSUMOS, CACAU_SUBCATEGORIES_SERVICOS,
} from '@/lib/utils/cacau-scores'
import { v4 as uuidv4 } from 'uuid'

const SEASON_TYPE_LABELS: Record<string, string> = {
  verao: 'Verão', inverno: 'Inverno', anual: 'Anual', perene: 'Perene',
}

const CROP_STATUS_OPTIONS = [
  { value: 'planejada',    label: 'Planejada' },
  { value: 'em_andamento', label: 'Em andamento' },
  { value: 'colhida',      label: 'Colhida' },
  { value: 'perdida',      label: 'Perdida' },
]

export default function CropDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { workspace } = useAuthStore()
  const [crop, setCrop] = useState<Crop | null>(null)
  const [producer, setProducer] = useState<Producer | null>(null)
  const [property, setProperty] = useState<Property | null>(null)
  const [financials, setFinancials] = useState<FinancialRecord[]>([])
  const [editing, setEditing] = useState(false)
  const [showFinancialForm, setShowFinancialForm] = useState(false)

  useEffect(() => {
    async function load() {
      const c = await db.crops.get(id)
      if (!c) { router.back(); return }
      setCrop(c)
      const [prod, prop, fins] = await Promise.all([
        db.producers.get(c.producer_id),
        c.property_id ? db.properties.get(c.property_id) : Promise.resolve(undefined),
        db.financial_records.where('crop_id').equals(id).toArray(),
      ])
      setProducer(prod ?? null)
      setProperty(prop ?? null)
      setFinancials(fins)
    }
    load()
  }, [id, router])

  async function updateField(updates: Partial<Crop>) {
    if (!crop) return
    const now = new Date().toISOString()
    const updated = { ...updates, updated_at: now }
    await db.crops.update(id, updated)
    await enqueueSyncItem('crops', 'update', id, { id, ...updated })
    setCrop((prev) => prev ? { ...prev, ...updated } : prev)
  }

  async function deleteCrop() {
    if (!confirm('Excluir esta safra? Os registros financeiros vinculados serão mantidos.')) return
    await db.crops.delete(id)
    await enqueueSyncItem('crops', 'delete', id, { id })
    router.back()
  }

  const totalReceitas = financials.filter((f) => f.type === 'receita').reduce((s, f) => s + f.amount, 0)
  const totalDespesas = financials.filter((f) => f.type === 'despesa').reduce((s, f) => s + f.amount, 0)
  const margem = totalReceitas - totalDespesas

  const cultureName = CULTURE_OPTIONS.find((c) => c.value === crop?.culture)?.label ?? crop?.culture

  if (!crop) return <div className="p-8 text-center text-gray-400">Carregando...</div>

  return (
    <>
      <TopBar
        title={`${cultureName} ${crop.season_year}`}
        backHref={`/producers/${crop.producer_id}`}
        action={
          <Button size="sm" variant="ghost" onClick={() => setEditing(!editing)}>
            {editing ? 'Fechar' : 'Editar'}
          </Button>
        }
      />
      <div className="px-4 py-4 flex flex-col gap-4">

        {/* Header */}
        <Card>
          <div className="flex items-start justify-between gap-2 mb-3">
            <div>
              <p className="font-semibold text-gray-900 text-lg capitalize">{cultureName} — {crop.season_year}</p>
              {producer && <p className="text-sm text-gray-500">{producer.name}</p>}
              {property && <p className="text-xs text-gray-400">{property.name} · {property.municipality}</p>}
            </div>
            <Badge variant={CROP_STATUS_COLORS[crop.status]}>
              {CROP_STATUS_LABELS[crop.status]}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            {crop.planted_area_ha !== null && (
              <div><p className="text-xs text-gray-400">Área plantada</p><p className="font-medium">{crop.planted_area_ha} ha</p></div>
            )}
            {crop.season_type && (
              <div><p className="text-xs text-gray-400">Tipo de safra</p><p className="font-medium">{SEASON_TYPE_LABELS[crop.season_type]}</p></div>
            )}
            {crop.expected_production_kg !== null && (
              <div><p className="text-xs text-gray-400">Produção esperada</p><p className="font-medium">{crop.expected_production_kg.toLocaleString('pt-BR')} kg</p></div>
            )}
            {crop.actual_production_kg !== null && (
              <div><p className="text-xs text-gray-400">Produção real</p><p className="font-medium">{crop.actual_production_kg.toLocaleString('pt-BR')} kg</p></div>
            )}
            {crop.expected_yield_kg_ha !== null && (
              <div><p className="text-xs text-gray-400">Produt. esperada</p><p className="font-medium">{crop.expected_yield_kg_ha} kg/ha</p></div>
            )}
            {crop.actual_yield_kg_ha !== null && (
              <div><p className="text-xs text-gray-400">Produtividade real</p><p className="font-medium">{crop.actual_yield_kg_ha.toFixed(1)} kg/ha</p></div>
            )}
            {crop.sale_price_per_kg !== null && (
              <div><p className="text-xs text-gray-400">Preço médio</p><p className="font-medium">R$ {crop.sale_price_per_kg.toFixed(2)}/kg</p></div>
            )}
          </div>
        </Card>

        {/* Campos cacau */}
        {crop.culture === 'cacau' && (
          <Card>
            <p className="font-medium text-gray-900 mb-3">Dados de Cacau</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {crop.area_cacau_producao_ha !== null && (
                <div><p className="text-xs text-gray-400">Área em produção</p><p className="font-medium">{crop.area_cacau_producao_ha} ha</p></div>
              )}
              {crop.area_cacau_declarada_ha !== null && (
                <div><p className="text-xs text-gray-400">Área declarada</p><p className="font-medium">{crop.area_cacau_declarada_ha} ha</p></div>
              )}
              {crop.producao_ano_anterior_kg !== null && (
                <div><p className="text-xs text-gray-400">Produção ano anterior</p><p className="font-medium">{crop.producao_ano_anterior_kg.toLocaleString('pt-BR')} kg</p></div>
              )}
              {crop.producao_ano_atual_kg !== null && (
                <div><p className="text-xs text-gray-400">Estimativa ano atual</p><p className="font-medium">{crop.producao_ano_atual_kg.toLocaleString('pt-BR')} kg</p></div>
              )}
              {crop.preco_medio_kg !== null && (
                <div><p className="text-xs text-gray-400">Preço médio</p><p className="font-medium">R$ {crop.preco_medio_kg.toFixed(2)}/kg</p></div>
              )}
              {crop.numero_talhoes !== null && (
                <div><p className="text-xs text-gray-400">Nº talhões</p><p className="font-medium">{crop.numero_talhoes}</p></div>
              )}
            </div>

            {/* Teto produtivo */}
            {crop.teto_kg !== null && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Teto Produtivo</p>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div className="text-center bg-amber-50 rounded-xl p-2">
                    <p className="text-xs text-gray-400">Análise Técnica</p>
                    <p className="font-bold text-amber-700">{crop.nota_analise_tecnica?.toFixed(1)}</p>
                  </div>
                  <div className="text-center bg-amber-50 rounded-xl p-2">
                    <p className="text-xs text-gray-400">Boas Práticas</p>
                    <p className="font-bold text-amber-700">{crop.nota_boas_praticas?.toFixed(1)}</p>
                  </div>
                  <div className="text-center bg-amber-50 rounded-xl p-2">
                    <p className="text-xs text-gray-400">Coeficiente</p>
                    <p className="font-bold text-amber-700">{((crop.coeficiente_fazenda ?? 0) * 100).toFixed(0)}%</p>
                  </div>
                </div>
                <div className="mt-2 bg-green-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-400">Teto produtivo estimado</p>
                  <p className="text-lg font-bold text-green-700">{crop.teto_kg?.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} kg</p>
                  <p className="text-xs text-green-600">{crop.teto_kg_ha?.toFixed(0)} kg/ha</p>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Edição de campos */}
        {editing && (
          <CropEditForm crop={crop} onUpdate={updateField} />
        )}

        {/* Resumo financeiro */}
        {financials.length > 0 && (
          <Card>
            <p className="font-medium text-gray-900 mb-3">Resumo Financeiro</p>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="bg-green-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-400">Receitas</p>
                <p className="font-bold text-green-700">R$ {totalReceitas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-red-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-400">Despesas</p>
                <p className="font-bold text-red-700">R$ {totalDespesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className={`${margem >= 0 ? 'bg-blue-50' : 'bg-orange-50'} rounded-xl p-3 text-center`}>
                <p className="text-xs text-gray-400">Margem</p>
                <p className={`font-bold ${margem >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                  R$ {margem.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Lista de registros financeiros */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Registros Financeiros</h3>
            <Button variant="ghost" size="sm" onClick={() => setShowFinancialForm(!showFinancialForm)}>
              + Adicionar
            </Button>
          </div>

          {showFinancialForm && (
            <FinancialForm
              cropId={id}
              producerId={crop.producer_id}
              workspaceId={workspace?.id ?? ''}
              isCacau={crop.culture === 'cacau'}
              onSaved={(rec) => {
                setFinancials((prev) => [...prev, rec])
                setShowFinancialForm(false)
              }}
              onCancel={() => setShowFinancialForm(false)}
            />
          )}

          {financials.length === 0 && !showFinancialForm && (
            <p className="text-gray-400 text-sm py-4 text-center">Nenhum registro financeiro</p>
          )}

          <div className="flex flex-col gap-2">
            {financials.map((fin) => (
              <Card key={fin.id} padding="sm" className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${fin.type === 'receita' ? 'bg-green-100' : 'bg-red-100'}`}>
                  <span className={`text-sm font-bold ${fin.type === 'receita' ? 'text-green-700' : 'text-red-700'}`}>
                    {fin.type === 'receita' ? '+' : '-'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {fin.description || fin.subcategory || fin.category}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatDate(fin.reference_date)}
                    {fin.quantity && fin.unit ? ` · ${fin.quantity} ${fin.unit}` : ''}
                  </p>
                </div>
                <p className={`text-sm font-semibold shrink-0 ${fin.type === 'receita' ? 'text-green-700' : 'text-red-700'}`}>
                  R$ {fin.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </Card>
            ))}
          </div>
        </div>

        {/* Excluir safra */}
        <Button variant="danger" size="lg" onClick={deleteCrop} className="mt-2">
          Excluir safra
        </Button>
      </div>
    </>
  )
}

// ── Formulário de edição inline ────────────────────────────────
function CropEditForm({ crop, onUpdate }: { crop: Crop; onUpdate: (u: Partial<Crop>) => Promise<void> }) {
  const [status, setStatus] = useState(crop.status)
  const [plantedAreaHa, setPlantedAreaHa] = useState(crop.planted_area_ha?.toString() ?? '')
  const [expectedProductionKg, setExpectedProductionKg] = useState(crop.expected_production_kg?.toString() ?? '')
  const [actualProductionKg, setActualProductionKg] = useState(crop.actual_production_kg?.toString() ?? '')
  const [salePricePerKg, setSalePricePerKg] = useState(crop.sale_price_per_kg?.toString() ?? '')
  const [lossReason, setLossReason] = useState(crop.loss_reason ?? '')
  const [saving, setSaving] = useState(false)

  // Campos cacau
  const [areaCacauProducaoHa, setAreaCacauProducaoHa] = useState(crop.area_cacau_producao_ha?.toString() ?? '')
  const [areaCacauDeclaradaHa, setAreaCacauDeclaradaHa] = useState(crop.area_cacau_declarada_ha?.toString() ?? '')
  const [producaoAnoAnteriorKg, setProducaoAnoAnteriorKg] = useState(crop.producao_ano_anterior_kg?.toString() ?? '')
  const [producaoAnoAtualKg, setProducaoAnoAtualKg] = useState(crop.producao_ano_atual_kg?.toString() ?? '')
  const [precoMedioKg, setPrecoMedioKg] = useState(crop.preco_medio_kg?.toString() ?? '')
  const [sistemaProducao, setSistemaProducao] = useState(crop.sistema_producao ?? '')
  const [fazFermentacao, setFazFermentacao] = useState(crop.faz_fermentacao ?? '')

  async function save() {
    setSaving(true)
    const updates: Partial<Crop> = {
      status,
      planted_area_ha: plantedAreaHa ? parseFloat(plantedAreaHa) : null,
      expected_production_kg: expectedProductionKg ? parseFloat(expectedProductionKg) : null,
      actual_production_kg: actualProductionKg ? parseFloat(actualProductionKg) : null,
      sale_price_per_kg: salePricePerKg ? parseFloat(salePricePerKg) : null,
      loss_reason: status === 'perdida' ? lossReason || null : null,
    }
    if (crop.culture === 'cacau') {
      const areaProducao = areaCacauProducaoHa ? parseFloat(areaCacauProducaoHa) : null
      const prodAnt = producaoAnoAnteriorKg ? parseFloat(producaoAnoAnteriorKg) : null
      Object.assign(updates, {
        area_cacau_producao_ha: areaProducao,
        area_cacau_declarada_ha: areaCacauDeclaradaHa ? parseFloat(areaCacauDeclaradaHa) : null,
        producao_ano_anterior_kg: prodAnt,
        producao_ano_atual_kg: producaoAnoAtualKg ? parseFloat(producaoAnoAtualKg) : null,
        preco_medio_kg: precoMedioKg ? parseFloat(precoMedioKg) : null,
        sistema_producao: sistemaProducao || null,
        faz_fermentacao: fazFermentacao || null,
        actual_yield_kg_ha: (prodAnt && areaProducao && areaProducao > 0)
          ? parseFloat((prodAnt / areaProducao).toFixed(2)) : null,
      })
    }
    await onUpdate(updates)
    setSaving(false)
  }

  return (
    <Card className="flex flex-col gap-3">
      <p className="font-medium text-gray-700">Editar safra</p>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">Status</label>
        <select
          className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
          value={status}
          onChange={(e) => setStatus(e.target.value as Crop['status'])}
        >
          {CROP_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {status === 'perdida' && (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Motivo da perda</label>
          <input
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
            value={lossReason}
            onChange={(e) => setLossReason(e.target.value)}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Área plantada (ha)</label>
          <input type="number" step="0.01" className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500" value={plantedAreaHa} onChange={(e) => setPlantedAreaHa(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Preço médio (R$/kg)</label>
          <input type="number" step="0.01" className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500" value={salePricePerKg} onChange={(e) => setSalePricePerKg(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Produção esperada (kg)</label>
          <input type="number" className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500" value={expectedProductionKg} onChange={(e) => setExpectedProductionKg(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Produção real (kg)</label>
          <input type="number" className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500" value={actualProductionKg} onChange={(e) => setActualProductionKg(e.target.value)} />
        </div>
      </div>

      {crop.culture === 'cacau' && (
        <>
          <p className="text-sm font-semibold text-amber-700 mt-1">Dados específicos de cacau</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Área em produção (ha)</label>
              <input type="number" step="0.01" className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500" value={areaCacauProducaoHa} onChange={(e) => setAreaCacauProducaoHa(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Área declarada (ha)</label>
              <input type="number" step="0.01" className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500" value={areaCacauDeclaradaHa} onChange={(e) => setAreaCacauDeclaradaHa(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Produção ano anterior (kg)</label>
              <input type="number" className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500" value={producaoAnoAnteriorKg} onChange={(e) => setProducaoAnoAnteriorKg(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Estimativa ano atual (kg)</label>
              <input type="number" className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500" value={producaoAnoAtualKg} onChange={(e) => setProducaoAnoAtualKg(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Preço médio (R$/kg)</label>
              <input type="number" step="0.01" className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500" value={precoMedioKg} onChange={(e) => setPrecoMedioKg(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Sistema de produção</label>
              <select className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500" value={sistemaProducao} onChange={(e) => setSistemaProducao(e.target.value)}>
                <option value="">Selecione...</option>
                <option value="cacau_consorcio">Cacau em consórcio</option>
                <option value="cacau_saf">Cacau em SAF</option>
                <option value="cacau_monocultivo">Cacau em monocultivo</option>
                <option value="cacau_cabruca">Cacau Cabruca</option>
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Faz fermentação?</label>
            <select className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500" value={fazFermentacao} onChange={(e) => setFazFermentacao(e.target.value)}>
              <option value="">Selecione...</option>
              <option value="sim_fermenta_todo_cacau">Sim, fermenta todo o cacau</option>
              <option value="parcialmente">Parcialmente</option>
              <option value="nao">Não</option>
            </select>
          </div>
        </>
      )}

      <Button type="button" onClick={save} loading={saving} className="w-full">
        Salvar alterações
      </Button>
    </Card>
  )
}

// ── Formulário de registro financeiro ─────────────────────────
function FinancialForm({
  cropId, producerId, workspaceId, isCacau, onSaved, onCancel,
}: {
  cropId: string
  producerId: string
  workspaceId: string
  isCacau: boolean
  onSaved: (rec: FinancialRecord) => void
  onCancel: () => void
}) {
  const [type, setType] = useState<'receita' | 'despesa'>('despesa')
  const [category, setCategory] = useState('')
  const [subcategory, setSubcategory] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('')
  const [referenceDate, setReferenceDate] = useState(new Date().toISOString().slice(0, 10))
  const [isBaseline, setIsBaseline] = useState(false)
  const [saving, setSaving] = useState(false)

  const categoryOptions = type === 'receita' ? RECEITA_CATEGORIES : DESPESA_CATEGORIES

  const cacauSubcategoryOptions = isCacau && type === 'despesa'
    ? [...CACAU_SUBCATEGORIES_INSUMOS, ...CACAU_SUBCATEGORIES_SERVICOS]
    : []

  async function save() {
    if (!amount || !referenceDate || !category) return
    setSaving(true)
    const now = new Date().toISOString()
    const rec: FinancialRecord = {
      id: uuidv4(),
      workspace_id: workspaceId,
      producer_id: producerId,
      property_id: null,
      visit_id: null,
      crop_id: cropId,
      type,
      category,
      subcategory: subcategory || null,
      description: description || null,
      amount: parseFloat(amount),
      quantity: quantity ? parseFloat(quantity) : null,
      unit: unit || null,
      reference_date: referenceDate,
      reference_period: null,
      is_baseline: isBaseline,
      notes: null,
      created_at: now,
      updated_at: now,
    }
    await db.financial_records.add(rec)
    await enqueueSyncItem('financial_records', 'insert', rec.id, rec as unknown as Record<string, unknown>)
    setSaving(false)
    onSaved(rec)
  }

  return (
    <Card className="mb-3 flex flex-col gap-3">
      <p className="font-medium text-gray-700">Novo registro financeiro</p>
      <p className="text-xs text-orange-600 italic">Dados autodeclarados — para fins de acompanhamento técnico.</p>

      <div className="flex gap-2">
        {(['receita', 'despesa'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setType(t); setCategory(''); setSubcategory('') }}
            className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
              type === t
                ? t === 'receita' ? 'bg-green-100 border-green-300 text-green-800' : 'bg-red-100 border-red-300 text-red-800'
                : 'bg-white border-gray-200 text-gray-500'
            }`}
          >
            {t === 'receita' ? 'Receita' : 'Despesa'}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">Categoria</label>
        <select className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Selecione...</option>
          {categoryOptions.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      {isCacau && type === 'despesa' && (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Subcategoria (cacau)</label>
          <select className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500" value={subcategory} onChange={(e) => setSubcategory(e.target.value)}>
            <option value="">Selecione...</option>
            {cacauSubcategoryOptions.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">Descrição (opcional)</label>
        <input className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="Ex: Herbicida Roundup 20L" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Valor (R$)</label>
          <input type="number" step="0.01" className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Data de referência</label>
          <input type="date" className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500" value={referenceDate} onChange={(e) => setReferenceDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Quantidade</label>
          <input type="number" step="0.01" className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Unidade</label>
          <input className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="L, kg, sc, h..." value={unit} onChange={(e) => setUnit(e.target.value)} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
        <input type="checkbox" className="w-4 h-4 rounded" checked={isBaseline} onChange={(e) => setIsBaseline(e.target.checked)} />
        Dado pré-projeto (linha de base)
      </label>

      <div className="flex gap-2">
        <Button type="button" onClick={save} loading={saving} disabled={!amount || !category} className="flex-1">
          Salvar registro
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
      </div>
    </Card>
  )
}
