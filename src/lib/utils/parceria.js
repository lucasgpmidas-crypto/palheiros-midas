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
