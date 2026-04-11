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
  ChecklistItem,
} from '@/types'
import { formatDateTime, formatDuration } from '@/lib/utils/dates'

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

      const [prod, prop, recs, recoms, responses, forms, checkItems] = await Promise.all([
        db.producers.get(v.producer_id),
        v.property_id ? db.properties.get(v.property_id) : Promise.resolve(undefined),
        db.visit_records.where('visit_id').equals(id).toArray(),
        db.recommendations.where('visit_id').equals(id).toArray(),
        db.form_responses.where('visit_id').equals(id).toArray(),
        db.forms.filter((f) => f.is_active).toArray(),
        db.checklist_items.where('visit_id').equals(id).sortBy('order_index'),
      ])

      setProducer(prod ?? null)
      setProperty(prop ?? null)
      setRecords(recs)
      setRecommendations(recoms)
      setAvailableForms(forms)
      setChecklist(checkItems)

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

          {visit.status === 'completed' && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <Button variant="secondary" className="w-full" loading={generatingPdf} onClick={handleGeneratePdf}>
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                {generatingPdf ? 'Gerando PDF...' : 'Baixar relatório PDF'}
              </Button>
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
function RecommendationForm({ visitId, workspaceId, onSaved }: {
  visitId: string; workspaceId: string; onSaved: (r: Recommendation) => void
}) {
  const [category, setCategory] = useState<RecommendationCategory>('manejo')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

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
      <Select label="Categoria" value={category} options={[
        { value: 'fertilizacao', label: 'Fertilização' }, { value: 'defensivo', label: 'Defensivo' },
        { value: 'irrigacao', label: 'Irrigação' }, { value: 'manejo', label: 'Manejo' }, { value: 'outro', label: 'Outro' },
      ]} onChange={(e) => setCategory(e.target.value as RecommendationCategory)} />
      <Textarea label="Descrição" placeholder="Descreva a recomendação técnica..." value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      <Button onClick={save} loading={saving} disabled={!description.trim()}>Salvar recomendação</Button>
    </Card>
  )
}
