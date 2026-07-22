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
    if (error) { toast.error('Erro ao registrar CQ: ' + error.message); return false }
    toast.success('✓ CQ registrado!')
    await fetch()
    return true
  }

  const atualizar = async (id, payload) => {
    const { error } = await supabase.from('controle_qualidade').update(payload).eq('id', id)
    if (error) { toast.error('Erro ao atualizar: ' + error.message); return false }
    toast.success('CQ atualizado!')
    await fetch()
    return true
  }

  const excluir = async (id) => {
    const { error } = await supabase.from('controle_qualidade').delete().eq('id', id)
    if (error) { toast.error('Erro ao excluir: ' + error.message); return false }
    toast.success('Registro excluído')
    await fetch()
    return true
  }

  // Enrolador contesta a revisão de um dia (marca todos os registros CQ dele naquela data)
  const contestar = async (funcId, dataDia, motivo) => {
    const { error } = await supabase
      .from('controle_qualidade')
      .update({ contestacao: motivo, contestada_em: new Date().toISOString(), contestacao_status: 'aberta' })
      .eq('func_id', funcId)
      .eq('data', dataDia)
    if (error) { toast.error('Erro ao enviar contestação'); return false }
    toast.success('⚑ Contestação enviada ao administrador!')
    await fetch()
    return true
  }

  const resolverContestacao = async (id) => {
    const { error } = await supabase.from('controle_qualidade').update({ contestacao_status: 'resolvida' }).eq('id', id)
    if (error) { toast.error('Erro ao resolver contestação'); return false }
    toast.success('Contestação resolvida')
    await fetch()
    return true
  }

  return { cqRegistros: data, loading, refetch: fetch, registrar, atualizar, excluir, contestar, resolverContestacao }
}

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

// ── Config ────────────────────────────────────────────────────────────────────
const CFG_KEYS = { valor_mil: 'valorMil', uni_display: 'uniDisplay', uni_maco: 'uniMaco', tolerancia_conf: 'tolerancia', quinzena_d1: 'quinzenaD1', quinzena_d2: 'quinzenaD2' }

export function useConfig() {
  const [cfg, setCfg] = useState({ valorMil: 75, uniDisplay: 200, uniMaco: 20, tolerancia: 2, quinzenaD1: 9, quinzenaD2: 24 })

  useEffect(() => {
    supabase.from('configuracoes').select('chave, valor').in('chave', Object.keys(CFG_KEYS))
      .then(({ data }) => {
        if (!data?.length) return
        setCfg(c => {
          const next = { ...c }
          data.forEach(({ chave, valor }) => {
            const v = Number(valor)
            if (CFG_KEYS[chave] && !isNaN(v)) next[CFG_KEYS[chave]] = v
          })
          return next
        })
      })
  }, [])

  const salvarConfig = async (chave, valor) => {
    await supabase.from('configuracoes')
      .upsert({ chave, valor: String(valor) }, { onConflict: 'chave' })
    setCfg(c => ({ ...c, [CFG_KEYS[chave]]: Number(valor) }))
  }

  const salvarValorMil = async (v) => {
    await salvarConfig('valor_mil', v)
    toast.success('Valor atualizado!')
  }

  return { ...cfg, salvarValorMil, salvarConfig }
}
