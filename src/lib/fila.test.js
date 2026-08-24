import { describe, it, expect } from 'vitest'
import { enfileirar, itensDe, lerFila, enviarFila, classificarErro, motivoLegivel } from './fila'

// A fila existe para o número não se perder quando o sinal cai no galpão. O que
// está protegido aqui não é a tela: é não lançar produção no dia errado, não
// lançar na conta de outra pessoa, e não deixar um registro preso para sempre.

const criarStore = () => {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }
}

const erroDeRede = () => new TypeError('Failed to fetch')
const recusa = (msg) => ({ message: msg })

describe('guardar no aparelho', () => {
  it('guarda o registro com a data em que ele foi feito', () => {
    const store = criarStore()
    enfileirar({ funcId: 3, quantidade: 2500, data: '2026-08-20', obs: 'chuva' }, store)
    const [item] = itensDe(3, store)
    expect(item.quantidade).toBe(2500)
    expect(item.data).toBe('2026-08-20')
    expect(item.obs).toBe('chuva')
  })

  it('registrar o mesmo dia de novo substitui, não empilha', () => {
    // Mesma regra da tabela, que tem chave única em (func_id, data): o segundo
    // número é a correção do primeiro, não um lançamento a mais.
    const store = criarStore()
    enfileirar({ funcId: 3, quantidade: 2500, data: '2026-08-20' }, store)
    enfileirar({ funcId: 3, quantidade: 2800, data: '2026-08-20' }, store)
    expect(itensDe(3, store)).toHaveLength(1)
    expect(itensDe(3, store)[0].quantidade).toBe(2800)
  })

  it('dias diferentes convivem', () => {
    const store = criarStore()
    enfileirar({ funcId: 3, quantidade: 2500, data: '2026-08-20' }, store)
    enfileirar({ funcId: 3, quantidade: 3100, data: '2026-08-21' }, store)
    expect(itensDe(3, store)).toHaveLength(2)
  })
})

describe('enviar o que ficou guardado', () => {
  it('envio aceito esvazia a fila e manda a data guardada, não a de hoje', async () => {
    const store = criarStore()
    enfileirar({ funcId: 3, quantidade: 2500, data: '2026-08-20' }, store)
    const recebidos = []
    const r = await enviarFila({
      funcId: 3, token: 'tok', store,
      enviar: async (p) => { recebidos.push(p); return { error: null } },
    })
    expect(r.enviados).toBe(1)
    expect(itensDe(3, store)).toHaveLength(0)
    expect(recebidos[0].p_data).toBe('2026-08-20')
    expect(recebidos[0].p_quantidade).toBe(2500)
  })

  it('reenviar o mesmo item duas vezes não duplica — ele sai da fila no 1º aceite', async () => {
    const store = criarStore()
    enfileirar({ funcId: 3, quantidade: 2500, data: '2026-08-20' }, store)
    const enviar = async () => ({ error: null })
    await enviarFila({ funcId: 3, token: 'tok', enviar, store })
    const segunda = await enviarFila({ funcId: 3, token: 'tok', enviar, store })
    expect(segunda.enviados).toBe(0)
  })

  it('falha de rede mantém o registro guardado para a próxima tentativa', async () => {
    const store = criarStore()
    enfileirar({ funcId: 3, quantidade: 2500, data: '2026-08-20' }, store)
    const r = await enviarFila({
      funcId: 3, token: 'tok', store,
      enviar: async () => { throw erroDeRede() },
    })
    expect(r.enviados).toBe(0)
    expect(r.parouPor).toBe('rede')
    expect(itensDe(3, store)).toHaveLength(1)
  })

  it('recusa do banco tira da fila e diz o motivo — item preso para sempre é pior', async () => {
    const store = criarStore()
    enfileirar({ funcId: 3, quantidade: 2500, data: '2026-08-01' }, store)
    const r = await enviarFila({
      funcId: 3, token: 'tok', store,
      enviar: async () => ({ error: recusa('data_antiga:7') }),
    })
    expect(itensDe(3, store)).toHaveLength(0)
    expect(r.recusados).toHaveLength(1)
    expect(r.recusados[0].motivo).toMatch(/7 dias/)
  })

  it('celular emprestado: não envia o registro de um assinado por outro', async () => {
    // O token diz quem está gravando. Enviar o item do 3 com o token do 9 lançaria
    // a produção dele na conta errada — e produção na conta errada é pagamento na
    // conta errada.
    const store = criarStore()
    enfileirar({ funcId: 3, quantidade: 2500, data: '2026-08-20' }, store)
    const r = await enviarFila({
      funcId: 9, token: 'token-do-9', store,
      enviar: async () => ({ error: null }),
    })
    expect(r.enviados).toBe(0)
    expect(itensDe(3, store)).toHaveLength(1)
  })

  it('sem sessão válida, o registro espera o PIN em vez de sumir', async () => {
    const store = criarStore()
    enfileirar({ funcId: 3, quantidade: 2500, data: '2026-08-20' }, store)
    const r = await enviarFila({ funcId: 3, token: null, store, enviar: async () => ({ error: null }) })
    expect(r.parouPor).toBe('sessao')
    expect(lerFila(store)).toHaveLength(1)
  })

  it('vários guardados sobem juntos quando a internet volta', async () => {
    const store = criarStore()
    enfileirar({ funcId: 3, quantidade: 2500, data: '2026-08-19' }, store)
    enfileirar({ funcId: 3, quantidade: 2600, data: '2026-08-20' }, store)
    enfileirar({ funcId: 3, quantidade: 2700, data: '2026-08-21' }, store)
    const r = await enviarFila({ funcId: 3, token: 'tok', store, enviar: async () => ({ error: null }) })
    expect(r.enviados).toBe(3)
    expect(r.pendentes).toBe(0)
  })
})

describe('separar falha de rede de recusa', () => {
  it('reconhece a queda de conexão', () => {
    expect(classificarErro(erroDeRede())).toBe('rede')
    expect(classificarErro({ message: 'NetworkError when attempting to fetch resource' })).toBe('rede')
  })

  it('sessão expirada é caso à parte: volta a valer quando ele entrar de novo', () => {
    expect(classificarErro(recusa('sessao_invalida'))).toBe('sessao')
  })

  it('o resto é recusa do banco, que nunca vai passar por insistência', () => {
    expect(classificarErro(recusa('data_futura'))).toBe('recusado')
    expect(classificarErro(null)).toBe(null)
  })

  it('traduz a recusa para quem está lendo no celular', () => {
    expect(motivoLegivel(recusa('data_futura'))).toMatch(/adiantada/)
    expect(motivoLegivel(recusa('quinzena fechada para lançamentos'))).toMatch(/fechada/)
  })
})
