import type { SupabaseClient } from '@supabase/supabase-js'
import { calcNotaAnaliseTecnica, calcNotaBoasPraticas } from '@/lib/utils/cacau-scores'

export interface PDAOptions {
  visitId: string
  format: 'pdf' | 'docx'
  supabase: SupabaseClient
}

// ── Rótulos legíveis para os valores dos checkboxes ───────────
const SIM_NAO_LABEL: Record<string, string> = {
  sim: 'Sim', parcialmente: 'Parcialmente', nao: 'Não',
}

const SISTEMA_PRODUCAO_LABEL: Record<string, string> = {
  cacau_consorcio: 'Cacau em consórcio',
  cacau_saf:       'Cacau em SAF',
  cacau_monocultivo: 'Cacau em monocultivo',
  cacau_cabruca:   'Cacau Cabruca',
}

function fmt(v: string | null | undefined): string {
  if (!v) return '—'
  return SIM_NAO_LABEL[v] ?? v
}

function fmtNum(v: number | null | undefined, decimals = 0): string {
  if (v === null || v === undefined) return '—'
  return v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export async function generatePDA({ visitId, format, supabase }: PDAOptions): Promise<Buffer> {
  // ── 1. Buscar todos os dados ─────────────────────────────────
  const [visitRes, obsRes, recsRes, finsRes] = await Promise.all([
    supabase
      .from('visits')
      .select('*, producers(*), properties(*)')
      .eq('id', visitId)
      .single(),
    supabase
      .from('cacau_observacoes_tecnicas')
      .select('*')
      .eq('visit_id', visitId)
      .maybeSingle(),
    supabase
      .from('recommendations')
      .select('*')
      .eq('visit_id', visitId)
      .order('category'),
    supabase
      .from('financial_records')
      .select('*')
      .eq('visit_id', visitId)
      .order('reference_date'),
  ])

  if (visitRes.error || !visitRes.data) throw new Error('Visita não encontrada')

  const visit = visitRes.data
  const producer = visit.producers as Record<string, string>
  const property = visit.properties as Record<string, unknown>
  const obs = obsRes.data
  const recs = recsRes.data ?? []
  const fins = finsRes.data ?? []

  // Buscar safra de cacau associada
  const { data: visitCrops } = await supabase
    .from('visit_crops')
    .select('crop_id')
    .eq('visit_id', visitId)

  let crop: Record<string, unknown> | null = null
  if (visitCrops && visitCrops.length > 0) {
    const cropIds = visitCrops.map((vc: { crop_id: string }) => vc.crop_id)
    const { data: cropsData } = await supabase
      .from('crops')
      .select('*')
      .in('id', cropIds)
      .eq('culture', 'cacau')
      .limit(1)
    crop = cropsData?.[0] ?? null
  }

  // ── 2. Calcular scores (se obs disponível) ───────────────────
  const notaAT = obs ? calcNotaAnaliseTecnica(obs) : 0
  const notaBP = obs ? calcNotaBoasPraticas(obs) : 0
  const scoreCSCacau = (notaAT + notaBP) / 2

  // ── 3. Data de emissão formatada ─────────────────────────────
  const visitedAt = visit.visited_at
    ? new Date(visit.visited_at).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    : new Date(visit.started_at).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  // ── 4. Montar HTML do documento ──────────────────────────────
  const html = buildPDAHtml({
    visit, producer, property, crop, obs, recs, fins,
    notaAT, notaBP, scoreCSCacau, visitedAt,
  })

  // ── 5. Gerar PDF com jsPDF via html2canvas (server-side: retorna HTML) ──
  // No server usamos uma abordagem simples: retornar o HTML como buffer
  // e deixar o cliente converter, OU usar uma lib que funcione no Node.
  // Aqui retornamos o HTML renderizável com Content-Type application/pdf
  // usando a biblioteca puppeteer quando disponível, senão retorna HTML.

  // Tentativa: usar @sparticuz/chromium + puppeteer-core se disponível
  try {
    const pdfBuffer = await renderPdfFromHtml(html)
    return pdfBuffer
  } catch {
    // Fallback: retornar HTML como buffer (o usuário pode imprimir como PDF)
    return Buffer.from(html, 'utf-8')
  }
}

async function renderPdfFromHtml(html: string): Promise<Buffer> {
  // Tenta usar puppeteer se disponível no ambiente
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const puppeteer: any = await (eval('import("puppeteer")') as Promise<any>).catch(() => null)
  if (!puppeteer) throw new Error('puppeteer não disponível')

  const browser = await puppeteer.default.launch({ headless: true, args: ['--no-sandbox'] })
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' } })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}

// ── HTML template do Laudo PDA ────────────────────────────────
function buildPDAHtml(ctx: {
  visit: Record<string, unknown>
  producer: Record<string, string>
  property: Record<string, unknown> | null
  crop: Record<string, unknown> | null
  obs: Record<string, unknown> | null
  recs: Record<string, unknown>[]
  fins: Record<string, unknown>[]
  notaAT: number
  notaBP: number
  scoreCSCacau: number
  visitedAt: string
}): string {
  const { visit, producer, property, crop, obs, recs, fins, notaAT, notaBP, scoreCSCacau, visitedAt } = ctx

  const coeficiente = (notaAT + notaBP) / 2 / 10
  const benchmarkKgHa = 847
  const areaProd = (crop?.area_cacau_producao_ha as number) ?? (crop?.planted_area_ha as number) ?? 0
  const tetoKg = coeficiente * areaProd * benchmarkKgHa
  const tetoKgHa = areaProd > 0 ? tetoKg / areaProd : 0

  // Recomendações por categoria
  const recsByCategory: Record<string, string[]> = {}
  for (const rec of recs) {
    const cat = (rec.category as string) ?? 'outro'
    if (!recsByCategory[cat]) recsByCategory[cat] = []
    recsByCategory[cat].push(rec.description as string)
  }

  // Financeiro: agrupar por subcategoria
  const despesas = fins.filter((f) => f.type === 'despesa')
  const receitas = fins.filter((f) => f.type === 'receita')
  const totalDespesas = despesas.reduce((s, f) => s + (f.amount as number), 0)
  const totalReceitas = receitas.reduce((s, f) => s + (f.amount as number), 0)

  const obsSimNao = (campo: string) => obs ? SIM_NAO_LABEL[(obs[campo] as string) ?? ''] ?? '—' : '—'

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Laudo PDA — ${producer?.name ?? ''}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11pt; color: #1a1a1a; margin: 0; padding: 0; }
  h1 { font-size: 18pt; color: #2d6a2d; text-align: center; margin-bottom: 4px; }
  h2 { font-size: 13pt; color: #2d6a2d; border-bottom: 2px solid #2d6a2d; padding-bottom: 4px; margin-top: 20px; }
  h3 { font-size: 11pt; color: #444; margin-top: 14px; margin-bottom: 6px; }
  .subtitle { text-align: center; color: #666; font-size: 10pt; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10pt; }
  th { background: #2d6a2d; color: white; padding: 6px 8px; text-align: left; }
  td { padding: 5px 8px; border-bottom: 1px solid #eee; }
  tr:nth-child(even) td { background: #f9f9f9; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; margin-bottom: 12px; font-size: 10pt; }
  .info-item { display: flex; gap: 4px; }
  .info-label { font-weight: bold; color: #555; min-width: 140px; }
  .score-box { display: inline-block; background: #e8f5e9; border: 1px solid #4caf50; border-radius: 8px; padding: 8px 16px; margin: 4px; text-align: center; }
  .score-box .valor { font-size: 20pt; font-weight: bold; color: #2d6a2d; }
  .score-box .label { font-size: 9pt; color: #666; }
  .teto-box { background: #f1f8e9; border-left: 4px solid #7cb342; padding: 12px 16px; margin: 12px 0; }
  .nota-rodape { font-size: 8pt; color: #888; margin-top: 20px; border-top: 1px solid #ddd; padding-top: 8px; }
  .rec-cat { font-weight: bold; color: #2d6a2d; margin-top: 10px; }
  .page-break { page-break-before: always; }
</style>
</head>
<body>

<h1>Laudo de Plano de Desenvolvimento da Atividade</h1>
<p class="subtitle">Projeto Cargill / CocoaAction Brasil — ATER Cacau</p>

<!-- SEÇÃO 1: Identificação -->
<h2>1. Identificação</h2>
<div class="info-grid">
  <div class="info-item"><span class="info-label">Fazenda:</span>${String(property?.name ?? '—')}</div>
  <div class="info-item"><span class="info-label">Proprietário:</span>${producer?.name ?? '—'}</div>
  <div class="info-item"><span class="info-label">Município:</span>${producer?.city ?? String(property?.municipality ?? '—')}/PA</div>
  <div class="info-item"><span class="info-label">Estado:</span>Pará</div>
  <div class="info-item"><span class="info-label">Data de emissão:</span>${visitedAt}</div>
  <div class="info-item"><span class="info-label">Sistema de produção:</span>${SISTEMA_PRODUCAO_LABEL[String(crop?.sistema_producao ?? '')] ?? '—'}</div>
</div>

<!-- SEÇÃO 3: Análise Técnica -->
<h2>3. Análise Técnica das Áreas de Cacau</h2>
<table>
  <tr><th>O que foi observado</th><th>Avaliação</th></tr>
  <tr><td>Áreas de produção estão limpas e arejadas?</td><td>${obsSimNao('areas_limpas_arejadas')}</td></tr>
  <tr><td>Áreas estão bem adensadas?</td><td>${obsSimNao('areas_bem_adensadas')}</td></tr>
  <tr><td>Copas bem formadas, baixas e desentrelaçadas?</td><td>${obsSimNao('copas_bem_formadas')}</td></tr>
  <tr><td>Plantas saudáveis / sem deficiência de nutrientes?</td><td>${obsSimNao('plantas_saudaveis')}</td></tr>
  <tr><td>Vassoura de Bruxa bem controlada?</td><td>${obsSimNao('vassoura_bruxa_controlada')}</td></tr>
  <tr><td>Podridão Parda bem controlada?</td><td>${obsSimNao('podridao_parda_controlada')}</td></tr>
</table>
${obs?.analise_tecnica_areas_cacau ? `<p>${obs.analise_tecnica_areas_cacau}</p>` : ''}

<!-- SEÇÃO 4: Boas Práticas -->
<h2>4. Boas Práticas Agrícolas</h2>
<table>
  <tr><th>Prática</th><th>Observado</th></tr>
  <tr><td>Análise de solo/foliar</td><td>${obsSimNao('faz_analise_solo_foliar')}</td></tr>
  <tr><td>Correção do solo</td><td>${obsSimNao('faz_correcao_solo')}</td></tr>
  <tr><td>Adubação de solo</td><td>${obsSimNao('faz_adubacao_solo')}</td></tr>
  <tr><td>Adubação foliar</td><td>${obsSimNao('faz_adubacao_foliar')}</td></tr>
  <tr><td>Controle Fúngico preventivo</td><td>${obsSimNao('faz_controle_fungico_preventivo')}</td></tr>
  <tr><td>Poda de Manutenção</td><td>${obsSimNao('faz_poda_manutencao')}</td></tr>
  <tr><td>Poda Fitossanitária</td><td>${obsSimNao('faz_poda_fitossanitaria')}</td></tr>
</table>
${obs?.analise_boas_praticas ? `<p>${obs.analise_boas_praticas}</p>` : ''}

<h3>4.1 Recomendações de melhorias para o próximo ano</h3>
<table>
  <tr><th>Necessidade de mudança</th><th>Desenvolve?</th><th>Como iniciar</th></tr>
  <tr><td>Limpeza e Arejamento das áreas</td><td>${obsSimNao('areas_limpas_arejadas')}</td><td>${fmt(obs?.areas_limpas_como_iniciar as string)}</td></tr>
  <tr><td>Adensamento</td><td>${obsSimNao('areas_bem_adensadas')}</td><td>${fmt(obs?.areas_adensadas_como_iniciar as string)}</td></tr>
  <tr><td>Formação das plantas</td><td>${obsSimNao('copas_bem_formadas')}</td><td>${fmt(obs?.copas_formadas_como_iniciar as string)}</td></tr>
  <tr><td>Saúde das plantas</td><td>${obsSimNao('plantas_saudaveis')}</td><td>${fmt(obs?.plantas_saudaveis_como_iniciar as string)}</td></tr>
  <tr><td>Controle Vassoura de bruxa</td><td>${obsSimNao('vassoura_bruxa_controlada')}</td><td>${fmt(obs?.vassoura_bruxa_como_iniciar as string)}</td></tr>
  <tr><td>Controle Podridão Parda</td><td>${obsSimNao('podridao_parda_controlada')}</td><td>${fmt(obs?.podridao_parda_como_iniciar as string)}</td></tr>
</table>

<!-- SEÇÃO 5: Agricultura Regenerativa -->
<h2>5. Agricultura Regenerativa</h2>
<table>
  <tr><th>Estratégia</th><th>Observado</th></tr>
  <tr><td>Cobertura em linha</td><td>${obsSimNao('usa_cultura_cobertura')}</td></tr>
  <tr><td>Revolvimento mínimo do solo</td><td>${obsSimNao('usa_plantio_direto')}</td></tr>
  <tr><td>Fertilizante orgânico</td><td>${obsSimNao('usa_material_organico')}</td></tr>
  <tr><td>Recomendação de adubação</td><td>${obsSimNao('tem_plano_adubacao')}</td></tr>
  <tr><td>Conservação de mata ciliar</td><td>${obsSimNao('conserva_mata_ciliar')}</td></tr>
  <tr><td>Cerca Viva</td><td>${obsSimNao('usa_cerca_viva')}</td></tr>
  <tr><td>Manejo de Pragas e doenças (MIP)</td><td>${obsSimNao('adota_mip')}</td></tr>
  <tr><td>Agricultura de Precisão</td><td>${obsSimNao('usa_agricultura_precisao')}</td></tr>
  <tr><td>Ações comunitárias para proteção dos recursos</td><td>${obsSimNao('participa_acoes_comunitarias')}</td></tr>
  <tr><td>Tratamento do casqueiro</td><td>${obsSimNao('faz_tratamento_casqueiro')}</td></tr>
</table>

<!-- SEÇÃO 6: Quadro de Áreas -->
<h2>6. Quadro de Áreas <sup>1</sup></h2>
<div class="info-grid">
  <div class="info-item"><span class="info-label">Sistema de produção:</span>${SISTEMA_PRODUCAO_LABEL[String(crop?.sistema_producao ?? '')] ?? '—'}</div>
  <div class="info-item"><span class="info-label">Área total da propriedade (ha):</span>${fmtNum(property?.area_ha as number, 1)}</div>
  <div class="info-item"><span class="info-label">Área de cacau total declarada (ha):</span>${fmtNum(crop?.area_cacau_declarada_ha as number, 1)}</div>
  <div class="info-item"><span class="info-label">Área de cacau produtivo (ha):</span>${fmtNum(crop?.area_cacau_producao_ha as number, 1)}</div>
  <div class="info-item"><span class="info-label">Número de talhões:</span>${fmtNum(crop?.numero_talhoes as number)}</div>
  <div class="info-item"><span class="info-label">Área arrendada (ha):</span>${fmtNum(crop?.area_arrendada_ha as number, 1)}</div>
  <div class="info-item"><span class="info-label">Área em consórcio (ha):</span>${fmtNum(crop?.area_consorcio_ha as number, 1)}</div>
  <div class="info-item"><span class="info-label">Área irrigada (ha):</span>${fmtNum(crop?.area_irrigada_ha as number, 1)}</div>
  <div class="info-item"><span class="info-label">Produção da última safra (kg):</span>${fmtNum(crop?.producao_ano_anterior_kg as number)}</div>
</div>

<!-- SEÇÃO 7: Teto Produtivo -->
<h2>7. Estimativa de Teto Produtivo <sup>2</sup></h2>
<div style="text-align:center; margin:12px 0;">
  <div class="score-box"><div class="valor">${notaAT.toFixed(1)}</div><div class="label">Análise Técnica<br/>da Lavoura</div></div>
  <div class="score-box"><div class="valor">${notaBP.toFixed(1)}</div><div class="label">Adoção das<br/>Boas Práticas</div></div>
  <div class="score-box"><div class="valor">${scoreCSCacau.toFixed(1)}</div><div class="label">Score<br/>CSCacau</div></div>
  <div class="score-box"><div class="valor">${(coeficiente * 100).toFixed(0)}%</div><div class="label">Coeficiente<br/>da Fazenda</div></div>
</div>

<div class="teto-box">
  <strong>Teto produtivo = Coeficiente × Área em produção × ${benchmarkKgHa} kg/ha (benchmark regional)</strong><br/>
  <span style="font-size:14pt; font-weight:bold; color:#2d6a2d;">${fmtNum(tetoKg, 0)} kg totais &nbsp;|&nbsp; ${fmtNum(tetoKgHa, 0)} kg/ha</span>
</div>
${obs?.avaliacao_teto_produtivo ? `<p>${obs.avaliacao_teto_produtivo}</p>` : ''}

<!-- SEÇÃO 8: Recomendações Técnicas -->
<h2 class="page-break">8. Ficha de Recomendação Técnica</h2>
${Object.keys(recsByCategory).length === 0
  ? '<p>Nenhuma recomendação registrada para esta visita.</p>'
  : Object.entries(recsByCategory).map(([cat, texts]) => `
    <p class="rec-cat">${cat.replace(/_/g, ' ')}</p>
    ${texts.map((t) => `<p style="margin-left:12px;">• ${t}</p>`).join('')}
  `).join('')
}

<!-- SEÇÃO 9: Gestão de Custos -->
${fins.length > 0 ? `
<h2>9. Gestão de Custos</h2>
<table>
  <tr><th>Tipo</th><th>Categoria</th><th>Subcategoria</th><th>Descrição</th><th>Qtd</th><th>Un</th><th>Valor (R$)</th></tr>
  ${despesas.map((f) => `
    <tr>
      <td>Despesa</td>
      <td>${f.category}</td>
      <td>${f.subcategory ?? '—'}</td>
      <td>${f.description ?? '—'}</td>
      <td>${f.quantity ?? '—'}</td>
      <td>${f.unit ?? '—'}</td>
      <td>${fmtNum(f.amount as number, 2)}</td>
    </tr>
  `).join('')}
  ${receitas.map((f) => `
    <tr>
      <td>Receita</td>
      <td>${f.category}</td>
      <td>${f.subcategory ?? '—'}</td>
      <td>${f.description ?? '—'}</td>
      <td>${f.quantity ?? '—'}</td>
      <td>${f.unit ?? '—'}</td>
      <td>${fmtNum(f.amount as number, 2)}</td>
    </tr>
  `).join('')}
</table>
<div style="text-align:right; margin-top:8px; font-size:10pt;">
  <strong>Total receitas: R$ ${fmtNum(totalReceitas, 2)}</strong> &nbsp;|&nbsp;
  <strong>Total despesas: R$ ${fmtNum(totalDespesas, 2)}</strong> &nbsp;|&nbsp;
  <strong>Margem: R$ ${fmtNum(totalReceitas - totalDespesas, 2)}</strong>
</div>
` : ''}

<!-- Notas de rodapé -->
<div class="nota-rodape">
  <p><strong>Nota 1 —</strong> As informações apresentadas na seção 6 são de responsabilidade exclusiva dos/as produtores/as entrevistados/as. Elas refletem suas experiências, percepções e pontos de vista pessoais, e não necessariamente representam a posição oficial dos organizadores, veículos de mídia ou demais envolvidos na produção deste conteúdo. Dados mencionados devem ser considerados como relatos informais, sujeitos à verificação independente.</p>
  <p><strong>Nota 2 —</strong> O valor utilizado como referência para a produtividade regional é de 847 kg/ha, disponibilizado no Relatório Anual da safra de cacau no estado do Pará para o ano de 2024. Esse Relatório faz parte do projeto "Previsão de Safra de Cacau no Estado do Pará", tendo como responsável a Secretaria de Estado de Desenvolvimento Agropecuário e da Pesca (Sedap), com a interveniência técnica da Comissão Executiva do Plano da Lavoura Cacaueira (Ceplac) e financiado pelo Fundo de Desenvolvimento da Cacauicultura no Pará (Funcacau).</p>
</div>

</body>
</html>`
}
