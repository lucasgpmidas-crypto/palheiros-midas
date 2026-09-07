import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import toast from 'react-hot-toast'

// ── Expedições (saídas de estoque) ────────────────────────────────────────────
export function useExpedicoes() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data: rows, error } = await supabase
      .from('expedicoes')
      .select('*')
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) toast.error('Erro ao carregar expedições')
    setData(rows || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const registrar = async (payload) => {
    const { error } = await supabase.from('expedicoes').insert(payload)
    if (error) { toast.error('Erro ao registrar expedição'); return false }
    toast.success('✓ Expedição registrada!')
    await fetch()
    return true
  }

  const atualizar = async (id, payload) => {
    const { error } = await supabase.from('expedicoes').update(payload).eq('id', id)
    if (error) { toast.error('Erro ao atualizar'); return false }
    toast.success('Expedição atualizada!')
    await fetch()
    return true
  }

  const excluir = async (id) => {
    const { error } = await supabase.from('expedicoes').delete().eq('id', id)
    if (error) { toast.error('Erro ao excluir'); return false }
    toast.success('Expedição excluída')
    await fetch()
    return true
  }

  return { expedicoes: data, loading, refetch: fetch, registrar, atualizar, excluir }
}
