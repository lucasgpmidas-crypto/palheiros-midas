import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from './supabase'
import { calcValor, getQuinzenasAno, getQuinzenasDesde, resumoPeriodo, calcQualificacao, calcPremiosAnuais, isProducao, getHoje } from './utils'
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

// Um ano de conferências passa fácil do limite de linhas por requisição do
// PostgREST — sem paginar, a apuração anual sairia truncada (e menor) em silêncio.
const buscarPaginado = async (build, pageSize = 1000) => {
  const out = []
  for (let p = 0; ; p++) {
    const { data, error } = await build().range(p * pageSize, p * pageSize + pageSize - 1)
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < pageSize) break
  }
  return out
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

// ── Config ────────────────────────────────────────────────────────────────────
const CFG_KEYS = {
  valor_mil: 'valorMil', uni_display: 'uniDisplay', uni_maco: 'uniMaco', tolerancia_conf: 'tolerancia',
  quinzena_d1: 'quinzenaD1', quinzena_d2: 'quinzenaD2', dias_sem_revisao: 'diasSemRevisao', estoque_minimo: 'estoqueMinimo',
  // Programa de Parceria: faixas de preço por volume quinzenal + trava de qualidade + ajuda de custo CP
  faixa_min_inter: 'faixaMinInter', faixa_min_prem: 'faixaMinPrem',
  faixa_cp_base: 'faixaCpBase', faixa_cp_inter: 'faixaCpInter', faixa_cp_prem: 'faixaCpPrem',
  faixa_ext_base: 'faixaExtBase', faixa_ext_inter: 'faixaExtInter', faixa_ext_prem: 'faixaExtPrem',
  qual_premium: 'qualPremium', qual_minima: 'qualMinima', ajuda_custo_dia: 'ajudaCustoDia',
  // Prêmios: qualificação (6 quinzenas em 3 etapas), padrinho e prêmios anuais
  qualif_vol1: 'qualifVol1', qualif_qual1: 'qualifQual1',
  qualif_vol2: 'qualifVol2', qualif_qual2: 'qualifQual2',
  qualif_vol3: 'qualifVol3', qualif_qual3: 'qualifQual3',
  premio_qualificacao: 'premioQualificacao', premio_padrinho: 'premioPadrinho',
  premio_prod_v1: 'premioProdV1', premio_prod_p1: 'premioProdP1',
  premio_prod_v2: 'premioProdV2', premio_prod_p2: 'premioProdP2',
  premio_prod_v3: 'premioProdV3', premio_prod_p3: 'premioProdP3',
  premio_fid_min: 'premioFidMin',
  premio_qual_anual: 'premioQualAnual', premio_qual_min: 'premioQualMin',
}

export function useConfig() {
  const [cfg, setCfg] = useState({
    valorMil: 75, uniDisplay: 200, uniMaco: 20, tolerancia: 2, quinzenaD1: 9, quinzenaD2: 24, diasSemRevisao: 2, estoqueMinimo: 0,
    faixaMinInter: 11, faixaMinPrem: 18,
    faixaCpBase: 85, faixaCpInter: 90, faixaCpPrem: 95,
    faixaExtBase: 85, faixaExtInter: 88, faixaExtPrem: 90,
    qualPremium: 97, qualMinima: 94, ajudaCustoDia: 10,
    qualifVol1: 7, qualifQual1: 94, qualifVol2: 10, qualifQual2: 96, qualifVol3: 12, qualifQual3: 97,
    premioQualificacao: 300, premioPadrinho: 150,
    premioProdV1: 250, premioProdP1: 500, premioProdV2: 400, premioProdP2: 1000, premioProdV3: 550, premioProdP3: 1500,
    premioFidMin: 250, premioQualAnual: 500, premioQualMin: 200,
  })

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
