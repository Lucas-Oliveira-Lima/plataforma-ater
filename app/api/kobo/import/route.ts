/**
 * POST /api/kobo/import
 *
 * Importa submissões exportadas do KoboToolbox para a plataforma.
 * Suporta dois formulários conforme SPEC-MASTER Parte 5:
 *   - form_type: "diagnostico" → cria/atualiza producers + properties
 *   - form_type: "visita_cacau" → cria visits, crops, cacau_observacoes_tecnicas
 *
 * Body: { form_type: "diagnostico" | "visita_cacau", submissions: object[] }
 */

import { createClient } from '@/lib/supabase/server'
import { v4 as uuidv4 } from 'uuid'

// Ciclo de visita: valor Kobo → número
const CICLO_MAP: Record<string, number> = {
  primeira_visita: 1, segunda_visita: 2, terceira_visita: 3,
  quarta_visita: 4, quinta_visita: 5, sexta_visita: 6,
  setima_visita: 7, oitava_visita: 8, nona_visita: 9, decima_visita: 10,
}

// Valores Kobo sim/parcialmente/não → plataforma
function normSimNao(v: string | undefined): string | null {
  if (!v) return null
  if (v === 'sim' || v === '1' || v === 'yes') return 'sim'
  if (v.includes('parcial') || v.includes('parte')) return 'parcialmente'
  if (v === 'nao' || v === '0' || v === 'no') return 'nao'
  return null
}

// Extrai lat/lng de string GPS do Kobo ("lat lng alt accuracy")
function parseGps(gps: string | undefined): { lat: number | null; lng: number | null } {
  if (!gps) return { lat: null, lng: null }
  const parts = gps.trim().split(/\s+/)
  const lat = parseFloat(parts[0])
  const lng = parseFloat(parts[1])
  return { lat: isNaN(lat) ? null : lat, lng: isNaN(lng) ? null : lng }
}

function toNum(v: string | number | undefined): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

export async function POST(req: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return new Response(null, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id, role')
    .eq('id', user.id)
    .single()

  if (!profile) return new Response(null, { status: 403 })
  if (profile.role !== 'admin') return new Response(JSON.stringify({ error: 'Apenas admins podem importar dados do Kobo' }), { status: 403 })

  const workspace_id: string = profile.workspace_id
  const body = await req.json() as { form_type: 'diagnostico' | 'visita_cacau'; submissions: Record<string, unknown>[] }
  const { form_type, submissions } = body

  if (!Array.isArray(submissions) || submissions.length === 0) {
    return new Response(JSON.stringify({ error: 'Nenhuma submissão enviada' }), { status: 400 })
  }

  const results = { created: 0, updated: 0, errors: [] as string[] }

  if (form_type === 'diagnostico') {
    // ── Formulário de diagnóstico / linha de base ────────────────
    // Cria ou atualiza producers + properties
    for (const sub of submissions) {
      try {
        const kobo_uuid = sub._uuid as string ?? uuidv4()
        const name = (sub.nome_resp ?? sub.nome ?? '') as string
        if (!name) { results.errors.push(`Submissão sem nome_resp: ${kobo_uuid}`); continue }

        const cpf = (sub.cpf as string) ?? null
        const phone = (sub.celular as string) ?? null
        const city = (sub.cidade as string)?.toLowerCase().replace(/\s+/g, '_') ?? null
        const statusKobo = (sub.situacao_benef as string) ?? null
        const status = statusKobo === 'ativo' || statusKobo === 'sim' ? 'active' : 'inactive'
        const gpsStr = (sub.gps_propriedade as string) ?? null
        const gps = parseGps(gpsStr ?? undefined)

        // Upsert producer por kobo_uuid
        const { data: existing } = await supabase
          .from('producers')
          .select('id')
          .eq('workspace_id', workspace_id)
          .eq('kobo_uuid', kobo_uuid)
          .maybeSingle()

        const producerPayload = {
          workspace_id,
          name,
          cpf_cnpj: cpf,
          phone,
          city,
          state: 'pa',
          status,
          kobo_uuid,
          updated_at: new Date().toISOString(),
        }

        let producerId: string

        if (existing) {
          await supabase.from('producers').update(producerPayload).eq('id', existing.id)
          producerId = existing.id
          results.updated++
        } else {
          const id = uuidv4()
          await supabase.from('producers').insert({ ...producerPayload, id, created_at: new Date().toISOString() })
          producerId = id
          results.created++
        }

        // Propriedade (uma por produtor neste formulário)
        const totalArea = toNum(sub.tamanho_area as string)
        const carCode = (sub.num_car as string) ?? null
        const propertyName = (sub.nome_propriedade as string) ?? `Propriedade de ${name}`

        const { data: existingProp } = await supabase
          .from('properties')
          .select('id')
          .eq('workspace_id', workspace_id)
          .eq('producer_id', producerId)
          .maybeSingle()

        const propPayload = {
          workspace_id,
          producer_id: producerId,
          name: propertyName,
          municipality: city ?? 'não informado',
          state: 'pa',
          car_code: carCode,
          area_ha: totalArea,
          gps_lat: gps.lat,
          gps_lng: gps.lng,
          updated_at: new Date().toISOString(),
        }

        if (existingProp) {
          await supabase.from('properties').update(propPayload).eq('id', existingProp.id)
        } else {
          await supabase.from('properties').insert({ ...propPayload, id: uuidv4(), created_at: new Date().toISOString() })
        }
      } catch (err) {
        results.errors.push(String(err))
      }
    }

  } else if (form_type === 'visita_cacau') {
    // ── Formulário de visita técnica de cacau ────────────────────
    for (const sub of submissions) {
      try {
        const koboUuidProdutor = (sub.uuid_produtor as string) ?? null
        if (!koboUuidProdutor) { results.errors.push(`Visita sem uuid_produtor: ${sub._uuid}`); continue }

        // Buscar produtor pelo kobo_uuid
        const { data: producer } = await supabase
          .from('producers')
          .select('id')
          .eq('workspace_id', workspace_id)
          .eq('kobo_uuid', koboUuidProdutor)
          .maybeSingle()

        if (!producer) { results.errors.push(`Produtor não encontrado: kobo_uuid=${koboUuidProdutor}`); continue }

        const producerId = producer.id
        const gps = parseGps((sub.geolocalizacao as string) ?? undefined)
        const visitDate = (sub.data_aplicacao_questionario as string) ?? new Date().toISOString().slice(0, 10)
        const cicloRaw = (sub.ciclo_de_visita as string) ?? ''
        const cycleNumber = CICLO_MAP[cicloRaw] ?? null

        // Técnico: buscar por nome
        let technicianId: string | null = null
        const techName = (sub.consultor as string) ?? ''
        if (techName) {
          const { data: techProfile } = await supabase
            .from('profiles')
            .select('id')
            .eq('workspace_id', workspace_id)
            .ilike('full_name', `%${techName}%`)
            .maybeSingle()
          technicianId = techProfile?.id ?? null
        }
        // Fallback: usar o usuário que está fazendo o import
        if (!technicianId) technicianId = user.id

        // Propriedade
        const { data: property } = await supabase
          .from('properties')
          .select('id')
          .eq('workspace_id', workspace_id)
          .eq('producer_id', producerId)
          .maybeSingle()

        const propertyId = property?.id ?? null

        // Criar visita (sempre cria nova por submissão Kobo)
        const visitId = uuidv4()
        const now = new Date().toISOString()
        const ratingRaw = sub.ATRIBUA_UMA_NOTA_DE_10_E_SATISFA_O_TOTAL
        const frequRaw = sub.COM_QUE_FREQU_NCIA_VOC_GOSTAR as string | undefined

        const freqMap: Record<string, string> = {
          mensal: 'mensal', bimestral: 'bimestral',
          trimestral: 'trimestral', semestral: 'semestral',
        }
        const preferred_visit_frequency = freqMap[frequRaw?.toLowerCase() ?? ''] ?? null

        await supabase.from('visits').insert({
          id: visitId,
          workspace_id,
          technician_id: technicianId,
          producer_id: producerId,
          property_id: propertyId,
          status: 'completed',
          started_at: visitDate + 'T00:00:00Z',
          ended_at: visitDate + 'T23:59:59Z',
          gps_lat: gps.lat,
          gps_lng: gps.lng,
          cycle_number: cycleNumber,
          producer_rating_score: toNum(ratingRaw as string | number | undefined),
          preferred_visit_frequency,
          audio_urls: [],
          photo_urls: [],
          created_at: now,
          updated_at: now,
        })

        results.created++

        // Crop de cacau: upsert por producer_id + culture='cacau' + status='em_andamento'
        const { data: existingCrop } = await supabase
          .from('crops')
          .select('id')
          .eq('workspace_id', workspace_id)
          .eq('producer_id', producerId)
          .eq('culture', 'cacau')
          .eq('status', 'em_andamento')
          .maybeSingle()

        const areaCacau = toNum(sub.area_cacau_producao_ha as string | undefined)
        const areaDeclarada = toNum(sub.area_cacau_declarada_ha as string | undefined)
        const areaApp = toNum(sub.area_app_rl_ha as string | undefined)
        const areaArrendada = toNum(sub.area_arrendada_meeiro as string | undefined)
        const areaConsorcio = toNum(sub.area_em_consorcio_ha as string | undefined)
        const areaIrrigada = toNum(sub.area_irrigada_ha as string | undefined)
        const producaoAntAnterior = toNum(sub.producao_ano_anterior_kg as string | undefined)
        const producaoAtual = toNum(sub.producao_ano_atual_kg as string | undefined)
        const precoMedio = toNum(sub.preco_medio_estimado_rs_kg as string | undefined)
        const nTalhoes = toNum(sub.numero_talhoes as string | undefined)
        const nTalhoesArrendado = toNum(sub.numero_talhoes_arrendado as string | undefined)
        const sistemaProd = (sub.sistema_producao_predominante as string) ?? null
        const fazFermentacao = normSimNao(sub.faz_fermentacao_na_fazenda as string | undefined)
        const tipoFermentacao = (sub.Qual_tipo_de_fermentacao as string) ?? null
        const materialGenetico = (sub.material_genetico_da_fazenda as string) ?? null

        const currentYear = new Date().getFullYear()
        let cropId: string

        const cropPayload = {
          workspace_id,
          producer_id: producerId,
          property_id: propertyId,
          culture: 'cacau',
          season_year: currentYear,
          season_type: 'perene',
          status: 'em_andamento',
          area_cacau_producao_ha: areaCacau,
          area_cacau_declarada_ha: areaDeclarada,
          area_app_rl_ha: areaApp,
          area_arrendada_ha: areaArrendada,
          area_consorcio_ha: areaConsorcio,
          area_irrigada_ha: areaIrrigada,
          numero_talhoes: nTalhoes,
          numero_talhoes_arrendado: nTalhoesArrendado,
          producao_ano_anterior_kg: producaoAntAnterior,
          producao_ano_atual_kg: producaoAtual,
          preco_medio_kg: precoMedio,
          sistema_producao: sistemaProd,
          faz_fermentacao: fazFermentacao,
          tipo_fermentacao: tipoFermentacao,
          material_genetico: materialGenetico,
          actual_yield_kg_ha: areaCacau && producaoAntAnterior ? Math.round(producaoAntAnterior / areaCacau * 10) / 10 : null,
          updated_at: now,
        }

        if (existingCrop) {
          await supabase.from('crops').update(cropPayload).eq('id', existingCrop.id)
          cropId = existingCrop.id
        } else {
          cropId = uuidv4()
          await supabase.from('crops').insert({ ...cropPayload, id: cropId, created_at: now })
        }

        // Vincular visita à crop
        await supabase.from('visit_crops').upsert({ visit_id: visitId, crop_id: cropId })

        // Observações técnicas do cacau
        const cacauObs = {
          id: uuidv4(),
          workspace_id,
          visit_id: visitId,
          crop_id: cropId,
          // Análise técnica
          areas_limpas_arejadas:       normSimNao(sub.area_producao_limpa_arejada as string | undefined),
          areas_bem_adensadas:         normSimNao(sub.areas_cacau_estao_adensadas as string | undefined),
          copas_bem_formadas:          normSimNao(sub.copas_bem_formada_baixa_desent as string | undefined),
          plantas_saudaveis:           normSimNao(sub.plantas_saudaveis_sem_deficien as string | undefined),
          vassoura_bruxa_controlada:   normSimNao(sub.vassoura_bruxa_bem_controlada as string | undefined),
          podridao_parda_controlada:   normSimNao(sub.podridao_parda_bem_controlada as string | undefined),
          espacamento_utilizado:       (sub.espacamento_utilizado_cacau as string) ?? null,
          // Boas práticas
          faz_analise_solo_foliar:         normSimNao(sub.faz_analise_solo_ou_foliar as string | undefined),
          faz_correcao_solo:               normSimNao(sub.faz_correcao_do_solo as string | undefined),
          faz_adubacao_solo:               normSimNao(sub.faz_adubacao_solo as string | undefined),
          faz_adubacao_foliar:             normSimNao(sub.faz_adubacao_foliar as string | undefined),
          faz_controle_fungico_preventivo: normSimNao(sub.faz_controle_fungico_preventiv as string | undefined),
          faz_poda_manutencao:             normSimNao(sub.faz_poda_manutencao as string | undefined),
          faz_poda_fitossanitaria:         normSimNao(sub.faz_poda_fitossanitaria as string | undefined),
          // Agricultura regenerativa
          usa_cultura_cobertura:         normSimNao(sub.utiliza_cultura_cobertura as string | undefined),
          usa_plantio_direto:            normSimNao(sub.utiliza_plantio_direto_nova_ar as string | undefined),
          usa_material_organico:         normSimNao(sub.utiliza_organico_fertilizante as string | undefined),
          tem_plano_adubacao:            normSimNao(sub.tem_plano_adubacao as string | undefined),
          conserva_mata_ciliar:          normSimNao(sub.preserva_app as string | undefined),
          usa_cerca_viva:                normSimNao(sub.utiliza_cerca_viva as string | undefined),
          adota_mip:                     normSimNao(sub.adota_manejo_pragas_doencas as string | undefined),
          usa_agricultura_precisao:      normSimNao(sub.aplica_agricultura_precisao as string | undefined),
          participa_acoes_comunitarias:  normSimNao(sub.participa_acoes_comunitarias as string | undefined),
          faz_tratamento_casqueiro:      normSimNao(sub.faz_tratamento_casqueiro as string | undefined),
          // Campos restantes null
          idade_media_lavoura: null, tem_irrigacao: null, irrigacao_eficiente: null,
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
          poda_fitossanitaria_recomendacao: null, cultura_cobertura_recomendacao: null,
          plantio_direto_recomendacao: null, material_organico_recomendacao: null,
          plano_adubacao_recomendacao: null, mata_ciliar_recomendacao: null,
          cerca_viva_recomendacao: null, mip_recomendacao: null,
          agricultura_precisao_recomendacao: null, acoes_comunitarias_recomendacao: null,
          casqueiro_recomendacao: null,
          analise_tecnica_areas_cacau: null, analise_boas_praticas: null,
          analise_recomendacoes_proximo_ano: null, analise_agricultura_regenerativa: null,
          avaliacao_teto_produtivo: null,
          created_at: now, updated_at: now,
        }

        await supabase.from('cacau_observacoes_tecnicas').insert(cacauObs)

        // Recomendações (grupo repeat do Kobo)
        const recomdGroup = (sub.grupo_recomendacoes as Record<string, string>[] | undefined) ?? []
        for (const r of recomdGroup) {
          const setor = r.setor_ater ?? ''
          const desc = r.anotacao_realizado_discutido ?? ''
          if (!desc && !setor) continue
          await supabase.from('recommendations').insert({
            id: uuidv4(),
            workspace_id,
            visit_id: visitId,
            category: setor || 'outro',
            description: desc,
            created_at: now,
            updated_at: now,
          })
        }

      } catch (err) {
        results.errors.push(String(err))
      }
    }
  } else {
    return new Response(JSON.stringify({ error: 'form_type inválido' }), { status: 400 })
  }

  return new Response(JSON.stringify(results), {
    headers: { 'Content-Type': 'application/json' },
  })
}
