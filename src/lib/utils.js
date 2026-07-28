import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export const calcValor = (qty, valorMil) => ((qty || 0) / 1000) * (valorMil || 75)

export const fmtMoeda = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0)

// Valor de um dia só existe depois que o lote foi conferido. Sem conferência não há
// número a mostrar — mostrar o declarado faria o funcionário contar com dinheiro que
// ainda não foi contado, e a regra do programa paga o entregue.
export const fmtValorDia = (v) =>
  v == null || v === '' ? '⏳ aguardando conferência' : fmtMoeda(v)

export const fmtNum = (n) =>
  new Intl.NumberFormat('pt-BR').format(Math.round(n ?? 0))

export const getHoje = () => format(new Date(), 'yyyy-MM-dd')
export const getOntem = () => format(subDays(new Date(), 1), 'yyyy-MM-dd')

export const fmtData = (d, fmt = 'dd/MM/yyyy') => {
  if (!d) return '—'
  return format(new Date(d + 'T12:00'), fmt, { locale: ptBR })
}

export const fmtDataLonga = (d) =>
  fmtData(d, "EEEE, dd 'de' MMMM 'de' yyyy")

export const getIniciais = (nome = '') =>
  nome.split(' ').slice(0, 2).map((x) => x[0] || '').join('').toUpperCase()

const CORES = ['#C9A227', '#3B82F6', '#28B485', '#8B5CF6', '#F59E0B', '#06B6D4']
export const avatarCor = (id) => CORES[(id || 0) % CORES.length]

export const pctMeta = (qty, meta) => (meta > 0 ? Math.round((qty / meta) * 100) : 0)

// Funcionário do setor de produção (enrolador) — registros antigos sem setor contam como produção
export const isProducao = (f) => (f?.setor || 'producao') === 'producao'

// Sugere empacotamento: quantas displays/maços cabem e o que sobra avulso
export const sugerirEmpacote = (qtd, uniDisplay, uniMaco) => {
  const displays = Math.floor((qtd || 0) / uniDisplay)
  const resto = (qtd || 0) % uniDisplay
  const macos = Math.floor(resto / uniMaco)
  const avulso = resto % uniMaco
  return { displays, macos, avulso }
}

// A revisadora conta vários dias de uma vez e o descarte vai tudo numa caixa só:
// ela sabe quanto entregou por dia (está na etiqueta do lote), mas não sabe de qual
// dia caiu cada cigarro reprovado. Então o aprovado total é rateado proporcionalmente
// ao entregue de cada dia, e a sobra do arredondamento fica no maior lote.
// Isso não mexe em dinheiro nenhum: paga-se o entregue, e a qualidade da quinzena é
// (soma do aprovado ÷ soma do entregue) — idêntica com ou sem rateio.
export const ratearRevisado = (itens, revisadoTotal) => {
  const totalEntregue = itens.reduce((s, i) => s + (i.entregue || 0), 0)
  if (totalEntregue <= 0) return itens.map(i => ({ ...i, revisada: 0 }))
  const alvo = Math.min(revisadoTotal, totalEntregue)
  const com = itens.map(i => {
    const exato = (i.entregue || 0) / totalEntregue * alvo
    return { ...i, revisada: Math.floor(exato) }
  })
  // Distribui o que sobrou do arredondamento, começando pelo maior lote
  let resto = alvo - com.reduce((s, i) => s + i.revisada, 0)
  const ordem = [...com].sort((a, b) => b.entregue - a.entregue)
  let k = 0
  while (resto > 0 && ordem.length) {
    const alvoItem = ordem[k % ordem.length]
    if (alvoItem.revisada < alvoItem.entregue) { alvoItem.revisada++; resto-- }
    k++
    if (k > ordem.length * 2 + alvo) break   // trava de segurança
  }
  return com
}

// Divide uma quantidade INTEIRA (displays, maços) entre vários lotes, proporcional
// ao peso de cada um. Não existe meio display: quem tem a maior fração sobrando leva
// a unidade extra, e a soma fecha exatamente com o total informado.
export const ratearInteiro = (pesos, total) => {
  const soma = pesos.reduce((s, p) => s + p, 0)
  if (soma <= 0 || total <= 0) return pesos.map(() => 0)
  const exatos = pesos.map(p => p / soma * total)
  const base = exatos.map(Math.floor)
  let resto = total - base.reduce((s, b) => s + b, 0)
  const ordem = exatos
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac)
  let k = 0
  while (resto > 0 && ordem.length) { base[ordem[k % ordem.length].i]++; resto--; k++ }
  return base
}

// Status da conferência produção × revisão/embalagem, com a mesma regra de tolerância
// usada em Alertas, Conferência e Dashboard — evita a fórmula divergir entre as telas.
// pendenteEmbalagem: revisão já foi lançada, mas ninguém completou a etapa de displays ainda.
export const statusConferencia = ({ temCQ, pendenteEmbalagem, base, perda, empacotado, tolerancia }) => {
  if (!temCQ) return 'aguardando'
  if (pendenteEmbalagem) return 'aguardando_embalagem'
  const diferenca = base - perda - empacotado
  const limite = Math.round(base * tolerancia / 100)
  if (Math.abs(diferenca) <= limite) return 'ok'
  return diferenca > 0 ? 'falta' : 'sobra'
}

// ── Programa de Parceria (quinzenal) ─────────────────────────────────────────
// Paga-se o ENTREGUE na conferência: tudo o que o parceiro levou e foi contado
// fisicamente na revisão, inclusive o que foi descartado ali. O descarte não tira
// dinheiro dele — quem pune descarte é a trava de qualidade, derrubando a faixa.
// O que NÃO é pago é o faltante: o que ele declarou e nunca chegou na conferência.
// O volume entregue da quinzena define a faixa, que vale para toda ela.
// A qualidade da quinzena (revisada ÷ entregue) pode travar o preço numa faixa inferior:
//   qualidade ≥ qual_premium → preço integral da faixa alcançada
//   qual_minima ≤ qualidade < qual_premium → preço da faixa anterior
//   qualidade < qual_minima → preço da faixa Base
// Usada por MinhaProducao, Folha e HistEquipe — o cálculo nunca deve divergir entre telas.
export const getFaixasParceria = (cfg, modalidade = 'cp') => {
  const m = modalidade === 'externo' ? 'Ext' : 'Cp'
  return [
    { nome: 'Base', min: 0, preco: cfg[`faixa${m}Base`] },
    { nome: 'Intermediária', min: cfg.faixaMinInter, preco: cfg[`faixa${m}Inter`] },
    { nome: 'Premium', min: cfg.faixaMinPrem, preco: cfg[`faixa${m}Prem`] },
  ]
}

export const calcParceria = ({ entregue, revisada, modalidade, cfg }) => {
  const faixas = getFaixasParceria(cfg, modalidade)
  const milheiros = (entregue || 0) / 1000
  const qualidade = entregue > 0 ? (revisada || 0) / entregue * 100 : null
  let idxVolume = 0
  faixas.forEach((fx, i) => { if (i > 0 && milheiros >= fx.min) idxVolume = i })
  let idxEfetiva = idxVolume
  if (qualidade != null && idxVolume > 0) {
    if (qualidade < cfg.qualMinima) idxEfetiva = 0
    else if (qualidade < cfg.qualPremium) idxEfetiva = idxVolume - 1
  }
  const preco = faixas[idxEfetiva].preco
  const proxima = idxVolume < faixas.length - 1
    ? { ...faixas[idxVolume + 1], faltam: faixas[idxVolume + 1].min - milheiros }
    : null
  return {
    milheiros, qualidade, faixas,
    faixaVolume: faixas[idxVolume], faixaEfetiva: faixas[idxEfetiva],
    travada: idxEfetiva < idxVolume,
    preco, valor: Math.round(milheiros * preco * 100) / 100, proxima,
  }
}

export const fmtMilheiros = (m) =>
  (m ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })

// ── Prêmios do Programa de Parceria (itens 4 e 5 do documento v3) ─────────────
// Tudo aqui é apurado por QUINZENA e sempre sobre o ENTREGUE na conferência
// — a mesma base do pagamento. Um período só entra na conta quando
// tem conferência; quinzena sem entrega conta como zero, não como falha de
// qualidade (qualidade fica nula).
//
// Um "período" é sempre { inicio, fim, entregue, revisada } — quem monta essa
// lista é o hook useApuracaoPremios; aqui só se aplica a regra.
export const resumoPeriodo = (p, modalidade, cfg) => {
  const parceria = calcParceria({ entregue: p.entregue, revisada: p.revisada, modalidade, cfg })
  return { ...p, ...parceria }
}

// Etapas da qualificação: 3 blocos de 2 quinzenas com exigência crescente.
export const getEtapasQualif = (cfg) => [
  { nome: '1ª etapa', quinzenas: [1, 2], vol: cfg.qualifVol1, qual: cfg.qualifQual1 },
  { nome: '2ª etapa', quinzenas: [3, 4], vol: cfg.qualifVol2, qual: cfg.qualifQual2 },
  { nome: '3ª etapa', quinzenas: [5, 6], vol: cfg.qualifVol3, qual: cfg.qualifQual3 },
]

// Prêmio de Qualificação: as 6 primeiras quinzenas do parceiro no programa.
// Precisa cumprir volume E qualidade em TODAS as 6 — basta uma falhar para o
// prêmio não sair (regra do item 4 do documento). Quinzena ainda em curso ou
// sem conferência fica 'pendente' e não reprova ninguém antes da hora.
export const calcQualificacao = ({ periodos, hoje, cfg }) => {
  const etapas = getEtapasQualif(cfg)
  const exigencia = (i) => etapas.find(e => e.quinzenas.includes(i + 1)) || etapas[2]
  const itens = periodos.slice(0, 6).map((p, i) => {
    const e = exigencia(i)
    const encerrada = p.fim < hoje
    const volOk = p.milheiros >= e.vol
    const qualOk = p.qualidade != null && p.qualidade >= e.qual
    const status = volOk && qualOk ? 'cumprida' : encerrada ? 'falhou' : 'pendente'
    return { ...p, ordem: i + 1, etapa: e, volOk, qualOk, encerrada, status }
  })
  const concluida = itens.length === 6 && itens.every(x => x.encerrada)
  const falhou = itens.some(x => x.status === 'falhou')
  const cumpridas = itens.filter(x => x.status === 'cumprida').length
  return {
    itens, etapas, concluida, falhou, cumpridas,
    aprovado: concluida && !falhou,
    emAndamento: !concluida && !falhou,
    valor: cfg.premioQualificacao,
    // A referência do prêmio é a data-fim da 6ª quinzena — o fechamento em que ele é pago
    referencia: itens[5]?.fim || null,
  }
}

// Faixas do Prêmio Anual de Produtividade, da maior para a menor
export const getFaixasProdutividade = (cfg) => [
  { min: cfg.premioProdV3, valor: cfg.premioProdP3 },
  { min: cfg.premioProdV2, valor: cfg.premioProdP2 },
  { min: cfg.premioProdV1, valor: cfg.premioProdP1 },
]

// Prêmios anuais (item 5): produtividade por volume, fidelidade pela média de
// faturamento, e qualidade anual. O Parceiro Destaque não sai daqui — depende da
// comparação entre parceiros e é decidido em calcDestaqueAno.
export const calcPremiosAnuais = ({ periodos, cfg }) => {
  const comEntrega = periodos.filter(p => p.entregue > 0)
  const milheiros = periodos.reduce((s, p) => s + p.milheiros, 0)
  const entregue = periodos.reduce((s, p) => s + (p.entregue || 0), 0)
  const revisada = periodos.reduce((s, p) => s + (p.revisada || 0), 0)
  const faturamento = periodos.reduce((s, p) => s + p.valor, 0)
  const qualidadeMedia = entregue > 0 ? revisada / entregue * 100 : null

  const faixaProd = getFaixasProdutividade(cfg).find(f => milheiros >= f.min) || null

  // Fidelidade: valor = total pago no ano (só produção, sem ajuda de custo) ÷ 24 × 2,
  // ou seja, dois quinze-avos — o equivalente a um mês médio de faturamento.
  const valorFidelidade = Math.round(faturamento / periodos.length * 2 * 100) / 100
  const semEntrega = periodos.filter(p => p.fim < getHoje() && !p.entregue).length

  // Qualidade anual: precisa estar acima do padrão em TODAS as quinzenas com entrega
  const todasAcima = comEntrega.length > 0 && comEntrega.every(p => p.qualidade >= cfg.qualPremium)

  return {
    milheiros, entregue, revisada, faturamento, qualidadeMedia,
    quinzenasComEntrega: comEntrega.length, quinzenasSemEntrega: semEntrega,
    produtividade: { elegivel: !!faixaProd, valor: faixaProd?.valor || 0, faixaMin: faixaProd?.min || null },
    fidelidade: {
      elegivel: milheiros >= cfg.premioFidMin,
      valor: valorFidelidade,
      continuo: semEntrega === 0,
    },
    qualidade: {
      elegivel: todasAcima && milheiros >= cfg.premioQualMin,
      valor: cfg.premioQualAnual,
      todasAcima, volumeOk: milheiros >= cfg.premioQualMin,
    },
  }
}

// Parceiro Destaque do Ano: maior volume entre os que mantiveram qualidade acima
// do padrão; empate no volume decide pela maior qualidade média (item 5.4).
export const calcDestaqueAno = (linhas, cfg) => {
  const elegiveis = linhas.filter(l => l.anual.qualidadeMedia != null && l.anual.qualidadeMedia >= cfg.qualPremium && l.anual.milheiros > 0)
  if (!elegiveis.length) return null
  return elegiveis.sort((a, b) =>
    b.anual.milheiros - a.anual.milheiros || b.anual.qualidadeMedia - a.anual.qualidadeMedia
  )[0]
}

export const corQualidade = (q, cfg) =>
  q == null ? 'var(--text3)' : q >= cfg.qualPremium ? 'var(--green)' : q >= cfg.qualMinima ? 'var(--amber)' : 'var(--red)'

export const corPct = (p) => {
  if (p >= 100) return 'var(--green)'
  if (p >= 70) return 'var(--gold-light)'
  if (p > 0) return 'var(--amber)'
  return 'var(--red)'
}

export const getSemana = (dateStr) => {
  const d = new Date(dateStr + 'T12:00')
  return {
    inicio: format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    fim: format(endOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
  }
}

export const getMes = (mesStr) => {
  const d = new Date(mesStr + '-15')
  return {
    inicio: format(startOfMonth(d), 'yyyy-MM-dd'),
    fim: format(endOfMonth(d), 'yyyy-MM-dd'),
  }
}

// Quinzenas de pagamento. Os dias de corte vêm das Configurações (chaves
// quinzena_d1/quinzena_d2): d1 = dia que abre a 1ª quinzena, d2 = dia que abre a 2ª.
// 1ª: d1 até (d2−1) do mesmo mês · 2ª: d2 até (d1−1) do mês seguinte — sem sobreposição.
export const getQuinzena = (num, d1 = 9, d2 = 24) => {
  const hoje = new Date()
  const dia = hoje.getDate()
  const ano = hoje.getFullYear()
  const mes = hoje.getMonth()
  if (num === 1) {
    return {
      inicio: format(new Date(ano, mes, d1), 'yyyy-MM-dd'),
      fim: format(new Date(ano, mes, d2 - 1), 'yyyy-MM-dd'),
    }
  }
  if (dia >= d2) {
    return {
      inicio: format(new Date(ano, mes, d2), 'yyyy-MM-dd'),
      fim: format(new Date(ano, mes + 1, d1 - 1), 'yyyy-MM-dd'),
    }
  }
  return {
    inicio: format(new Date(ano, mes - 1, d2), 'yyyy-MM-dd'),
    fim: format(new Date(ano, mes, d1 - 1), 'yyyy-MM-dd'),
  }
}

// Quinzena que contém a data de hoje
export const getQuinzenaAtual = (d1 = 9, d2 = 24) => {
  const dia = new Date().getDate()
  const num = dia >= d1 && dia < d2 ? 1 : 2
  return { ...getQuinzena(num, d1, d2), num }
}

// As 24 quinzenas de um ano-calendário, com os mesmos dias de corte das
// Configurações — base das apurações anuais de prêmios. Com o corte do programa
// (d1=1, d2=16) o ano fecha exatamente de 1º de janeiro a 31 de dezembro.
export const getQuinzenasAno = (ano, d1 = 9, d2 = 24) => {
  const out = []
  for (let m = 0; m < 12; m++) {
    out.push({
      ordem: m * 2 + 1,
      inicio: format(new Date(ano, m, d1), 'yyyy-MM-dd'),
      fim: format(new Date(ano, m, d2 - 1), 'yyyy-MM-dd'),
    })
    out.push({
      ordem: m * 2 + 2,
      inicio: format(new Date(ano, m, d2), 'yyyy-MM-dd'),
      fim: format(new Date(ano, m + 1, d1 - 1), 'yyyy-MM-dd'),
    })
  }
  return out
}

// As n primeiras quinzenas a partir da data de ingresso do parceiro (a quinzena
// que contém a data já conta como a 1ª). Usada na qualificação, que pode
// atravessar a virada do ano — por isso varre o ano anterior e o seguinte.
export const getQuinzenasDesde = (dataIni, n, d1 = 9, d2 = 24) => {
  const ano = Number(String(dataIni).slice(0, 4))
  return [ano - 1, ano, ano + 1]
    .flatMap(a => getQuinzenasAno(a, d1, d2))
    .filter(q => q.fim >= dataIni)
    .slice(0, n)
    .map((q, i) => ({ ...q, ordem: i + 1 }))
}

export const ultimosDias = (n) =>
  Array.from({ length: n }, (_, i) =>
    format(subDays(new Date(), n - 1 - i), 'yyyy-MM-dd')
  )

export const exportCSV = (rows, filename) => {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export const exportXLSX = (sheets, filename) => {
  import('xlsx').then((XLSX) => {
    const wb = XLSX.utils.book_new()
    sheets.forEach(({ name, rows }) => {
      const ws = XLSX.utils.aoa_to_sheet(rows)
      XLSX.utils.book_append_sheet(wb, ws, name)
    })
    XLSX.writeFile(wb, filename)
  })
}
