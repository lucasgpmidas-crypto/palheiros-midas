import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import toast from 'react-hot-toast'

// ── Fechamentos de folha (trava de período) ───────────────────────────────────
export function useFechamentos() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data: rows, error } = await supabase
      .from('fechamentos')
      .select('*')
      .order('data_fim', { ascending: false })
    if (error) toast.error('Erro ao carregar fechamentos')
    setData(rows || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  // Data-limite travada: fim do fechamento mais recente ainda fechado
  const fechadoAte = data.filter(f => f.status === 'fechado').reduce((m, f) => (!m || f.data_fim > m ? f.data_fim : m), null)

  const fechar = async (payload) => {
    const { error } = await supabase.from('fechamentos').insert(payload)
    if (error) { toast.error('Erro ao fechar período: ' + error.message); return false }
    toast.success('🔒 Período fechado!')
    await fetch()
    return true
  }

  const reabrir = async (id, reaberto_por) => {
    const { error } = await supabase.from('fechamentos').update({ status: 'reaberto', reaberto_por }).eq('id', id)
    if (error) { toast.error('Erro ao reabrir: ' + error.message); return false }
    toast.success('Período reaberto')
    await fetch()
    return true
  }

  return { fechamentos: data, fechadoAte, loading, refetch: fetch, fechar, reabrir }
}

// ── Auditoria (log imutável, leitura só de admin) ─────────────────────────────
export function useAuditoria({ tabela, limite = 100 } = {}) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let q = supabase.from('auditoria').select('*').order('created_at', { ascending: false }).limit(limite)
    if (tabela) q = q.eq('tabela', tabela)
    q.then(({ data: rows, error }) => {
      if (error) toast.error('Erro ao carregar auditoria')
      setData(rows || [])
      setLoading(false)
    })
  }, [tabela, limite])

  return { eventos: data, loading }
}
