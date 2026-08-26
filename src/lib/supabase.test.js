// Testes da paginação — é aqui que a conta some sem avisar.
//
//   npm test
//
// O PostgREST devolve no máximo mil linhas e responde 200 mesmo quando cortou.
// Uma consulta que passe disso e não venha pelo buscarPaginado produz um total
// menor, sem erro, sem tela vermelha e sem ninguém desconfiar — foi exatamente
// o que aconteceu antes do commit que criou este helper. Por isso o que se
// protege aqui é: ele pede TODAS as páginas, e só para quando a última veio
// incompleta.

import { describe, it, expect } from 'vitest'
import { buscarPaginado } from './supabase'

// Builder de mentira no formato do supabase-js: cada chamada devolve um objeto
// com .range(). Guarda os intervalos pedidos para o teste conferir.
function fakeBuilder(paginas, { erro = null } = {}) {
  const chamadas = []
  const build = () => ({
    range: async (de, ate) => {
      chamadas.push([de, ate])
      if (erro) return { data: null, error: erro }
      return { data: paginas.shift() ?? [], error: null }
    },
  })
  return { build, chamadas }
}

const linhas = (n, offset = 0) => Array.from({ length: n }, (_, i) => ({ id: offset + i }))

describe('buscarPaginado — trazer a tabela inteira, não só a primeira página', () => {
  it('para na primeira página quando ela já veio incompleta', async () => {
    const { build, chamadas } = fakeBuilder([linhas(3)])
    const r = await buscarPaginado(build, 10)
    expect(r).toHaveLength(3)
    expect(chamadas).toEqual([[0, 9]])
  })

  it('busca a página seguinte quando a anterior veio cheia', async () => {
    // O caso que causa o erro silencioso: 10 linhas com página de 10 NÃO quer
    // dizer que acabou — quer dizer que provavelmente há mais.
    const { build, chamadas } = fakeBuilder([linhas(10), linhas(4, 10)])
    const r = await buscarPaginado(build, 10)
    expect(r).toHaveLength(14)
    expect(chamadas).toEqual([[0, 9], [10, 19]])
  })

  it('atravessa várias páginas cheias sem perder nem repetir linha', async () => {
    const { build } = fakeBuilder([linhas(10, 0), linhas(10, 10), linhas(2, 20)])
    const r = await buscarPaginado(build, 10)
    expect(r).toHaveLength(22)
    expect(r.map(x => x.id)).toEqual(Array.from({ length: 22 }, (_, i) => i))
  })

  it('para quando a página cheia é seguida de uma vazia', async () => {
    // Total múltiplo exato do tamanho da página: precisa de uma ida a mais para
    // descobrir que acabou, senão a última página seria inventada ou perdida.
    const { build, chamadas } = fakeBuilder([linhas(10), []])
    const r = await buscarPaginado(build, 10)
    expect(r).toHaveLength(10)
    expect(chamadas).toEqual([[0, 9], [10, 19]])
  })

  it('monta a consulta de novo a cada página', async () => {
    // O builder do supabase-js não pode ser reaproveitado depois de executado;
    // reusar o mesmo objeto traz a mesma página para sempre.
    let construidos = 0
    const paginas = [linhas(10), linhas(1, 10)]
    const build = () => { construidos++; return { range: async () => ({ data: paginas.shift() ?? [], error: null }) } }
    await buscarPaginado(build, 10)
    expect(construidos).toBe(2)
  })

  it('usa mil linhas por página quando não se diz o tamanho', async () => {
    const { build, chamadas } = fakeBuilder([linhas(5)])
    await buscarPaginado(build)
    expect(chamadas).toEqual([[0, 999]])
  })

  it('devolve lista vazia quando não há nada', async () => {
    const { build } = fakeBuilder([[]])
    expect(await buscarPaginado(build, 10)).toEqual([])
  })

  it('não engole erro do banco — dado pela metade é pior que erro', async () => {
    const { build } = fakeBuilder([], { erro: new Error('falha de rede') })
    await expect(buscarPaginado(build, 10)).rejects.toThrow('falha de rede')
  })

  it('trata data nula como fim, sem quebrar', async () => {
    const build = () => ({ range: async () => ({ data: null, error: null }) })
    expect(await buscarPaginado(build, 10)).toEqual([])
  })
})
