import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import { getFuncToken } from '../auth'
import { enfileirar, classificarErro } from '../fila'
import toast from 'react-hot-toast'
import { traduzErro } from './erros'

// ── Registros ─────────────────────────────────────────────────────────────────
export function useRegistros(filtros = {}) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('registros_producao')
      .select('*, funcionarios(nome, meta_diaria)')
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })

    if (filtros.data)       q = q.eq('data', filtros.data)
    if (filtros.dataInicio) q = q.gte('data', filtros.dataInicio)
    if (filtros.dataFim)    q = q.lte('data', filtros.dataFim)
    if (filtros.funcId)     q = q.eq('func_id', filtros.funcId)

    const { data: rows, error } = await q
    if (error) toast.error('Erro ao carregar registros')
    setData(rows || [])
    setLoading(false)
  }, [filtros.data, filtros.dataInicio, filtros.dataFim, filtros.funcId])

  useEffect(() => { fetch() }, [fetch])

  // O valor NÃO é calculado aqui. Quem paga é a conferência: enquanto o lote não for
  // contado em Orlândia, o registro fica sem valor e as telas mostram "aguardando".
  // Assim que a revisão entra, o trigger do banco preenche pelo ENTREGUE.
  // Calcular aqui pelo declarado fazia o sistema exibir dinheiro que ninguém conferiu.
  const registrar = async ({ funcId, quantidade, aproveitado, data, obs }) => {
    const token = getFuncToken()

    // Dois caminhos, porque são duas autoridades diferentes. O admin entra pelo
    // Supabase Auth e grava direto, com data e funcionário à escolha (é ele quem
    // corrige lançamento antigo). O funcionário grava pela função do banco, que
    // resolve quem ele é pelo token: sempre ele mesmo, sempre hoje.
    const { error } = token
      ? await supabase.rpc('registrar_producao', {
          p_token: token, p_quantidade: quantidade, p_obs: obs || null,
        })
      : await supabase
          .from('registros_producao')
          .upsert(
            { func_id: funcId, quantidade, aproveitado: aproveitado || null, data, obs: obs || null, valor: null },
            { onConflict: 'func_id,data' }
          )

    // Sem sinal, o número não se perde: fica guardado no aparelho e sobe sozinho
    // quando a conexão voltar (src/lib/fila.js). Só vale para o funcionário — o
    // admin lança sentado, e a tela dele deixa escolher data e pessoa, coisas que
    // a fila não saberia refazer depois.
    if (error && token && classificarErro(error) === 'rede') {
      enfileirar({ funcId, quantidade, data, obs })
      toast.success('✓ Guardado no aparelho. Vai sozinho quando a internet voltar.')
      return true
    }

    if (error) { toast.error('Erro ao registrar: ' + traduzErro(error)); return false }
    toast.success(data === new Date().toISOString().split('T')[0] ? '✓ Produção registrada!' : '✓ Registro salvo!')
    await fetch()
    return true
  }

  const atualizar = async (id, payload) => {
    const { error } = await supabase.from('registros_producao').update(payload).eq('id', id)
    if (error) { toast.error('Erro ao atualizar: ' + error.message); return false }
    toast.success('Registro atualizado!')
    await fetch()
    return true
  }

  const excluir = async (id) => {
    const { error } = await supabase.from('registros_producao').delete().eq('id', id)
    if (error) { toast.error('Erro ao excluir: ' + error.message); return false }
    toast.success('Registro excluído')
    await fetch()
    return true
  }

  return { registros: data, loading, refetch: fetch, registrar, atualizar, excluir }
}
