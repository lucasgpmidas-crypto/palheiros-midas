// Testes do motor de cálculo — é aqui que mora o dinheiro.
//
//   npm test
//
// O que se protege aqui é a REGRA, não a tela: quanto o parceiro recebe, como o
// descarte entra na conta, onde uma quinzena começa e termina, e quando um prêmio
// é devido. Uma mudança que altere qualquer um desses números sem querer para
// aqui — build passando não diz nada sobre uma conta errada.
//
// O que este arquivo NÃO pega: erro de fluxo entre telas (como os dois bugs do
// lançamento em lote, que eram de filtro e de efeito, não de cálculo). Para isso
// vale gravar o fluxo real, do jeito que a revisadora usa.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import {
  calcParceria, getFaixasParceria, ratearRevisado, ratearInteiro,
  getQuinzena, getQuinzenaAtual, getQuinzenasAno, getQuinzenasDesde,
  calcQualificacao, calcPremiosAnuais, calcDestaqueAno, resumoPeriodo,
  statusConferencia, calcValor, fmtValorDia, sugerirEmpacote, isProducao,
} from './utils'

// Os mesmos parâmetros que estão gravados no banco hoje (2026-08-06).
const cfg = {
  faixaMinInter: 11, faixaMinPrem: 18,
  faixaCpBase: 85, faixaCpInter: 90, faixaCpPrem: 95,
  faixaExtBase: 85, faixaExtInter: 88, faixaExtPrem: 90,
  qualPremium: 97, qualMinima: 94, ajudaCustoDia: 10,
  qualifVol1: 7, qualifQual1: 94, qualifVol2: 10, qualifQual2: 96, qualifVol3: 12, qualifQual3: 97,
  premioQualificacao: 300, premioPadrinho: 150,
  premioProdV1: 250, premioProdP1: 500, premioProdV2: 400, premioProdP2: 1000, premioProdV3: 550, premioProdP3: 1500,
  premioFidMin: 250, premioQualAnual: 500, premioQualMin: 200,
}

const D1 = 8, D2 = 23   // corte praticado pela operação

// ── Pagamento da quinzena ────────────────────────────────────────────────────
describe('calcParceria — quanto o parceiro recebe', () => {
  it('paga pelo entregue na conferência, não pelo aprovado', () => {
    // 10.000 entregues, 9.800 aprovados: o descarte NÃO desconta.
    const r = calcParceria({ entregue: 10000, revisada: 9800, modalidade: 'cp', cfg })
    expect(r.milheiros).toBe(10)
    expect(r.valor).toBe(850)          // 10 × 85, e não 9,8 × 85
  })

  it('sobe de faixa pelo volume entregue na quinzena', () => {
    expect(calcParceria({ entregue: 10999, revisada: 10999, modalidade: 'cp', cfg }).faixaVolume.nome).toBe('Base')
    expect(calcParceria({ entregue: 11000, revisada: 11000, modalidade: 'cp', cfg }).faixaVolume.nome).toBe('Intermediária')
    expect(calcParceria({ entregue: 18000, revisada: 18000, modalidade: 'cp', cfg }).faixaVolume.nome).toBe('Premium')
  })

  it('qualidade entre a mínima e a premium derruba uma faixa', () => {
    // 18 milheiros = Premium pelo volume, mas 95% de qualidade segura em Intermediária
    const r = calcParceria({ entregue: 18000, revisada: 17100, modalidade: 'cp', cfg })
    expect(r.qualidade).toBe(95)
    expect(r.faixaVolume.nome).toBe('Premium')
    expect(r.faixaEfetiva.nome).toBe('Intermediária')
    expect(r.travada).toBe(true)
    expect(r.preco).toBe(90)
  })

  it('qualidade abaixo da mínima derruba direto para a Base', () => {
    const r = calcParceria({ entregue: 20000, revisada: 18000, modalidade: 'cp', cfg })  // 90%
    expect(r.faixaEfetiva.nome).toBe('Base')
    expect(r.preco).toBe(85)
  })

  it('qualidade em cima do limite premium mantém o preço integral', () => {
    const r = calcParceria({ entregue: 20000, revisada: 19400, modalidade: 'cp', cfg })  // 97% exato
    expect(r.qualidade).toBe(97)
    expect(r.travada).toBe(false)
    expect(r.preco).toBe(95)
  })

  it('parceiro externo tem a sua própria tabela de preços', () => {
    const r = calcParceria({ entregue: 18000, revisada: 18000, modalidade: 'externo', cfg })
    expect(r.preco).toBe(90)   // faixaExtPrem, não faixaCpPrem
  })

  it('quinzena sem conferência não inventa qualidade nem valor', () => {
    const r = calcParceria({ entregue: 0, revisada: 0, modalidade: 'cp', cfg })
    expect(r.qualidade).toBeNull()
    expect(r.valor).toBe(0)
  })

  it('faixa Base nunca é travada por qualidade (não há faixa abaixo)', () => {
    const r = calcParceria({ entregue: 5000, revisada: 4000, modalidade: 'cp', cfg })  // 80%
    expect(r.faixaEfetiva.nome).toBe('Base')
    expect(r.travada).toBe(false)
  })

  it('a tabela de faixas segue a configuração', () => {
    const f = getFaixasParceria(cfg, 'cp')
    expect(f.map(x => x.nome)).toEqual(['Base', 'Intermediária', 'Premium'])
    expect(f.map(x => x.preco)).toEqual([85, 90, 95])
  })
})

// ── Rateio do lote ───────────────────────────────────────────────────────────
describe('ratearRevisado — vários dias contados juntos', () => {
  it('divide o aprovado proporcional ao entregue de cada dia', () => {
    const r = ratearRevisado([{ entregue: 1000 }, { entregue: 3000 }], 3600)
    expect(r.map(x => x.revisada)).toEqual([900, 2700])
  })

  it('a soma do rateio bate exatamente com o total informado', () => {
    const itens = [{ entregue: 1000 }, { entregue: 1000 }, { entregue: 1000 }]
    const r = ratearRevisado(itens, 2000)
    expect(r.reduce((s, x) => s + x.revisada, 0)).toBe(2000)
  })

  it('a sobra do arredondamento vai para o maior lote', () => {
    const r = ratearRevisado([{ entregue: 3000 }, { entregue: 1000 }], 999)
    expect(r.reduce((s, x) => s + x.revisada, 0)).toBe(999)
    expect(r[0].revisada).toBeGreaterThan(r[1].revisada)
  })

  it('nunca aprova mais do que foi entregue', () => {
    const r = ratearRevisado([{ entregue: 100 }], 500)
    expect(r[0].revisada).toBe(100)
  })

  it('lote sem entrega nenhuma não quebra a conta', () => {
    const r = ratearRevisado([{ entregue: 0 }, { entregue: 0 }], 100)
    expect(r.every(x => x.revisada === 0)).toBe(true)
  })

  it('ratear não muda a qualidade da quinzena — que é a soma dividida pela soma', () => {
    const itens = [{ entregue: 1234 }, { entregue: 4321 }, { entregue: 2222 }]
    const total = itens.reduce((s, i) => s + i.entregue, 0)
    const aprovado = 7500
    const r = ratearRevisado(itens, aprovado)
    const somaAprovado = r.reduce((s, x) => s + x.revisada, 0)
    expect(somaAprovado / total).toBeCloseTo(aprovado / total, 10)
  })
})

describe('ratearInteiro — displays e maços não se partem ao meio', () => {
  it('distribui em inteiros e fecha a soma', () => {
    const r = ratearInteiro([1000, 2000, 3000], 10)
    expect(r.reduce((s, x) => s + x, 0)).toBe(10)
    expect(r.every(Number.isInteger)).toBe(true)
  })

  it('a unidade extra fica com quem tem a maior fração', () => {
    // 1 display para dois lotes desiguais: leva o maior
    expect(ratearInteiro([700, 300], 1)).toEqual([1, 0])
  })

  it('total zero ou pesos zerados devolvem tudo zero', () => {
    expect(ratearInteiro([100, 200], 0)).toEqual([0, 0])
    expect(ratearInteiro([0, 0], 5)).toEqual([0, 0])
  })
})

// ── Quinzenas ────────────────────────────────────────────────────────────────
describe('quinzenas de pagamento (corte 8 e 23)', () => {
  beforeAll(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 6, 12, 0, 0))   // 06/08/2026
  })
  afterAll(() => vi.useRealTimers())

  it('em 06/08 a quinzena corrente é 23/07 a 07/08', () => {
    const q = getQuinzenaAtual(D1, D2)
    expect(q.inicio).toBe('2026-07-23')
    expect(q.fim).toBe('2026-08-07')
  })

  it('a próxima quinzena abre em 08/08 e fecha em 22/08', () => {
    const q = getQuinzena(1, D1, D2)
    expect(q.inicio).toBe('2026-08-08')
    expect(q.fim).toBe('2026-08-22')
  })

  it('o ano tem 24 quinzenas, sem buraco e sem sobreposição', () => {
    const qs = getQuinzenasAno(2026, D1, D2)
    expect(qs).toHaveLength(24)
    for (let i = 1; i < qs.length; i++) {
      const anterior = new Date(qs[i - 1].fim + 'T12:00')
      const atual = new Date(qs[i].inicio + 'T12:00')
      const diasDeDiferenca = Math.round((atual - anterior) / 86400000)
      expect(diasDeDiferenca).toBe(1)
    }
  })

  it('a qualificação pega as 6 quinzenas seguintes ao ingresso, atravessando o ano', () => {
    const qs = getQuinzenasDesde('2026-12-10', 6, D1, D2)
    expect(qs).toHaveLength(6)
    expect(qs[0].inicio <= '2026-12-10' && qs[0].fim >= '2026-12-10').toBe(true)
    expect(qs[5].fim > '2027-01-01').toBe(true)   // entra no ano seguinte
  })
})

// ── Prêmio de qualificação ───────────────────────────────────────────────────
describe('calcQualificacao — as 6 primeiras quinzenas', () => {
  const periodo = (entregue, revisada, fim) =>
    resumoPeriodo({ inicio: '2026-01-01', fim, entregue, revisada }, 'cp', cfg)

  it('cumprir as seis aprova o prêmio', () => {
    const periodos = [
      periodo(7000, 6800, '2026-01-07'),   // 7 mil / 97,1%
      periodo(7500, 7300, '2026-01-23'),
      periodo(10000, 9700, '2026-02-07'),  // 10 mil / 97%
      periodo(10500, 10200, '2026-02-23'),
      periodo(12000, 11700, '2026-03-07'), // 12 mil / 97,5%
      periodo(12500, 12200, '2026-03-23'),
    ]
    const r = calcQualificacao({ periodos, hoje: '2026-06-01', cfg })
    expect(r.cumpridas).toBe(6)
    expect(r.aprovado).toBe(true)
    expect(r.valor).toBe(300)
    expect(r.referencia).toBe('2026-03-23')
  })

  it('falhar uma só já derruba o prêmio inteiro', () => {
    const periodos = [
      periodo(7000, 6800, '2026-01-07'),
      periodo(5000, 4900, '2026-01-23'),   // volume abaixo do exigido
      periodo(10000, 9700, '2026-02-07'),
      periodo(10500, 10200, '2026-02-23'),
      periodo(12000, 11700, '2026-03-07'),
      periodo(12500, 12200, '2026-03-23'),
    ]
    const r = calcQualificacao({ periodos, hoje: '2026-06-01', cfg })
    expect(r.falhou).toBe(true)
    expect(r.aprovado).toBe(false)
  })

  it('quinzena ainda em curso fica pendente e não reprova ninguém', () => {
    const periodos = [periodo(0, 0, '2026-12-31')]
    const r = calcQualificacao({ periodos, hoje: '2026-06-01', cfg })
    expect(r.itens[0].status).toBe('pendente')
    expect(r.falhou).toBe(false)
    expect(r.emAndamento).toBe(true)
  })

  it('exige mais volume e mais qualidade a cada etapa', () => {
    // 7 mil e 94% passam na 1ª quinzena, mas não na 3ª (que pede 10 mil e 96%)
    const p = periodo(7000, 6580, '2026-01-07')   // 94%
    expect(calcQualificacao({ periodos: [p], hoje: '2026-06-01', cfg }).itens[0].status).toBe('cumprida')
    const tres = [p, p, p].map((x, i) => ({ ...x, fim: `2026-0${i + 1}-07` }))
    expect(calcQualificacao({ periodos: tres, hoje: '2026-06-01', cfg }).itens[2].status).toBe('falhou')
  })
})

// ── Prêmios anuais ───────────────────────────────────────────────────────────
describe('calcPremiosAnuais', () => {
  const ano = (milheirosPorQuinzena, qualidade = 0.98) =>
    Array.from({ length: 24 }, (_, i) => resumoPeriodo({
      inicio: '2026-01-01', fim: '2026-01-07',
      entregue: milheirosPorQuinzena * 1000,
      revisada: Math.round(milheirosPorQuinzena * 1000 * qualidade),
    }, 'cp', cfg))

  it('a faixa de produtividade é a maior alcançada', () => {
    expect(calcPremiosAnuais({ periodos: ano(10), cfg }).produtividade.valor).toBe(0)     // 240 mil → abaixo do mínimo
    expect(calcPremiosAnuais({ periodos: ano(11), cfg }).produtividade.valor).toBe(500)   // 264 mil → 250+
    expect(calcPremiosAnuais({ periodos: ano(17), cfg }).produtividade.valor).toBe(1000)  // 408 mil → 400+
    expect(calcPremiosAnuais({ periodos: ano(24), cfg }).produtividade.valor).toBe(1500)  // 576 mil → 550+
  })

  it('a fidelidade vale dois vinte-e-quatro avos do faturamento do ano', () => {
    const periodos = ano(12)
    const r = calcPremiosAnuais({ periodos, cfg })
    expect(r.fidelidade.valor).toBeCloseTo(r.faturamento / 24 * 2, 2)
  })

  it('qualidade anual exige estar acima do padrão em TODAS as quinzenas com entrega', () => {
    expect(calcPremiosAnuais({ periodos: ano(12, 0.98), cfg }).qualidade.elegivel).toBe(true)
    const comUmaRuim = ano(12, 0.98)
    comUmaRuim[7] = resumoPeriodo({ inicio: '2026-01-01', fim: '2026-01-07', entregue: 12000, revisada: 11000 }, 'cp', cfg) // 91,7%
    expect(calcPremiosAnuais({ periodos: comUmaRuim, cfg }).qualidade.elegivel).toBe(false)
  })

  it('o destaque do ano é o maior volume entre os que mantiveram a qualidade', () => {
    const linha = (id, mil, qual) => ({ f: { id }, anual: calcPremiosAnuais({ periodos: ano(mil, qual), cfg }) })
    const vencedor = calcDestaqueAno([linha(1, 20, 0.98), linha(2, 25, 0.90), linha(3, 15, 0.99)], cfg)
    expect(vencedor.f.id).toBe(1)   // o 2 tem mais volume, mas a qualidade o tira da disputa
  })
})

// ── Conferência ──────────────────────────────────────────────────────────────
describe('statusConferencia — a mesma regra nas três telas', () => {
  const base = { base: 10000, perda: 200, tolerancia: 2 }

  it('sem conferência, o dia fica aguardando', () => {
    expect(statusConferencia({ ...base, temCQ: false, empacotado: 0 })).toBe('aguardando')
  })

  it('revisão feita e embalagem pendente não é divergência', () => {
    expect(statusConferencia({ ...base, temCQ: true, pendenteEmbalagem: true, empacotado: 0 })).toBe('aguardando_embalagem')
  })

  it('diferença dentro da tolerância fecha como ok', () => {
    expect(statusConferencia({ ...base, temCQ: true, empacotado: 9700 })).toBe('ok')      // faltam 100, limite 200
  })

  it('aponta falta e sobra além da tolerância', () => {
    expect(statusConferencia({ ...base, temCQ: true, empacotado: 9000 })).toBe('falta')
    expect(statusConferencia({ ...base, temCQ: true, empacotado: 10500 })).toBe('sobra')
  })

  it('diferença de exatamente 2% ainda é ok — a tolerância inclui o limite', () => {
    // base 10.000, perda 200, empacotado 9.600 → faltam 200, que é o limite cheio
    expect(statusConferencia({ ...base, temCQ: true, empacotado: 9600 })).toBe('ok')
    expect(statusConferencia({ ...base, temCQ: true, empacotado: 9599 })).toBe('falta')
  })
})

// ── Utilitários de exibição ──────────────────────────────────────────────────
describe('utilitários', () => {
  it('calcValor usa o preço por milheiro', () => {
    expect(calcValor(2500, 85)).toBe(212.5)
  })

  it('dia sem conferência não mostra número nenhum', () => {
    expect(fmtValorDia(null)).toBe('⏳ aguardando conferência')
    expect(fmtValorDia('')).toBe('⏳ aguardando conferência')
    expect(fmtValorDia(0)).not.toBe('⏳ aguardando conferência')   // zero conferido é zero, não pendência
  })

  it('sugerirEmpacote quebra em displays, maços e avulso', () => {
    expect(sugerirEmpacote(4250, 200, 20)).toEqual({ displays: 21, macos: 2, avulso: 10 })
  })

  it('registro antigo sem setor conta como produção', () => {
    expect(isProducao({})).toBe(true)
    expect(isProducao({ setor: 'finalizacao' })).toBe(false)
  })
})
