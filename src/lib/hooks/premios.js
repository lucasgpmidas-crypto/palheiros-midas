import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase, buscarPaginado } from '../supabase'
import { getQuinzenasAno, getQuinzenasDesde, resumoPeriodo, calcQualificacao, calcPremiosAnuais, isProducao, getHoje } from '../utils'
import toast from 'react-hot-toast'

// ── Prêmios do Programa de Parceria ───────────────────────────────────────────
// Prêmios já concedidos (a apuração é calculada; aqui fica só o que foi reconhecido)
export function usePremios() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data: rows, error } = await supabase
      .from('premios')
      .select('*, funcionarios(nome)')
      .order('created_at', { ascending: false })
    if (error) toast.error('Erro ao carregar prêmios')
    setData(rows || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const conceder = async (payload) => {
    const { error } = await supabase.from('premios').insert(payload)
    if (error) {
      toast.error(error.code === '23505' ? 'Este prêmio já foi concedido a este parceiro' : 'Erro ao conceder prêmio')
      return false
    }
    toast.success('🏅 Prêmio concedido!')
    await fetch()
    return true
  }

  const atualizar = async (id, payload) => {
    const { error } = await supabase.from('premios').update(payload).eq('id', id)
    if (error) { toast.error('Erro ao atualizar prêmio'); return false }
    toast.success('Prêmio atualizado!')
    await fetch()
    return true
  }

  const excluir = async (id) => {
    const { error } = await supabase.from('premios').delete().eq('id', id)
    if (error) { toast.error('Erro ao excluir prêmio'); return false }
    toast.success('Prêmio removido')
    await fetch()
    return true
  }

  return { premios: data, loading, refetch: fetch, conceder, atualizar, excluir }
}

// Apuração dos prêmios: quebra o histórico de conferência em quinzenas e aplica
// as regras do programa. Base é sempre o APROVADO (revisada), igual ao pagamento.
// A janela buscada é o ano + as 6 quinzenas de qualificação de cada parceiro,
// que podem cair antes do ano selecionado (ou atravessar a virada dele).
// funcId limita a apuração a um parceiro — é como a tela do funcionário usa, para
// o celular não baixar um ano de conferência da equipe inteira.
export function useApuracaoPremios({ ano, funcionarios, cfg, funcId = null, enabled = true }) {
  const [cq, setCq] = useState([])
  const [loading, setLoading] = useState(true)
  const hoje = getHoje()
  const { quinzenaD1: d1, quinzenaD2: d2 } = cfg

  const parceiros = useMemo(
    () => funcionarios.filter(f => isProducao(f) && (!funcId || f.id === funcId)),
    [funcionarios, funcId]
  )

  // Quinzenas do ano + janela de qualificação de cada parceiro
  const { quinzenasAno, janelas, ini, fim } = useMemo(() => {
    const qAno = getQuinzenasAno(ano, d1, d2)
    // A qualificação é só de quem ENTRA no programa: sem parceria_desde marcada no
    // cadastro, o parceiro não está em qualificação. Cair na data de entrada faria
    // todo mundo que já estava na casa aparecer como "não qualificou".
    const js = new Map()
    parceiros.forEach(f => {
      if (f.parceria_desde) js.set(f.id, getQuinzenasDesde(f.parceria_desde, 6, d1, d2))
    })
    const todas = [...qAno, ...[...js.values()].flat()]
    return {
      quinzenasAno: qAno, janelas: js,
      ini: todas.reduce((m, q) => (q.inicio < m ? q.inicio : m), qAno[0].inicio),
      fim: todas.reduce((m, q) => (q.fim > m ? q.fim : m), qAno[qAno.length - 1].fim),
    }
  }, [ano, d1, d2, parceiros])

  useEffect(() => {
    let cancelado = false
    if (!enabled) { setCq([]); setLoading(false); return }
    setLoading(true)
    buscarPaginado(() => {
      let q = supabase
        .from('controle_qualidade')
        .select('func_id, data, entregue, revisada')
        .gte('data', ini).lte('data', fim)
      if (funcId) q = q.eq('func_id', funcId)
      return q.order('data').order('id')
    })
      .then(rows => { if (!cancelado) setCq(rows) })
      .catch(() => { if (!cancelado) toast.error('Erro ao apurar prêmios') })
      .finally(() => { if (!cancelado) setLoading(false) })
    return () => { cancelado = true }
  }, [ini, fim, funcId, enabled])

  const linhas = useMemo(() => {
    // Soma entregue/revisada por parceiro em cada período
    const somar = (funcId, periodos) => periodos.map(q => {
      const rows = cq.filter(c => c.func_id === funcId && c.data >= q.inicio && c.data <= q.fim)
      return {
        ...q,
        entregue: rows.reduce((s, c) => s + (c.entregue || 0), 0),
        revisada: rows.reduce((s, c) => s + (c.revisada || 0), 0),
      }
    })

    return parceiros.map(f => {
      const modalidade = f.modalidade || 'cp'
      const periodosAno = somar(f.id, quinzenasAno).map(p => resumoPeriodo(p, modalidade, cfg))
      const periodosQualif = somar(f.id, janelas.get(f.id) || []).map(p => resumoPeriodo(p, modalidade, cfg))
      return {
        f, modalidade,
        ingresso: f.parceria_desde,
        periodosAno,
        anual: calcPremiosAnuais({ periodos: periodosAno, cfg }),
        qualif: calcQualificacao({ periodos: periodosQualif, hoje, cfg }),
      }
    })
  }, [cq, parceiros, quinzenasAno, janelas, cfg, hoje])

  return { linhas, quinzenasAno, loading }
}
