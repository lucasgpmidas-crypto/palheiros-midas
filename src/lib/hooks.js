import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { calcValor } from './utils'
import toast from 'react-hot-toast'

// ── Funcionários ──────────────────────────────────────────────────────────────
export function useFuncionarios() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data: rows } = await supabase.from('funcionarios').select('*').order('nome')
    setData(rows || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const salvar = async (payload, id = null) => {
    const row = { ...payload }
    if (!row.pin) delete row.pin // não sobrescreve PIN se vazio

    if (id) {
      const { error } = await supabase.from('funcionarios').update(row).eq('id', id)
      if (error) { toast.error('Erro ao atualizar'); return false }
      toast.success('Funcionário atualizado!')
    } else {
      const { error } = await supabase.from('funcionarios').insert(row)
      if (error) { toast.error('Erro ao cadastrar'); return false }
      toast.success('Funcionário cadastrado!')
    }
    await fetch()
    return true
  }

  return { funcionarios: data, loading, refetch: fetch, salvar }
}

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

  const registrar = async ({ funcId, quantidade, aproveitado, data, obs, valorMil }) => {
    const valor = calcValor(aproveitado ?? quantidade, valorMil)
    const { error } = await supabase
      .from('registros_producao')
      .upsert(
        { func_id: funcId, quantidade, aproveitado: aproveitado || null, data, obs: obs || null, valor },
        { onConflict: 'func_id,data' }
      )
    if (error) { toast.error('Erro ao registrar: ' + error.message); return false }
    toast.success(data === new Date().toISOString().split('T')[0] ? '✓ Produção registrada!' : '✓ Registro salvo!')
    await fetch()
    return true
  }

  const atualizar = async (id, payload) => {
    const { error } = await supabase.from('registros_producao').update(payload).eq('id', id)
    if (error) { toast.error('Erro ao atualizar'); return false }
    toast.success('Registro atualizado!')
    await fetch()
    return true
  }

  const excluir = async (id) => {
    const { error } = await supabase.from('registros_producao').delete().eq('id', id)
    if (error) { toast.error('Erro ao excluir'); return false }
    toast.success('Registro excluído')
    await fetch()
    return true
  }

  return { registros: data, loading, refetch: fetch, registrar, atualizar, excluir }
}

// ── Controle de Qualidade ─────────────────────────────────────────────────────
export function useCQ(filtros = {}) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('controle_qualidade')
      .select('*, funcionarios(nome)')
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })

    if (filtros.dataInicio) q = q.gte('data', filtros.dataInicio)
    if (filtros.dataFim)    q = q.lte('data', filtros.dataFim)
    if (filtros.funcId)     q = q.eq('func_id', filtros.funcId)
    if (filtros.tipo)       q = q.eq('tipo', filtros.tipo)

    const { data: rows } = await q
    setData(rows || [])
    setLoading(false)
  }, [filtros.dataInicio, filtros.dataFim, filtros.funcId, filtros.tipo])

  useEffect(() => { fetch() }, [fetch])

  const registrar = async (payload) => {
    const { error } = await supabase.from('controle_qualidade').insert(payload)
    if (error) { toast.error('Erro ao registrar CQ'); return false }
    toast.success('✓ CQ registrado!')
    await fetch()
    return true
  }

  const atualizar = async (id, payload) => {
    const { error } = await supabase.from('controle_qualidade').update(payload).eq('id', id)
    if (error) { toast.error('Erro ao atualizar'); return false }
    toast.success('CQ atualizado!')
    await fetch()
    return true
  }

  const excluir = async (id) => {
    const { error } = await supabase.from('controle_qualidade').delete().eq('id', id)
    if (error) { toast.error('Erro ao excluir'); return false }
    toast.success('Registro excluído')
    await fetch()
    return true
  }

  return { cqRegistros: data, loading, refetch: fetch, registrar, atualizar, excluir }
}

// ── Config ────────────────────────────────────────────────────────────────────
export function useConfig() {
  const [valorMil, setValorMil] = useState(75)

  useEffect(() => {
    supabase.from('configuracoes').select('valor').eq('chave', 'valor_mil').single()
      .then(({ data }) => { if (data) setValorMil(Number(data.valor)) })
  }, [])

  const salvarValorMil = async (v) => {
    await supabase.from('configuracoes')
      .upsert({ chave: 'valor_mil', valor: String(v) }, { onConflict: 'chave' })
    setValorMil(v)
    toast.success('Valor atualizado!')
  }

  return { valorMil, salvarValorMil }
}
