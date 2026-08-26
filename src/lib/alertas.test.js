// Testes dos alertas do admin — é aqui que o sistema levanta a mão.
//
//   npm test
//
// O que se protege aqui é QUANDO o aviso aparece. Um alerta que não dispara
// esconde produção sumida no trajeto Barretos → Orlândia; um que dispara demais
// vira ruído e ensina o admin a ignorar o sino. Os dois estragam a mesma coisa,
// e nenhum dos dois quebra o build.
//
// A montagem virou função pura justamente para caber aqui: ela recebe `hoje` e o
// início da quinzena em vez de ler o relógio, então o teste fixa a data e o
// resultado não muda conforme o dia em que se roda.

import { describe, it, expect } from 'vitest'
import { montarAlertas } from './alertas-regras'

const HOJE = '2026-08-26'
const cfg = { diasSemRevisao: 3, estoqueMinimo: 0 }

// Sem nenhum fechamento gravado o aviso de quinzena dispara sempre. Como ele não
// é o assunto da maioria dos testes, o padrão já vem com a quinzena fechada.
const vazio = { regs: [], cq: [], contestacoes: [], fechamentos: [{ data_fim: '2026-08-25' }], entradaDisplays: 0, saidaDisplays: 0 }

const montar = (dados = {}, over = {}) => montarAlertas({
  dados: { ...vazio, ...dados },
  cfg: { ...cfg, ...over },
  hoje: HOJE,
  quinzenaInicio: '2026-08-23',
})

const ids = (l) => l.map(a => a.id)

// ── Produção que não chegou na revisão ───────────────────────────────────────
describe('produção sem revisão — o alerta que acusa lote sumido', () => {
  const reg = (data, func_id = 1, quantidade = 3000) =>
    ({ func_id, data, quantidade, funcionarios: { nome: 'Ana' } })

  it('acusa produção parada há mais dias que o configurado', () => {
    const l = montar({ regs: [reg('2026-08-20')] })
    expect(ids(l)).toContain('semrev|1|2026-08-20')
    expect(l[0].nivel).toBe('critico')
  })

  it('acusa exatamente no dia do limite, não só depois', () => {
    // diasSemRevisao = 3, hoje = 26 → o limite é dia 23, e ele conta.
    expect(ids(montar({ regs: [reg('2026-08-23')] }))).toContain('semrev|1|2026-08-23')
  })

  it('fica calado enquanto o prazo não venceu', () => {
    expect(ids(montar({ regs: [reg('2026-08-24')] }))).not.toContain('semrev|1|2026-08-24')
  })

  it('nunca acusa a produção de hoje', () => {
    // Mesmo com prazo zero: o dia corrente ainda está acontecendo.
    const l = montar({ regs: [reg(HOJE)] }, { diasSemRevisao: 0 })
    expect(ids(l)).not.toContain(`semrev|1|${HOJE}`)
  })

  it('cala quando a revisão daquele dia já foi lançada', () => {
    const l = montar({ regs: [reg('2026-08-20')], cq: [{ func_id: 1, data: '2026-08-20' }] })
    expect(ids(l)).not.toContain('semrev|1|2026-08-20')
  })

  it('não confunde revisão de outra pessoa no mesmo dia', () => {
    const l = montar({ regs: [reg('2026-08-20')], cq: [{ func_id: 2, data: '2026-08-20' }] })
    expect(ids(l)).toContain('semrev|1|2026-08-20')
  })

  it('lista o caso mais antigo primeiro', () => {
    const l = montar({ regs: [reg('2026-08-21', 1), reg('2026-08-19', 2), reg('2026-08-20', 3)] })
    expect(ids(l).filter(i => i.startsWith('semrev')))
      .toEqual(['semrev|2|2026-08-19', 'semrev|3|2026-08-20', 'semrev|1|2026-08-21'])
  })

  it('não quebra quando o registro veio sem o nome do parceiro', () => {
    const l = montar({ regs: [{ func_id: 9, data: '2026-08-20', quantidade: 100 }] })
    expect(l.find(a => a.id === 'semrev|9|2026-08-20').titulo).toContain('Funcionário')
  })
})

// ── Contestações ─────────────────────────────────────────────────────────────
describe('contestações abertas', () => {
  it('levanta uma contestação aberta como aviso', () => {
    const l = montar({ contestacoes: [{ func_id: 1, data: '2026-08-20', contestacao: 'faltou lote', funcionarios: { nome: 'Ana' } }] })
    const a = l.find(x => x.id === 'cont|1|2026-08-20')
    expect(a.nivel).toBe('aviso')
    expect(a.detalhe).toBe('faltou lote')
  })

  it('junta várias contestações do mesmo parceiro no mesmo dia numa linha só', () => {
    const c = (contestacao) => ({ func_id: 1, data: '2026-08-20', contestacao, funcionarios: { nome: 'Ana' } })
    const l = montar({ contestacoes: [c('primeira'), c('segunda')] })
    expect(ids(l).filter(i => i.startsWith('cont|'))).toHaveLength(1)
  })
})

// ── Estoque ──────────────────────────────────────────────────────────────────
describe('estoque abaixo do mínimo', () => {
  it('avisa quando o saldo fica abaixo do mínimo', () => {
    const l = montar({ entradaDisplays: 100, saidaDisplays: 95 }, { estoqueMinimo: 10 })
    expect(l.find(a => a.id === 'estoque|5')).toBeTruthy()
  })

  it('fica calado quando o saldo está no mínimo', () => {
    const l = montar({ entradaDisplays: 100, saidaDisplays: 90 }, { estoqueMinimo: 10 })
    expect(ids(l).some(i => i.startsWith('estoque|'))).toBe(false)
  })

  it('mínimo zero desliga o aviso, mesmo com saldo negativo', () => {
    const l = montar({ entradaDisplays: 0, saidaDisplays: 50 }, { estoqueMinimo: 0 })
    expect(ids(l).some(i => i.startsWith('estoque|'))).toBe(false)
  })
})

// ── Fechamento da quinzena ───────────────────────────────────────────────────
describe('quinzena encerrada sem fechamento', () => {
  it('cobra o fechamento da quinzena que acabou de encerrar', () => {
    // Quinzena atual começa em 23/08 → a anterior terminou em 22/08.
    const l = montar({ fechamentos: [] })
    expect(ids(l)).toContain('fech|2026-08-22')
  })

  it('cala quando o fechamento daquele período já existe', () => {
    const l = montar({ fechamentos: [{ data_fim: '2026-08-22' }] })
    expect(ids(l).some(i => i.startsWith('fech|'))).toBe(false)
  })

  it('cala também quando o fechamento gravado é mais recente', () => {
    const l = montar({ fechamentos: [{ data_fim: '2026-09-07' }] })
    expect(ids(l).some(i => i.startsWith('fech|'))).toBe(false)
  })

  it('ainda cobra quando o único fechamento é de um período anterior', () => {
    const l = montar({ fechamentos: [{ data_fim: '2026-08-07' }] })
    expect(ids(l)).toContain('fech|2026-08-22')
  })
})

// ── Nada a dizer ─────────────────────────────────────────────────────────────
describe('sem nada pendente', () => {
  it('não inventa alerta quando está tudo em dia', () => {
    expect(montar()).toEqual([])
  })
})
