import { getHoje } from './datas'

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
