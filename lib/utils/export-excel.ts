import type { Producer, Property, Visit, Crop, FinancialRecord, CacauObservacoesTecnicas } from '@/types'
import { calcTetoProdutivo } from './cacau-scores'

interface ExportData {
  producers: Producer[]
  properties: (Property & { producer_name?: string })[]
  visits: (Visit & { producer_name?: string; property_name?: string; technician_name?: string })[]
  crops?: (Crop & { producer_name?: string; property_name?: string })[]
  financials?: (FinancialRecord & { producer_name?: string })[]
  cacauObsList?: CacauObservacoesTecnicas[]
}

export async function exportToExcel(data: ExportData, workspaceName: string) {
  const { utils, writeFile } = await import('xlsx')

  const wb = utils.book_new()

  // ── Produtores ───────────────────────────────────────────
  const producerRows = data.producers.map((p) => ({
    'Nome': p.name,
    'Telefone': p.phone ?? '',
    'E-mail': p.email ?? '',
    'Observações': p.notes ?? '',
    'Cadastrado em': new Date(p.created_at).toLocaleDateString('pt-BR'),
  }))
  const wsProd = utils.json_to_sheet(producerRows)
  wsProd['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 30 }, { wch: 40 }, { wch: 16 }]
  utils.book_append_sheet(wb, wsProd, 'Produtores')

  // ── Propriedades ─────────────────────────────────────────
  const propRows = data.properties.map((p) => ({
    'Produtor': p.producer_name ?? '',
    'Nome da Propriedade': p.name,
    'Município': p.municipality,
    'Código CAR': p.car_code ?? '',
    'Área (ha)': p.area_ha ?? '',
    'Latitude': p.gps_lat ?? '',
    'Longitude': p.gps_lng ?? '',
  }))
  const wsProp = utils.json_to_sheet(propRows)
  wsProp['!cols'] = [{ wch: 30 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 10 }, { wch: 14 }, { wch: 14 }]
  utils.book_append_sheet(wb, wsProp, 'Propriedades')

  // ── Visitas ───────────────────────────────────────────────
  const visitRows = data.visits.map((v) => ({
    'Técnico': v.technician_name ?? '',
    'Produtor': v.producer_name ?? '',
    'Propriedade': v.property_name ?? '',
    'Status': v.status === 'active' ? 'Ativa' : v.status === 'completed' ? 'Concluída' : 'Agendada',
    'Agendada para': v.scheduled_at ? new Date(v.scheduled_at).toLocaleDateString('pt-BR') : '',
    'Início': new Date(v.started_at).toLocaleString('pt-BR'),
    'Encerramento': v.ended_at ? new Date(v.ended_at).toLocaleString('pt-BR') : '',
    'Anotações': v.notes ?? '',
    'Latitude': v.gps_lat ?? '',
    'Longitude': v.gps_lng ?? '',
    'Fotos': (v.photo_urls ?? []).length,
    'Áudios': (v.audio_urls ?? []).length,
  }))
  const wsVisit = utils.json_to_sheet(visitRows)
  wsVisit['!cols'] = [{ wch: 25 }, { wch: 25 }, { wch: 20 }, { wch: 12 }, { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 50 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 8 }]
  utils.book_append_sheet(wb, wsVisit, 'Visitas')

  // ── Culturas e Safras ─────────────────────────────────────
  if (data.crops?.length) {
    const CROP_STATUS_PT: Record<string, string> = {
      planejada: 'Planejada',
      em_andamento: 'Em andamento',
      colhida: 'Colhida',
      perdida: 'Perdida',
    }
    const SEASON_TYPE_PT: Record<string, string> = {
      safra: 'Safra',
      safrinha: 'Safrinha',
      perene: 'Perene',
    }
    const cropRows = data.crops.map((c) => ({
      'Produtor': c.producer_name ?? '',
      'Propriedade': c.property_name ?? '',
      'Cultura': c.culture,
      'Variedade': c.culture_variety ?? '',
      'Ano': c.season_year,
      'Tipo de Safra': SEASON_TYPE_PT[c.season_type] ?? c.season_type,
      'Status': CROP_STATUS_PT[c.status] ?? c.status,
      'Área Plantada (ha)': c.planted_area_ha ?? '',
      'Área Cacau Produção (ha)': c.area_cacau_producao_ha ?? '',
      'Produção Ano Anterior (kg)': c.producao_ano_anterior_kg ?? '',
      'Produtividade Real (kg/ha)': c.actual_yield_kg_ha ?? '',
      'Plantio': c.planted_at ? new Date(c.planted_at).toLocaleDateString('pt-BR') : '',
      'Colheita Prevista': c.expected_harvest_at ? new Date(c.expected_harvest_at).toLocaleDateString('pt-BR') : '',
      'Colheita Real': c.harvested_at ? new Date(c.harvested_at).toLocaleDateString('pt-BR') : '',
      'Nota Análise Técnica': c.nota_analise_tecnica ?? '',
      'Nota Boas Práticas': c.nota_boas_praticas ?? '',
      'Coeficiente Fazenda': c.coeficiente_fazenda != null ? (c.coeficiente_fazenda * 100).toFixed(1) + '%' : '',
      'Teto Produtivo (kg)': c.teto_kg ?? '',
      'Teto Produtivo (kg/ha)': c.teto_kg_ha ?? '',
    }))
    const wsCrops = utils.json_to_sheet(cropRows)
    wsCrops['!cols'] = [
      { wch: 28 }, { wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 8 }, { wch: 14 }, { wch: 14 },
      { wch: 18 }, { wch: 22 }, { wch: 24 }, { wch: 22 },
      { wch: 12 }, { wch: 18 }, { wch: 14 },
      { wch: 20 }, { wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 20 },
    ]
    utils.book_append_sheet(wb, wsCrops, 'Culturas')
  }

  // ── Financeiro ────────────────────────────────────────────
  if (data.financials?.length) {
    const finRows = data.financials.map((f) => ({
      'Produtor': f.producer_name ?? '',
      'Tipo': f.type === 'receita' ? 'Receita' : 'Despesa',
      'Categoria': f.category,
      'Subcategoria': f.subcategory ?? '',
      'Descrição': f.description ?? '',
      'Valor (R$)': f.amount,
      'Quantidade': f.quantity ?? '',
      'Unidade': f.unit ?? '',
      'Data Referência': new Date(f.reference_date).toLocaleDateString('pt-BR'),
      'Período': f.reference_period ?? '',
      'É Linha de Base': f.is_baseline ? 'Sim' : 'Não',
      'Observações': f.notes ?? '',
    }))
    const wsFin = utils.json_to_sheet(finRows)
    wsFin['!cols'] = [
      { wch: 28 }, { wch: 10 }, { wch: 22 }, { wch: 28 }, { wch: 35 },
      { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 40 },
    ]
    utils.book_append_sheet(wb, wsFin, 'Financeiro')
  }

  // ── Cacau — Observações Técnicas ──────────────────────────
  if (data.cacauObsList?.length) {
    const OBS_PT: Record<string, string> = {
      sim: 'Sim',
      parcialmente: 'Parcialmente',
      nao: 'Não',
    }
    const toObs = (v: string | null) => (v ? (OBS_PT[v] ?? v) : '')

    const cacauRows = data.cacauObsList.map((o) => {
      // Find the linked crop for teto produtivo calculation
      const linkedCrop = data.crops?.find((c) => c.id === o.crop_id)
      const scores = linkedCrop
        ? calcTetoProdutivo(linkedCrop, o)
        : { nota_analise_tecnica: null, nota_boas_praticas: null, coeficiente_fazenda: null, teto_kg: null, teto_kg_ha: null }

      return {
        // Identificação
        'Visita ID': o.visit_id,
        'Safra ID': o.crop_id,
        // Seção 3 — Análise Técnica
        'Áreas Limpas e Arejadas': toObs(o.areas_limpas_arejadas),
        'Áreas Bem Adensadas': toObs(o.areas_bem_adensadas),
        'Copas Bem Formadas': toObs(o.copas_bem_formadas),
        'Plantas Saudáveis': toObs(o.plantas_saudaveis),
        'Vassoura-de-Bruxa Controlada': toObs(o.vassoura_bruxa_controlada),
        'Podridão Parda Controlada': toObs(o.podridao_parda_controlada),
        // Seção 4 — Boas Práticas
        'Faz Análise de Solo/Foliar': toObs(o.faz_analise_solo_foliar),
        'Faz Correção de Solo': toObs(o.faz_correcao_solo),
        'Faz Adubação de Solo': toObs(o.faz_adubacao_solo),
        'Faz Adubação Foliar': toObs(o.faz_adubacao_foliar),
        'Controle Fúngico Preventivo': toObs(o.faz_controle_fungico_preventivo),
        'Poda de Manutenção': toObs(o.faz_poda_manutencao),
        'Poda Fitossanitária': toObs(o.faz_poda_fitossanitaria),
        // Seção 5 — Agricultura Regenerativa
        'Cultura de Cobertura': toObs(o.usa_cultura_cobertura),
        'Plantio Direto': toObs(o.usa_plantio_direto),
        'Material Orgânico': toObs(o.usa_material_organico),
        'Plano de Adubação': toObs(o.tem_plano_adubacao),
        'Conserva Mata Ciliar': toObs(o.conserva_mata_ciliar),
        'Usa Cerca Viva': toObs(o.usa_cerca_viva),
        'Adota MIP': toObs(o.adota_mip),
        'Agricultura de Precisão': toObs(o.usa_agricultura_precisao),
        'Ações Comunitárias': toObs(o.participa_acoes_comunitarias),
        'Tratamento de Casqueiro': toObs(o.faz_tratamento_casqueiro),
        // Scores CSCacau
        'Nota Análise Técnica': scores.nota_analise_tecnica != null ? scores.nota_analise_tecnica.toFixed(1) : '',
        'Nota Boas Práticas': scores.nota_boas_praticas != null ? scores.nota_boas_praticas.toFixed(1) : '',
        'Coeficiente Fazenda': scores.coeficiente_fazenda != null ? (scores.coeficiente_fazenda * 100).toFixed(1) + '%' : '',
        'Teto Produtivo (kg)': scores.teto_kg ?? '',
        'Teto Produtivo (kg/ha)': scores.teto_kg_ha ?? '',
      }
    })
    const wsCacau = utils.json_to_sheet(cacauRows)
    wsCacau['!cols'] = Array(30).fill({ wch: 22 })
    utils.book_append_sheet(wb, wsCacau, 'Cacau')
  }

  // ── Gestão de Custos (pivot: despesas por produtor e categoria) ──
  if (data.financials?.length) {
    const despesas = data.financials.filter((f) => f.type === 'despesa')
    if (despesas.length) {
      // Group by producer → category → sum
      const pivot: Record<string, Record<string, number>> = {}
      const allCategories = new Set<string>()

      for (const f of despesas) {
        const prod = f.producer_name ?? f.producer_id
        if (!pivot[prod]) pivot[prod] = {}
        pivot[prod][f.category] = (pivot[prod][f.category] ?? 0) + f.amount
        allCategories.add(f.category)
      }

      const cats = Array.from(allCategories).sort()
      const costRows = Object.entries(pivot).map(([prod, catMap]) => {
        const row: Record<string, string | number> = { 'Produtor': prod }
        let total = 0
        for (const cat of cats) {
          const val = catMap[cat] ?? 0
          row[cat] = val
          total += val
        }
        row['TOTAL'] = total
        return row
      })

      const wsGestao = utils.json_to_sheet(costRows)
      wsGestao['!cols'] = [{ wch: 28 }, ...cats.map(() => ({ wch: 18 })), { wch: 18 }]
      utils.book_append_sheet(wb, wsGestao, 'Gestão de Custos')
    }
  }

  const filename = `plataforma-ater-${workspaceName.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xlsx`
  writeFile(wb, filename)
}
