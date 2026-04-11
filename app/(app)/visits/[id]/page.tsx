'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { v4 as uuidv4 } from 'uuid'
import { db, enqueueSyncItem } from '@/lib/db/dexie'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth.store'
import { useSyncStore } from '@/stores/sync.store'
import { TopBar } from '@/components/layout/top-bar'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { AudioRecorder } from '@/components/visits/audio-recorder'
import { SignaturePad } from '@/components/visits/signature-pad'
import { FormRenderer } from '@/components/forms/form-renderer'
import type {
  Visit, Producer, Property, VisitRecord, Recommendation,
  Form, FormField, FormResponse, FormAnswer,
  RecordType, Severity, RecommendationCategory,
  ChecklistItem, Crop, VisitCrop, CacauObservacoesTecnicas, FinancialRecord,
} from '@/types'
import { formatDateTime, formatDuration } from '@/lib/utils/dates'
import {
  CULTURE_OPTIONS, CROP_STATUS_LABELS, CROP_STATUS_COLORS,
  CACAU_RECOMMENDATION_CATEGORIES,
  RECEITA_CATEGORIES, DESPESA_CATEGORIES, CACAU_SUBCATEGORIES_INSUMOS,
  calcNotaAnaliseTecnica, calcNotaBoasPraticas, calcTetoProdutivo,
} from '@/lib/utils/cacau-scores'

const PropertiesMap = dynamic(() => import('@/components/map/properties-map'), { ssr: false })

const RECORD_TYPE_LABELS: Record<RecordType, string> = {
  pest: 'Praga', disease: 'Doença', soil: 'Solo', management: 'Manejo',
}
const SEVERITY_LABELS: Record<Severity, string> = {
  low: 'Baixa', medium: 'Média', high: 'Alta',
}
const SEVERITY_COLORS: Record<Severity, 'green' | 'yellow' | 'red'> = {
  low: 'green', medium: 'yellow', high: 'red',
}
const CATEGORY_LABELS: Record<RecommendationCategory, string> = {
  fertilizacao: 'Fertilização', defensivo: 'Defensivo',
  irrigacao: 'Irrigação', manejo: 'Manejo', outro: 'Outro',
}

export default function VisitDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { workspace, profile } = useAuthStore()
  const { isOnline } = useSyncStore()

  const [visit, setVisit] = useState<Visit | null>(null)
  const [producer, setProducer] = useState<Producer | null>(null)
  const [property, setProperty] = useState<Property | null>(null)
  const [records, setRecords] = useState<VisitRecord[]>([])
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [appliedForms, setAppliedForms] = useState<(FormResponse & { form?: Form })[]>([])
  const [availableForms, setAvailableForms] = useState<Form[]>([])

  const [linkedCrops, setLinkedCrops] = useState<Crop[]>([])
  const [allProducerCrops, setAllProducerCrops] = useState<Crop[]>([])
  const [cacauObs, setCacauObs] = useState<CacauObservacoesTecnicas | null>(null)
  const [showCropSelector, setShowCropSelector] = useState(false)
  const [showCacauForm, setShowCacauForm] = useState(false)

  const [visitFinancials, setVisitFinancials] = useState<FinancialRecord[]>([])
  const [showFinancialForm, setShowFinancialForm] = useState(false)

  const [showRecordForm, setShowRecordForm] = useState(false)
  const [showRecommendationForm, setShowRecommendationForm] = useState(false)
  const [showFormSelector, setShowFormSelector] = useState(false)
  const [selectedFormId, setSelectedFormId] = useState('')
  const [selectedFormFields, setSelectedFormFields] = useState<FormField[]>([])
  const [showMap, setShowMap] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [ending, setEnding] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])

  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      const v = await db.visits.get(id)
      if (!v) { router.push('/visits'); return }
      setVisit(v)
      setNotes(v.notes ?? '')

      const [prod, prop, recs, recoms, responses, forms, checkItems, visitCropsLinks, obsData, finData] = await Promise.all([
        db.producers.get(v.producer_id),
        v.property_id ? db.properties.get(v.property_id) : Promise.resolve(undefined),
        db.visit_records.where('visit_id').equals(id).toArray(),
        db.recommendations.where('visit_id').equals(id).toArray(),
        db.form_responses.where('visit_id').equals(id).toArray(),
        db.forms.filter((f) => f.is_active).toArray(),
        db.checklist_items.where('visit_id').equals(id).sortBy('order_index'),
        db.visit_crops.where('visit_id').equals(id).toArray(),
        db.cacau_observacoes_tecnicas.where('visit_id').equals(id).first(),
        db.financial_records.where('visit_id').equals(id).toArray(),
      ])

      setProducer(prod ?? null)
      setProperty(prop ?? null)
      setRecords(recs)
      setRecommendations(recoms)
      setAvailableForms(forms)
      setChecklist(checkItems)
      setCacauObs(obsData ?? null)
      setVisitFinancials(finData)

      // Load linked crops
      if (visitCropsLinks.length > 0) {
        const cropIds = visitCropsLinks.map((vc: VisitCrop) => vc.crop_id)
        const cropsData = await Promise.all(cropIds.map((cid: string) => db.crops.get(cid)))
        setLinkedCrops(cropsData.filter(Boolean) as Crop[])
      }

      // All crops for this producer (for linking)
      const allCrops = await db.crops.where('producer_id').equals(v.producer_id).toArray()
      setAllProducerCrops(allCrops)

      const enrichedResponses = await Promise.all(
        responses.map(async (r) => ({ ...r, form: await db.forms.get(r.form_id) }))
      )
      setAppliedForms(enrichedResponses)
    }
    load()
  }, [id, router])

  // Load form fields when a form is selected
  useEffect(() => {
    if (!selectedFormId) { setSelectedFormFields([]); return }
    db.form_fields.where('form_id').equals(selectedFormId).sortBy('order_index').then(setSelectedFormFields)
  }, [selectedFormId])

  async function saveNotes(value: string) {
    if (!visit) return
    setSavingNotes(true)
    const now = new Date().toISOString()
    await db.visits.update(id, { notes: value, updated_at: now })
    await enqueueSyncItem('visits', 'update', id, { id, notes: value, updated_at: now })
    setSavingNotes(false)
  }

  function onNotesChange(value: string) {
    setNotes(value)
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(() => saveNotes(value), 1000)
  }

  async function endVisit() {
    if (!confirm('Encerrar esta visita?')) return
    setEnding(true)
    const now = new Date().toISOString()
    await db.visits.update(id, { status: 'completed', ended_at: now, updated_at: now })
    await enqueueSyncItem('visits', 'update', id, { id, status: 'completed', ended_at: now, updated_at: now })
    router.push('/visits')
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !workspace || !visit) return
    if (!isOnline) { alert('Sem conexão — conecte-se para enviar fotos'); return }

    setUploadingPhoto(true)
    const supabase = createClient()
    const path = `${workspace.id}/visits/${id}/${uuidv4()}-${file.name}`
    const { data, error } = await supabase.storage.from('media').upload(path, file)
    if (!error && data) {
      const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(data.path)
      const now = new Date().toISOString()
      const newUrls = [...(visit.photo_urls ?? []), publicUrl]
      await db.visits.update(id, { photo_urls: newUrls, updated_at: now })
      await enqueueSyncItem('visits', 'update', id, { id, photo_urls: newUrls, updated_at: now })
      setVisit((prev) => prev ? { ...prev, photo_urls: newUrls } : prev)
    }
    setUploadingPhoto(false)
    // reset input so same file can be re-selected
    e.target.value = ''
  }

  async function handleAudioSaved(url: string) {
    if (!visit) return
    const now = new Date().toISOString()
    const newUrls = [...(visit.audio_urls ?? []), url]
    await db.visits.update(id, { audio_urls: newUrls, updated_at: now })
    await enqueueSyncItem('visits', 'update', id, { id, audio_urls: newUrls, updated_at: now })
    setVisit((prev) => prev ? { ...prev, audio_urls: newUrls } : prev)
  }

  async function submitFormResponse(answers: Record<string, string | number | boolean | string[] | null>) {
    if (!workspace || !selectedFormId) return
    const responseId = uuidv4()
    const now = new Date().toISOString()
    const response: FormResponse = {
      id: responseId,
      form_id: selectedFormId,
      visit_id: id,
      producer_id: visit?.producer_id ?? null,
      workspace_id: workspace.id,
      submitted_at: now,
      created_at: now,
    }
    await db.form_responses.add(response)
    await enqueueSyncItem('form_responses', 'insert', responseId, response as unknown as Record<string, unknown>)

    for (const [fieldId, value] of Object.entries(answers)) {
      const field = selectedFormFields.find((f) => f.id === fieldId)
      if (!field) continue

      const isDate    = field.type === 'date'
      const isNumeric = field.type === 'integer' || field.type === 'decimal' || field.type === 'number' || field.type === 'range'

      const answerId = uuidv4()
      const answer: FormAnswer = {
        id: answerId,
        response_id: responseId,
        field_id: fieldId,
        value_text:   (!isDate && !isNumeric && typeof value === 'string') ? value : null,
        value_number: (isNumeric && typeof value === 'number') ? value : null,
        value_date:   (isDate && typeof value === 'string') ? value : null,
        value_bool:   typeof value === 'boolean' ? value : null,
        value_json:   Array.isArray(value) ? value : null,
        media_url: null,
        created_at: now,
      }
      await db.form_answers.add(answer)
      await enqueueSyncItem('form_answers', 'insert', answerId, answer as unknown as Record<string, unknown>)
    }

    const form = availableForms.find((f) => f.id === selectedFormId)
    setAppliedForms((prev) => [...prev, { ...response, form }])
    setShowFormSelector(false)
    setSelectedFormId('')
  }

  async function linkCrop(cropId: string) {
    const alreadyLinked = linkedCrops.some((c) => c.id === cropId)
    if (alreadyLinked) return
    const link: VisitCrop = { visit_id: id, crop_id: cropId }
    await db.visit_crops.add(link)
    await enqueueSyncItem('visit_crops', 'insert', `${id}_${cropId}`, link as unknown as Record<string, unknown>)
    const crop = await db.crops.get(cropId)
    if (crop) setLinkedCrops((prev) => [...prev, crop])
    setShowCropSelector(false)
  }

  async function unlinkCrop(cropId: string) {
    await db.visit_crops.delete([id, cropId])
    await enqueueSyncItem('visit_crops', 'delete', `${id}_${cropId}`, { visit_id: id, crop_id: cropId })
    setLinkedCrops((prev) => prev.filter((c) => c.id !== cropId))
  }

  async function saveCacauObs(data: Partial<CacauObservacoesTecnicas>) {
    if (!workspace) return
    const cacauCrop = linkedCrops.find((c) => c.culture === 'cacau')
    if (!cacauCrop) return
    const now = new Date().toISOString()

    if (cacauObs) {
      const updated = { ...data, updated_at: now }
      await db.cacau_observacoes_tecnicas.update(cacauObs.id, updated)
      await enqueueSyncItem('cacau_observacoes_tecnicas', 'update', cacauObs.id, { id: cacauObs.id, ...updated })
      setCacauObs((prev) => prev ? { ...prev, ...updated } : prev)
    } else {
      const newObs: CacauObservacoesTecnicas = {
        id: uuidv4(),
        workspace_id: workspace.id,
        visit_id: id,
        crop_id: cacauCrop.id,
        areas_limpas_arejadas: null, areas_bem_adensadas: null, copas_bem_formadas: null,
        plantas_saudaveis: null, vassoura_bruxa_controlada: null, podridao_parda_controlada: null,
        idade_media_lavoura: null, espacamento_utilizado: null, faz_analise_solo_foliar: null,
        faz_correcao_solo: null, faz_adubacao_solo: null, faz_adubacao_foliar: null,
        faz_controle_fungico_preventivo: null, faz_poda_manutencao: null, faz_poda_fitossanitaria: null,
        usa_cultura_cobertura: null, usa_plantio_direto: null, usa_material_organico: null,
        tem_plano_adubacao: null, conserva_mata_ciliar: null, usa_cerca_viva: null,
        adota_mip: null, usa_agricultura_precisao: null, participa_acoes_comunitarias: null,
        faz_tratamento_casqueiro: null, tem_irrigacao: null, irrigacao_eficiente: null,
        faz_controle_biologico: null, usa_composto_organico: null, faz_renovacao_plantel: null,
        faz_coroamento: null, controle_pragas_doencas: null, tem_viveiro: null,
        organizacao_tecnologia: null,
        areas_limpas_recomendacao: null, areas_limpas_como_iniciar: null,
        areas_adensadas_recomendacao: null, areas_adensadas_como_iniciar: null,
        copas_formadas_recomendacao: null, copas_formadas_como_iniciar: null,
        plantas_saudaveis_recomendacao: null, plantas_saudaveis_como_iniciar: null,
        vassoura_bruxa_recomendacao: null, vassoura_bruxa_como_iniciar: null,
        podridao_parda_recomendacao: null, podridao_parda_como_iniciar: null,
        analise_solo_recomendacao: null, correcao_solo_recomendacao: null,
        adubacao_solo_recomendacao: null, adubacao_foliar_recomendacao: null,
        controle_fungico_recomendacao: null, poda_manutencao_recomendacao: null,
        poda_fitossanitaria_recomendacao: null,
        cultura_cobertura_recomendacao: null, plantio_direto_recomendacao: null,
        material_organico_recomendacao: null, plano_adubacao_recomendacao: null,
        mata_ciliar_recomendacao: null, cerca_viva_recomendacao: null,
        mip_recomendacao: null, agricultura_precisao_recomendacao: null,
        acoes_comunitarias_recomendacao: null, casqueiro_recomendacao: null,
        analise_tecnica_areas_cacau: null, analise_boas_praticas: null,
        analise_recomendacoes_proximo_ano: null, analise_agricultura_regenerativa: null,
        avaliacao_teto_produtivo: null,
        created_at: now, updated_at: now,
        ...data,
      }
      await db.cacau_observacoes_tecnicas.add(newObs)
      await enqueueSyncItem('cacau_observacoes_tecnicas', 'insert', newObs.id, newObs as unknown as Record<string, unknown>)
      setCacauObs(newObs)

      // Calcular e persistir teto produtivo
      const teto = calcTetoProdutivo(cacauCrop, newObs)
      await db.crops.update(cacauCrop.id, { ...teto, updated_at: now })
      await enqueueSyncItem('crops', 'update', cacauCrop.id, { id: cacauCrop.id, ...teto, updated_at: now })
    }
  }

  async function saveVisitMeta(fields: Partial<Pick<Visit, 'cycle_number' | 'producer_rating_score' | 'preferred_visit_frequency'>>) {
    if (!visit) return
    const now = new Date().toISOString()
    await db.visits.update(id, { ...fields, updated_at: now })
    await enqueueSyncItem('visits', 'update', id, { id, ...fields, updated_at: now })
    setVisit((prev) => prev ? { ...prev, ...fields } : prev)
  }

  async function toggleChecklistItem(itemId: string, checked: boolean) {
    const now = new Date().toISOString()
    await db.checklist_items.update(itemId, { checked, updated_at: now })
    await enqueueSyncItem('checklist_items', 'update', itemId, { id: itemId, checked, updated_at: now })
    setChecklist((prev) => prev.map((i) => i.id === itemId ? { ...i, checked } : i))
  }

  async function handleSignatureUpload(blob: Blob): Promise<string> {
    if (!workspace) throw new Error('no workspace')
    const supabase = createClient()
    const path = `${workspace.id}/visits/${id}/signature-${Date.now()}.png`
    const { data, error } = await supabase.storage.from('media').upload(path, blob, { contentType: 'image/png' })
    if (error || !data) throw error
    const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(data.path)
    const now = new Date().toISOString()
    await db.visits.update(id, { signature_url: publicUrl, updated_at: now })
    await enqueueSyncItem('visits', 'update', id, { id, signature_url: publicUrl, updated_at: now })
    setVisit((prev) => prev ? { ...prev, signature_url: publicUrl } : prev)
    return publicUrl
  }

  async function handleGeneratePdf() {
    if (!visit || !producer) return
    setGeneratingPdf(true)
    try {
      const { generateVisitPDF } = await import('@/lib/utils/generate-pdf')
      await generateVisitPDF({ visit, producer, property, records, recommendations, technicianName: profile?.full_name ?? 'Técnico' })
    } finally {
      setGeneratingPdf(false)
    }
  }

  if (!visit) return <div className="p-8 text-center text-gray-400">Carregando...</div>

  const hasGps = visit.gps_lat !== null && visit.gps_lng !== null
  const propertyHasGps = property?.gps_lat != null

  return (
    <>
      <TopBar title="Visita" backHref="/visits" />
      <div className="px-4 py-4 flex flex-col gap-4">

        {/* ── Header ─────────────────────────────────── */}
        <Card>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-gray-900 text-lg">{producer?.name}</p>
              {property && <p className="text-sm text-gray-500">{property.name} · {property.municipality}</p>}
              <p className="text-xs text-gray-400 mt-1">{formatDateTime(visit.started_at)}</p>
              {visit.ended_at && (
                <p className="text-xs text-gray-400">Duração: {formatDuration(visit.started_at, visit.ended_at)}</p>
              )}
              {hasGps && (
                <p className="text-xs text-gray-400">GPS: {visit.gps_lat?.toFixed(5)}, {visit.gps_lng?.toFixed(5)}</p>
              )}
            </div>
            <Badge variant={visit.status === 'active' ? 'green' : 'gray'}>
              {visit.status === 'active' ? 'Em andamento' : 'Concluída'}
            </Badge>
          </div>

          {visit.status === 'scheduled' && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs text-orange-600 mb-2">
                Agendada para {visit.scheduled_at ? new Date(visit.scheduled_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
              </p>
              <Button className="w-full" onClick={async () => {
                const now = new Date().toISOString()
                await db.visits.update(id, { status: 'active', started_at: now, updated_at: now })
                await enqueueSyncItem('visits', 'update', id, { id, status: 'active', started_at: now, updated_at: now })
                setVisit((prev) => prev ? { ...prev, status: 'active', started_at: now } : prev)
              }}>
                Iniciar visita agora
              </Button>
            </div>
          )}

          {/* Ciclo de visita + avaliação do produtor */}
          <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Ciclo de visita</label>
              <select
                className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-400"
                value={visit.cycle_number ?? ''}
                disabled={visit.status === 'completed'}
                onChange={(e) => saveVisitMeta({ cycle_number: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">—</option>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n}ª visita</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Nota do produtor (0–10)</label>
              <input
                type="number"
                min={0}
                max={10}
                className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-400"
                value={visit.producer_rating_score ?? ''}
                disabled={visit.status === 'completed'}
                onChange={(e) => saveVisitMeta({ producer_rating_score: e.target.value !== '' ? Number(e.target.value) : null })}
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 block mb-1">Frequência desejada de visitas</label>
              <select
                className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-400"
                value={visit.preferred_visit_frequency ?? ''}
                disabled={visit.status === 'completed'}
                onChange={(e) => saveVisitMeta({ preferred_visit_frequency: (e.target.value as Visit['preferred_visit_frequency']) || null })}
              >
                <option value="">Não informado</option>
                <option value="mensal">Mensal</option>
                <option value="bimestral">Bimestral</option>
                <option value="trimestral">Trimestral</option>
                <option value="semestral">Semestral</option>
              </select>
            </div>
          </div>

          {visit.status === 'completed' && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex flex-col gap-2">
              <Button variant="secondary" className="w-full" loading={generatingPdf} onClick={handleGeneratePdf}>
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                {generatingPdf ? 'Gerando PDF...' : 'Baixar relatório PDF'}
              </Button>
              {linkedCrops.some((c) => c.culture === 'cacau') && (
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={async () => {
                    const res = await fetch(`/api/visits/${id}/generate-pda`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ format: 'pdf' }),
                    })
                    if (!res.ok) { alert('Erro ao gerar o Laudo PDA'); return }
                    const blob = await res.blob()
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `laudo-pda-${id}.pdf`
                    a.click()
                    URL.revokeObjectURL(url)
                  }}
                >
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
                  </svg>
                  Gerar Laudo PDA (Cacau)
                </Button>
              )}
            </div>
          )}
        </Card>

        {/* ── Mapa ───────────────────────────────────── */}
        {(hasGps || propertyHasGps) && (
          <Card padding="sm">
            <button
              className="w-full flex items-center justify-between text-sm font-medium text-gray-700"
              onClick={() => setShowMap((v) => !v)}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c-.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                </svg>
                Ver no mapa
              </span>
              <svg className={`w-4 h-4 text-gray-400 transition-transform ${showMap ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showMap && (
              <div className="mt-3 h-56 rounded-lg overflow-hidden">
                <PropertiesMap
                  properties={property ? [property] : []}
                  highlightLat={visit.gps_lat ?? undefined}
                  highlightLng={visit.gps_lng ?? undefined}
                  highlightLabel={`Visita — ${producer?.name}`}
                  zoom={13}
                />
              </div>
            )}
          </Card>
        )}

        {/* ── Anotações ──────────────────────────────── */}
        <Card>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-gray-800">Anotações</h3>
            {savingNotes && <span className="text-xs text-gray-400">Salvando...</span>}
          </div>
          <Textarea
            placeholder="Anote observações gerais da visita..."
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            rows={3}
            disabled={visit.status === 'completed'}
          />
        </Card>

        {/* ── Registros agronômicos ───────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Registros Agronômicos</h3>
            {visit.status === 'active' && (
              <Button variant="ghost" size="sm" onClick={() => setShowRecordForm(!showRecordForm)}>
                + Adicionar
              </Button>
            )}
          </div>

          {showRecordForm && (
            <RecordForm
              visitId={id}
              workspaceId={workspace?.id ?? ''}
              onSaved={(rec) => { setRecords((prev) => [...prev, rec]); setShowRecordForm(false) }}
            />
          )}

          {records.length === 0 && !showRecordForm ? (
            <p className="text-sm text-gray-400 text-center py-4">Nenhum registro adicionado</p>
          ) : (
            <div className="flex flex-col gap-2">
              {records.map((rec) => (
                <Card key={rec.id} padding="sm">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="blue">{RECORD_TYPE_LABELS[rec.type]}</Badge>
                    <Badge variant={SEVERITY_COLORS[rec.severity]}>{SEVERITY_LABELS[rec.severity]}</Badge>
                  </div>
                  <p className="text-sm text-gray-700">{rec.description}</p>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* ── Recomendações técnicas ──────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Recomendações Técnicas</h3>
            {visit.status === 'active' && (
              <Button variant="ghost" size="sm" onClick={() => setShowRecommendationForm(!showRecommendationForm)}>
                + Adicionar
              </Button>
            )}
          </div>

          {showRecommendationForm && (
            <RecommendationForm
              visitId={id}
              workspaceId={workspace?.id ?? ''}
              hasCacau={linkedCrops.some((c) => c.culture === 'cacau')}
              onSaved={(rec) => { setRecommendations((prev) => [...prev, rec]); setShowRecommendationForm(false) }}
            />
          )}

          {recommendations.length === 0 && !showRecommendationForm ? (
            <p className="text-sm text-gray-400 text-center py-4">Nenhuma recomendação adicionada</p>
          ) : (
            <div className="flex flex-col gap-2">
              {recommendations.map((rec, i) => (
                <Card key={rec.id} padding="sm">
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-brand-600 text-white text-xs flex items-center justify-center font-bold shrink-0">{i + 1}</span>
                    <div className="flex-1">
                      <Badge variant="blue">{CATEGORY_LABELS[rec.category]}</Badge>
                      <p className="text-sm text-gray-700 mt-1">{rec.description}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* ── Formulários aplicados ───────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Formulários</h3>
            {visit.status === 'active' && availableForms.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setShowFormSelector(!showFormSelector)}>
                + Aplicar
              </Button>
            )}
          </div>

          {showFormSelector && visit.status === 'active' && (
            <Card className="mb-3 flex flex-col gap-3">
              <h4 className="font-medium text-gray-700">Selecionar formulário</h4>
              <Select
                label="Formulário"
                value={selectedFormId}
                options={[
                  { value: '', label: 'Selecione um formulário...' },
                  ...availableForms.map((f) => ({ value: f.id, label: f.title })),
                ]}
                onChange={(e) => setSelectedFormId(e.target.value)}
              />
              {selectedFormId && selectedFormFields.length > 0 && (
                <FormRenderer fields={selectedFormFields} onSubmit={submitFormResponse} />
              )}
              {selectedFormId && selectedFormFields.length === 0 && (
                <p className="text-sm text-gray-400">Este formulário não tem campos</p>
              )}
            </Card>
          )}

          {availableForms.length === 0 && visit.status === 'active' && (
            <p className="text-sm text-gray-400 text-center py-2">Nenhum formulário ativo disponível</p>
          )}

          {appliedForms.length === 0 && !showFormSelector ? (
            <p className="text-sm text-gray-400 text-center py-4">Nenhum formulário aplicado</p>
          ) : (
            <div className="flex flex-col gap-2">
              {appliedForms.map((resp) => (
                <Card key={resp.id} padding="sm" className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{resp.form?.title ?? 'Formulário'}</p>
                    <p className="text-xs text-gray-400">Preenchido</p>
                  </div>
                  <Badge variant="green">OK</Badge>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* ── Áudio ──────────────────────────────────── */}
        <Card>
          <h3 className="font-medium text-gray-800 mb-3">Gravação de Áudio</h3>
          {!isOnline && visit.status === 'active' && (
            <p className="text-xs text-amber-600 mb-2">Requer conexão para salvar o áudio</p>
          )}
          <AudioRecorder
            visitId={id}
            workspaceId={workspace?.id ?? ''}
            existingUrls={visit.audio_urls ?? []}
            disabled={visit.status === 'completed' || !isOnline}
            onSaved={handleAudioSaved}
          />
        </Card>

        {/* ── Fotos ──────────────────────────────────── */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-gray-800">Fotos</h3>
            {visit.status === 'active' && (
              <Button
                variant="ghost"
                size="sm"
                loading={uploadingPhoto}
                onClick={() => fileInputRef.current?.click()}
              >
                + Adicionar
              </Button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePhotoUpload}
          />
          {(visit.photo_urls ?? []).length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-4">
              {visit.status === 'active' ? (
                <Button
                  variant="secondary"
                  className="w-full"
                  loading={uploadingPhoto}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                  </svg>
                  {uploadingPhoto ? 'Enviando...' : 'Tirar foto'}
                </Button>
              ) : (
                <p className="text-sm text-gray-400">Nenhuma foto registrada</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {(visit.photo_urls ?? []).map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                  <img
                    src={url}
                    alt={`Foto ${i + 1}`}
                    className="w-full aspect-square object-cover rounded-lg border border-gray-200"
                  />
                </a>
              ))}
              {visit.status === 'active' && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-brand-400 hover:text-brand-500 transition-colors"
                >
                  {uploadingPhoto ? (
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  )}
                </button>
              )}
            </div>
          )}
        </Card>

        {/* ── Checklist ──────────────────────────────── */}
        {checklist.length > 0 && (
          <Card>
            <h3 className="font-medium text-gray-800 mb-3">Checklist da Visita</h3>
            <div className="flex flex-col gap-2">
              {checklist.map((item) => (
                <label key={item.id} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.checked}
                    disabled={visit.status === 'completed'}
                    onChange={(e) => toggleChecklistItem(item.id, e.target.checked)}
                    className="w-5 h-5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className={`text-sm ${item.checked ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                    {item.label}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-3">
              {checklist.filter((i) => i.checked).length} de {checklist.length} itens concluídos
            </p>
          </Card>
        )}

        {/* ── Safras abordadas ───────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Safras Abordadas</h3>
            {visit.status === 'active' && allProducerCrops.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setShowCropSelector(!showCropSelector)}>
                + Vincular
              </Button>
            )}
          </div>

          {showCropSelector && (
            <Card className="mb-3 flex flex-col gap-2">
              <p className="text-sm font-medium text-gray-700">Selecionar safra</p>
              {allProducerCrops
                .filter((c) => !linkedCrops.some((lc) => lc.id === c.id))
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => linkCrop(c.id)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 hover:bg-brand-50 text-left"
                  >
                    <span className="text-sm font-medium capitalize">
                      {CULTURE_OPTIONS.find((o) => o.value === c.culture)?.label ?? c.culture}
                    </span>
                    <span className="text-xs text-gray-400">— {c.season_year}</span>
                    <Badge variant={CROP_STATUS_COLORS[c.status]}>{CROP_STATUS_LABELS[c.status]}</Badge>
                  </button>
                ))
              }
              {allProducerCrops.filter((c) => !linkedCrops.some((lc) => lc.id === c.id)).length === 0 && (
                <p className="text-xs text-gray-400">Todas as safras já estão vinculadas</p>
              )}
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowCropSelector(false)}>Fechar</Button>
            </Card>
          )}

          {linkedCrops.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Nenhuma safra vinculada</p>
          ) : (
            <div className="flex flex-col gap-2">
              {linkedCrops.map((crop) => (
                <Card key={crop.id} padding="sm" className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 capitalize">
                        {CULTURE_OPTIONS.find((o) => o.value === crop.culture)?.label ?? crop.culture}
                      </p>
                      <Badge variant={CROP_STATUS_COLORS[crop.status]}>{CROP_STATUS_LABELS[crop.status]}</Badge>
                    </div>
                    <p className="text-xs text-gray-500">{crop.season_year}{crop.planted_area_ha ? ` · ${crop.planted_area_ha} ha` : ''}</p>
                  </div>
                  {visit.status === 'active' && (
                    <button type="button" onClick={() => unlinkCrop(crop.id)} className="text-gray-300 hover:text-red-500 p-1">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* ── Financeiro da Visita ───────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Financeiro</h3>
            {visit.status === 'active' && (
              <Button variant="ghost" size="sm" onClick={() => setShowFinancialForm(!showFinancialForm)}>
                + Lançar
              </Button>
            )}
          </div>

          {showFinancialForm && (
            <VisitFinancialForm
              visitId={id}
              producerId={visit.producer_id}
              workspaceId={workspace?.id ?? ''}
              linkedCrops={linkedCrops}
              onSaved={(rec) => { setVisitFinancials((prev) => [...prev, rec]); setShowFinancialForm(false) }}
              onCancel={() => setShowFinancialForm(false)}
            />
          )}

          {visitFinancials.length === 0 && !showFinancialForm ? (
            <p className="text-sm text-gray-400 text-center py-4">Nenhum lançamento registrado</p>
          ) : (
            <div className="flex flex-col gap-2">
              {visitFinancials.map((f) => (
                <Card key={f.id} padding="sm" className="flex items-center gap-3">
                  <div className={`w-2 h-8 rounded-full ${f.type === 'receita' ? 'bg-green-400' : 'bg-red-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{f.description || f.category}</p>
                    <p className="text-xs text-gray-400">{f.category}{f.subcategory ? ` · ${f.subcategory}` : ''}</p>
                  </div>
                  <span className={`text-sm font-semibold ${f.type === 'receita' ? 'text-green-700' : 'text-red-700'}`}>
                    {f.type === 'receita' ? '+' : '-'}R$ {f.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </Card>
              ))}
              <div className="flex justify-between text-xs text-gray-500 px-1 pt-1">
                <span>Receitas: <span className="text-green-700 font-semibold">R$ {visitFinancials.filter(f => f.type === 'receita').reduce((s, f) => s + f.amount, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></span>
                <span>Despesas: <span className="text-red-700 font-semibold">R$ {visitFinancials.filter(f => f.type === 'despesa').reduce((s, f) => s + f.amount, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></span>
              </div>
            </div>
          )}
        </div>

        {/* ── Observações Técnicas de Cacau ───────────── */}
        {linkedCrops.some((c) => c.culture === 'cacau') && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">Observações Técnicas — Cacau</h3>
              {visit.status === 'active' && (
                <Button variant="ghost" size="sm" onClick={() => setShowCacauForm(!showCacauForm)}>
                  {cacauObs ? 'Editar' : '+ Preencher'}
                </Button>
              )}
            </div>

            {cacauObs && !showCacauForm && (
              <Card padding="sm">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Análise Técnica</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    ['Áreas limpas/arejadas', cacauObs.areas_limpas_arejadas],
                    ['Áreas adensadas', cacauObs.areas_bem_adensadas],
                    ['Copas bem formadas', cacauObs.copas_bem_formadas],
                    ['Plantas saudáveis', cacauObs.plantas_saudaveis],
                    ['Vassoura-de-bruxa', cacauObs.vassoura_bruxa_controlada],
                    ['Podridão-parda', cacauObs.podridao_parda_controlada],
                  ].map(([label, value]) => value && (
                    <div key={label as string} className="bg-gray-50 rounded-lg p-2">
                      <p className="text-gray-400">{label as string}</p>
                      <p className="font-medium capitalize text-gray-700">{(value as string).replace(/_/g, ' ')}</p>
                    </div>
                  ))}
                </div>
                {/* Score CSCacau */}
                {(() => {
                  const notaAT = calcNotaAnaliseTecnica(cacauObs)
                  const notaBP = calcNotaBoasPraticas(cacauObs)
                  return (
                    <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2">
                      <div className="bg-amber-50 rounded-xl p-2 text-center">
                        <p className="text-xs text-gray-400">Score Análise Técnica</p>
                        <p className="font-bold text-amber-700">{notaAT.toFixed(1)}/10</p>
                      </div>
                      <div className="bg-amber-50 rounded-xl p-2 text-center">
                        <p className="text-xs text-gray-400">Score Boas Práticas</p>
                        <p className="font-bold text-amber-700">{notaBP.toFixed(1)}/10</p>
                      </div>
                    </div>
                  )
                })()}
              </Card>
            )}

            {(showCacauForm || (!cacauObs && visit.status === 'active')) && (
              <CacauObsForm
                existing={cacauObs}
                onSave={async (data) => { await saveCacauObs(data); setShowCacauForm(false) }}
                onCancel={() => setShowCacauForm(false)}
              />
            )}
          </div>
        )}

        {/* ── Assinatura do Produtor ─────────────────── */}
        {(visit.status === 'active' || visit.signature_url) && (
          <Card>
            <h3 className="font-medium text-gray-800 mb-3">Assinatura do Produtor</h3>
            {!isOnline && !visit.signature_url && (
              <p className="text-xs text-amber-600 mb-2">Requer conexão para salvar a assinatura</p>
            )}
            <SignaturePad
              existingUrl={visit.signature_url}
              onSaved={(url) => setVisit((prev) => prev ? { ...prev, signature_url: url } : prev)}
              onUpload={handleSignatureUpload}
              disabled={visit.status === 'completed' || !isOnline}
            />
          </Card>
        )}

        {/* ── Encerrar ───────────────────────────────── */}
        {visit.status === 'active' && (
          <Button variant="danger" size="lg" className="w-full mt-2" loading={ending} onClick={endVisit}>
            Encerrar visita
          </Button>
        )}
      </div>
    </>
  )
}

// ── Record form ───────────────────────────────────────────────
function RecordForm({ visitId, workspaceId, onSaved }: {
  visitId: string; workspaceId: string; onSaved: (r: VisitRecord) => void
}) {
  const [type, setType] = useState<RecordType>('pest')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<Severity>('low')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!description.trim()) return
    setSaving(true)
    const id = uuidv4()
    const now = new Date().toISOString()
    const record: VisitRecord = { id, visit_id: visitId, workspace_id: workspaceId, type, description, severity, media_urls: [], created_at: now, updated_at: now }
    await db.visit_records.add(record)
    await enqueueSyncItem('visit_records', 'insert', id, record as unknown as Record<string, unknown>)
    setSaving(false)
    onSaved(record)
  }

  return (
    <Card className="mb-3 flex flex-col gap-3">
      <h4 className="font-medium text-gray-700">Novo registro</h4>
      <Select label="Tipo" value={type} options={[
        { value: 'pest', label: 'Praga' }, { value: 'disease', label: 'Doença' },
        { value: 'soil', label: 'Solo' }, { value: 'management', label: 'Manejo' },
      ]} onChange={(e) => setType(e.target.value as RecordType)} />
      <Select label="Severidade" value={severity} options={[
        { value: 'low', label: 'Baixa' }, { value: 'medium', label: 'Média' }, { value: 'high', label: 'Alta' },
      ]} onChange={(e) => setSeverity(e.target.value as Severity)} />
      <Textarea label="Descrição" placeholder="Descreva o que foi observado..." value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      <Button onClick={save} loading={saving} disabled={!description.trim()}>Salvar registro</Button>
    </Card>
  )
}

// ── Recommendation form ───────────────────────────────────────
function RecommendationForm({ visitId, workspaceId, hasCacau, onSaved }: {
  visitId: string; workspaceId: string; hasCacau?: boolean; onSaved: (r: Recommendation) => void
}) {
  const [category, setCategory] = useState<RecommendationCategory>('manejo')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const categoryOptions = hasCacau
    ? CACAU_RECOMMENDATION_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))
    : [
        { value: 'fertilizacao', label: 'Fertilização' }, { value: 'defensivo', label: 'Defensivo' },
        { value: 'irrigacao', label: 'Irrigação' }, { value: 'manejo', label: 'Manejo' }, { value: 'outro', label: 'Outro' },
      ]

  async function save() {
    if (!description.trim()) return
    setSaving(true)
    const id = uuidv4()
    const now = new Date().toISOString()
    const rec: Recommendation = { id, visit_id: visitId, workspace_id: workspaceId, description, category, created_at: now, updated_at: now }
    await db.recommendations.add(rec)
    await enqueueSyncItem('recommendations', 'insert', id, rec as unknown as Record<string, unknown>)
    setSaving(false)
    onSaved(rec)
  }

  return (
    <Card className="mb-3 flex flex-col gap-3">
      <h4 className="font-medium text-gray-700">Nova recomendação</h4>
      <Select label="Categoria" value={category} options={categoryOptions} onChange={(e) => setCategory(e.target.value as RecommendationCategory)} />
      <Textarea label="Descrição" placeholder="Descreva a recomendação técnica..." value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      <Button onClick={save} loading={saving} disabled={!description.trim()}>Salvar recomendação</Button>
    </Card>
  )
}

// ── Visit financial form ──────────────────────────────────────
function VisitFinancialForm({ visitId, producerId, workspaceId, linkedCrops, onSaved, onCancel }: {
  visitId: string
  producerId: string
  workspaceId: string
  linkedCrops: Crop[]
  onSaved: (r: FinancialRecord) => void
  onCancel: () => void
}) {
  const [type, setType] = useState<'receita' | 'despesa'>('despesa')
  const [category, setCategory] = useState('')
  const [subcategory, setSubcategory] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [cropId, setCropId] = useState(linkedCrops[0]?.id ?? '')
  const [saving, setSaving] = useState(false)

  const hasCacau = linkedCrops.some((c) => c.culture === 'cacau')
  const categories = type === 'receita' ? RECEITA_CATEGORIES : DESPESA_CATEGORIES
  const cacauSubcats = CACAU_SUBCATEGORIES_INSUMOS.filter((s) => s.category === category)

  async function save() {
    if (!category || !amount || isNaN(Number(amount))) return
    setSaving(true)
    const id = uuidv4()
    const now = new Date().toISOString()
    const rec: FinancialRecord = {
      id,
      workspace_id: workspaceId,
      producer_id: producerId,
      property_id: null,
      visit_id: visitId,
      crop_id: cropId || null,
      type,
      category,
      subcategory: subcategory || null,
      description: description || null,
      amount: Number(amount),
      quantity: null,
      unit: null,
      reference_date: now.slice(0, 10),
      reference_period: null,
      is_baseline: false,
      notes: null,
      created_at: now,
      updated_at: now,
    }
    await db.financial_records.add(rec)
    await enqueueSyncItem('financial_records', 'insert', id, rec as unknown as Record<string, unknown>)
    setSaving(false)
    onSaved(rec)
  }

  return (
    <Card className="mb-3 flex flex-col gap-3">
      <h4 className="font-medium text-gray-700">Lançamento financeiro</h4>

      {/* Tipo */}
      <div className="flex gap-2">
        {(['receita', 'despesa'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setType(t); setCategory(''); setSubcategory('') }}
            className={`flex-1 py-2 text-sm font-medium rounded-xl border transition-colors ${
              type === t
                ? t === 'receita' ? 'bg-green-100 border-green-400 text-green-800' : 'bg-red-100 border-red-400 text-red-800'
                : 'bg-white border-gray-200 text-gray-400'
            }`}
          >
            {t === 'receita' ? 'Receita' : 'Despesa'}
          </button>
        ))}
      </div>

      {/* Safra */}
      {linkedCrops.length > 0 && (
        <Select
          label="Safra"
          value={cropId}
          options={[
            { value: '', label: 'Nenhuma' },
            ...linkedCrops.map((c) => ({
              value: c.id,
              label: `${CULTURE_OPTIONS.find((o) => o.value === c.culture)?.label ?? c.culture} ${c.season_year}`,
            })),
          ]}
          onChange={(e) => setCropId(e.target.value)}
        />
      )}

      {/* Categoria */}
      <Select
        label="Categoria"
        value={category}
        options={[{ value: '', label: 'Selecione...' }, ...categories.map((c) => ({ value: c.value, label: c.label }))]}
        onChange={(e) => { setCategory(e.target.value); setSubcategory('') }}
      />

      {/* Subcategoria cacau */}
      {hasCacau && category && cacauSubcats.length > 0 && (
        <Select
          label="Subcategoria"
          value={subcategory}
          options={[{ value: '', label: 'Nenhuma' }, ...cacauSubcats.map((s) => ({ value: s.value, label: s.label }))]}
          onChange={(e) => setSubcategory(e.target.value)}
        />
      )}

      {/* Descrição e valor */}
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="text-xs font-medium text-gray-500 block mb-1">Descrição (opcional)</label>
          <input
            type="text"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Ex: Venda 200 kg cacau seco"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Valor (R$)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="button" onClick={save} loading={saving} disabled={!category || !amount} className="flex-1">
          Salvar
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
      </div>
    </Card>
  )
}

// ── Cacau observations form ───────────────────────────────────
const SIM_NAO_OPTIONS = [
  { value: 'sim', label: 'Sim' },
  { value: 'parcialmente', label: 'Parcialmente' },
  { value: 'nao', label: 'Não' },
]

function CacauObsField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      <div className="flex gap-1">
        {SIM_NAO_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              value === opt.value
                ? opt.value === 'sim' ? 'bg-green-100 border-green-400 text-green-800'
                  : opt.value === 'parcialmente' ? 'bg-yellow-100 border-yellow-400 text-yellow-800'
                  : 'bg-red-100 border-red-400 text-red-800'
                : 'bg-white border-gray-200 text-gray-400'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function CacauObsForm({ existing, onSave, onCancel }: {
  existing: CacauObservacoesTecnicas | null
  onSave: (data: Partial<CacauObservacoesTecnicas>) => Promise<void>
  onCancel: () => void
}) {
  const [data, setData] = useState<Record<string, string>>({
    areas_limpas_arejadas:           existing?.areas_limpas_arejadas           ?? '',
    areas_bem_adensadas:             existing?.areas_bem_adensadas             ?? '',
    copas_bem_formadas:              existing?.copas_bem_formadas              ?? '',
    plantas_saudaveis:               existing?.plantas_saudaveis               ?? '',
    vassoura_bruxa_controlada:       existing?.vassoura_bruxa_controlada       ?? '',
    podridao_parda_controlada:       existing?.podridao_parda_controlada       ?? '',
    faz_analise_solo_foliar:         existing?.faz_analise_solo_foliar         ?? '',
    faz_correcao_solo:               existing?.faz_correcao_solo               ?? '',
    faz_adubacao_solo:               existing?.faz_adubacao_solo               ?? '',
    faz_adubacao_foliar:             existing?.faz_adubacao_foliar             ?? '',
    faz_controle_fungico_preventivo: existing?.faz_controle_fungico_preventivo ?? '',
    faz_poda_manutencao:             existing?.faz_poda_manutencao             ?? '',
    faz_poda_fitossanitaria:         existing?.faz_poda_fitossanitaria         ?? '',
    usa_cultura_cobertura:           existing?.usa_cultura_cobertura           ?? '',
    usa_plantio_direto:              existing?.usa_plantio_direto              ?? '',
    usa_material_organico:           existing?.usa_material_organico           ?? '',
    tem_plano_adubacao:              existing?.tem_plano_adubacao              ?? '',
    conserva_mata_ciliar:            existing?.conserva_mata_ciliar            ?? '',
    usa_cerca_viva:                  existing?.usa_cerca_viva                  ?? '',
    adota_mip:                       existing?.adota_mip                       ?? '',
    usa_agricultura_precisao:        existing?.usa_agricultura_precisao        ?? '',
    participa_acoes_comunitarias:    existing?.participa_acoes_comunitarias    ?? '',
    faz_tratamento_casqueiro:        existing?.faz_tratamento_casqueiro        ?? '',
  })
  const [saving, setSaving] = useState(false)

  function set(field: string) { return (v: string) => setData((prev) => ({ ...prev, [field]: v })) }

  async function save() {
    setSaving(true)
    const payload = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, v || null])
    )
    await onSave(payload as Partial<CacauObservacoesTecnicas>)
    setSaving(false)
  }

  return (
    <Card className="flex flex-col gap-4">
      <p className="font-medium text-amber-800">Checklist CSCacau</p>

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Seção 3 — Análise Técnica da Lavoura</p>
        <div className="flex flex-col gap-3">
          <CacauObsField label="Áreas de produção limpas e arejadas?" value={data.areas_limpas_arejadas} onChange={set('areas_limpas_arejadas')} />
          <CacauObsField label="Áreas estão bem adensadas?" value={data.areas_bem_adensadas} onChange={set('areas_bem_adensadas')} />
          <CacauObsField label="Copas bem formadas, baixas e desentrelaçadas?" value={data.copas_bem_formadas} onChange={set('copas_bem_formadas')} />
          <CacauObsField label="Plantas saudáveis / sem deficiência de nutrientes?" value={data.plantas_saudaveis} onChange={set('plantas_saudaveis')} />
          <CacauObsField label="Vassoura-de-bruxa bem controlada?" value={data.vassoura_bruxa_controlada} onChange={set('vassoura_bruxa_controlada')} />
          <CacauObsField label="Podridão-parda bem controlada?" value={data.podridao_parda_controlada} onChange={set('podridao_parda_controlada')} />
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Seção 4 — Boas Práticas Agrícolas</p>
        <div className="flex flex-col gap-3">
          {[
            ['Faz análise de solo ou foliar?', 'faz_analise_solo_foliar'],
            ['Faz correção do solo?', 'faz_correcao_solo'],
            ['Faz adubação de solo?', 'faz_adubacao_solo'],
            ['Faz adubação foliar?', 'faz_adubacao_foliar'],
            ['Faz controle fúngico preventivo?', 'faz_controle_fungico_preventivo'],
            ['Faz poda de manutenção?', 'faz_poda_manutencao'],
            ['Faz poda fitossanitária?', 'faz_poda_fitossanitaria'],
          ].map(([label, field]) => (
            <CacauObsField key={field} label={label} value={data[field]} onChange={set(field)} />
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Seção 5 — Agricultura Regenerativa</p>
        <div className="flex flex-col gap-3">
          {[
            ['Usa cobertura em linha?', 'usa_cultura_cobertura'],
            ['Revolvimento mínimo do solo?', 'usa_plantio_direto'],
            ['Usa fertilizante orgânico?', 'usa_material_organico'],
            ['Tem plano/recomendação de adubação?', 'tem_plano_adubacao'],
            ['Conserva mata ciliar?', 'conserva_mata_ciliar'],
            ['Usa cerca viva?', 'usa_cerca_viva'],
            ['Adota MIP?', 'adota_mip'],
            ['Usa agricultura de precisão?', 'usa_agricultura_precisao'],
            ['Participa de ações comunitárias?', 'participa_acoes_comunitarias'],
            ['Faz tratamento do casqueiro?', 'faz_tratamento_casqueiro'],
          ].map(([label, field]) => (
            <CacauObsField key={field} label={label} value={data[field]} onChange={set(field)} />
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="button" onClick={save} loading={saving} className="flex-1">
          Salvar observações
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
      </div>
    </Card>
  )
}
