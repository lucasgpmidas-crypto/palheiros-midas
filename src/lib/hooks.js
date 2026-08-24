import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase, buscarPaginado } from './supabase'
import { getFuncToken } from './auth'
import { enfileirar, classificarErro, enviarFila, itensDe, EVENTO as EVENTO_FILA } from './fila'
import { calcValor, getQuinzenasAno, getQuinzenasDesde, resumoPeriodo, calcQualificacao, calcPremiosAnuais, isProducao, getHoje } from './utils'
import toast from 'react-hot-toast'

// As funções de gravação do banco recusam quem não tem sessão válida. Para quem
// está usando, "sessao_invalida" não quer dizer nada — o que aconteceu é que o
// acesso caiu e é preciso entrar de novo.
const traduzErro = (error) => {
  const msg = error?.message || ''
  if (msg.includes('sessao_invalida')) return 'Seu acesso expirou. Entre de novo com seu PIN.'
  return msg || 'erro desconhecido'
}

// ── Funcionários ──────────────────────────────────────────────────────────────
export function useFuncionarios() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    // Colunas explícitas de propósito: o PIN não pode trafegar para o navegador, e a
    // chave anon não tem mais select nele (migracao_pin_protegido.sql). Um `select('*')`
    // aqui pediria a coluna pin e levaria 401, derrubando o app do funcionário.
    // `pin_definido` é derivada no banco: diz se há PIN, nunca qual é.
    // Coluna nova em funcionarios? Incluir aqui E no grant da migração.
    const { data: rows } = await supabase
      .from('funcionarios')
      .select('id, nome, entrada, meta_diaria, situacao, obs, created_at, setor, modalidade, parceria_desde, padrinho_id, pin_definido')
      .order('nome')
    setData(rows || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const salvar = async (payload, id = null) => {
    // O PIN nunca vai junto com o resto: a tabela guarda só o hash, e quem calcula
    // o hash é o banco (RPC definir_pin). Aqui ele é separado do payload e enviado
    // depois, para o cadastro em si não carregar o número em nenhum momento.
    const { pin, ...row } = payload
    let funcId = id

    if (id) {
      const { error } = await supabase.from('funcionarios').update(row).eq('id', id)
      if (error) { toast.error('Erro ao atualizar'); return false }
    } else {
      const { data: novo, error } = await supabase.from('funcionarios').insert(row).select('id').single()
      if (error) { toast.error('Erro ao cadastrar'); return false }
      funcId = novo?.id
    }

    if (pin) {
      const { error } = await supabase.rpc('definir_pin', { p_func_id: funcId, p_pin: String(pin) })
      if (error) {
        // O cadastro já foi gravado; só o PIN falhou — dizer exatamente isso evita
        // que se pense que o funcionário não foi salvo.
        toast.error('Cadastro salvo, mas o PIN não foi definido: ' + (error.message || 'erro desconhecido'))
        await fetch()
        return false
      }
    }

    toast.success(id ? 'Funcionário atualizado!' : 'Funcionário cadastrado!')
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

// ── O que ficou guardado no aparelho ──────────────────────────────────────────
// Acompanha a fila de registros de quem está logado e tenta esvaziá-la sozinha:
// ao abrir a tela e toda vez que o aparelho anuncia que voltou a ter conexão.
// O `online` do navegador mente com frequência (rede aberta que não navega), por
// isso a falha volta para a fila em vez de virar erro na cara do parceiro.
export function useFilaProducao(funcId, aoEnviar) {
  const [itens, setItens] = useState([])
  const [enviando, setEnviando] = useState(false)
  // Guardado em ref de propósito: a tela costuma passar uma função nova a cada
  // render, e ela nas dependências do efeito abaixo viraria reenvio em loop.
  const callback = useRef(aoEnviar)
  callback.current = aoEnviar

  const recarregar = useCallback(() => {
    setItens(funcId ? itensDe(funcId) : [])
  }, [funcId])

  const sincronizar = useCallback(async ({ avisar = false } = {}) => {
    const token = getFuncToken()
    if (!funcId || !itensDe(funcId).length) return
    setEnviando(true)
    const r = await enviarFila({ funcId, token, enviar: (params) => supabase.rpc('registrar_producao', params) })
    setEnviando(false)
    recarregar()

    if (r.enviados) {
      toast.success(r.enviados === 1 ? '✓ Registro guardado foi enviado!' : `✓ ${r.enviados} registros guardados foram enviados!`)
      await callback.current?.()
    }
    // Recusa do banco é definitiva: o item saiu da fila e a pessoa precisa saber,
    // senão some sem deixar rastro e ela segue achando que registrou.
    for (const x of r.recusados) toast.error(`O registro de ${x.data.split('-').reverse().join('/')} não foi aceito: ${x.motivo}`, { duration: 8000 })
    if (avisar && !r.enviados && !r.recusados.length) {
      toast.error(r.parouPor === 'sessao' ? 'Entre com seu PIN para enviar o que está guardado.' : 'Ainda sem internet. O registro continua guardado.')
    }
  }, [funcId, recarregar])

  useEffect(() => {
    recarregar()
    sincronizar()
    const aoVoltar = () => sincronizar()
    window.addEventListener(EVENTO_FILA, recarregar)
    window.addEventListener('online', aoVoltar)
    return () => {
      window.removeEventListener(EVENTO_FILA, recarregar)
      window.removeEventListener('online', aoVoltar)
    }
  }, [recarregar, sincronizar])

  return { pendentes: itens, enviando, enviarAgora: () => sincronizar({ avisar: true }) }
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

  // Nas quatro gravações abaixo vale a mesma divisão do registro de produção: o
  // admin escreve direto na tabela; a revisadora, que entra por PIN, escreve pelas
  // funções do banco, que conferem o token e assinam o lançamento com o nome dela.
  const registrar = async (payload) => {
    const token = getFuncToken()
    const { error } = token
      ? await supabase.rpc('registrar_revisao', { p_token: token, p_itens: [payload] })
      : await supabase.from('controle_qualidade').insert(payload)
    if (error) { toast.error('Erro ao registrar CQ: ' + traduzErro(error)); return false }
    toast.success('✓ CQ registrado!')
    await fetch()
    return true
  }

  // Um lote revisado de uma vez costuma cobrir vários dias de produção. Grava uma
  // linha por dia numa tacada só, para a conferência diária continuar batendo.
  const registrarVarios = async (payloads) => {
    const token = getFuncToken()
    const { error } = token
      ? await supabase.rpc('registrar_revisao', { p_token: token, p_itens: payloads })
      : await supabase.from('controle_qualidade').insert(payloads)
    if (error) { toast.error('Erro ao registrar o lote: ' + traduzErro(error)); return false }
    toast.success(`✓ ${payloads.length} ${payloads.length === 1 ? 'dia registrado' : 'dias registrados'}!`)
    await fetch()
    return true
  }

  // Serve a dois usos na tela: completar a embalagem de um dia (display/maços) e
  // corrigir os números de um lançamento. São funções diferentes no banco, e o que
  // distingue é o que veio no payload.
  const atualizar = async (id, payload) => {
    const token = getFuncToken()
    const ehEmbalagem = 'registrado_por_display' in payload

    let error
    if (!token) {
      ({ error } = await supabase.from('controle_qualidade').update(payload).eq('id', id))
    } else if (ehEmbalagem) {
      ({ error } = await supabase.rpc('registrar_embalagem', {
        p_token: token,
        p_itens: [{ id, display: payload.display, macos: payload.macos, embalado_em: payload.embalado_em || null }],
      }))
    } else {
      ({ error } = await supabase.rpc('editar_revisao', {
        p_token: token, p_id: id,
        p_data: payload.data, p_os: payload.os || null, p_tipo: payload.tipo || null,
        p_entregue: payload.entregue, p_revisada: payload.revisada,
        p_display: payload.display ?? null, p_macos: payload.macos ?? null, p_obs: payload.obs || null,
      }))
    }

    if (error) { toast.error('Erro ao atualizar: ' + traduzErro(error)); return false }
    toast.success('CQ atualizado!')
    await fetch()
    return true
  }

  // A embalagem também é feita de uma vez para vários dias do mesmo parceiro
  const atualizarVarios = async (itens) => {
    const token = getFuncToken()

    if (token) {
      const { error } = await supabase.rpc('registrar_embalagem', {
        p_token: token,
        p_itens: itens.map(({ id, display, macos, embalado_em }) => ({ id, display, macos, embalado_em: embalado_em || null })),
      })
      if (error) { toast.error('Erro ao gravar a embalagem: ' + traduzErro(error)); await fetch(); return false }
    } else {
      const erros = []
      for (const { id, ...campos } of itens) {
        const { error } = await supabase.from('controle_qualidade').update(campos).eq('id', id)
        if (error) erros.push(error.message)
      }
      if (erros.length) { toast.error('Erro ao gravar a embalagem: ' + erros[0]); await fetch(); return false }
    }

    toast.success(`✓ Embalagem de ${itens.length} ${itens.length === 1 ? 'dia' : 'dias'} registrada!`)
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

  // Enrolador contesta a revisão de um dia (marca todos os registros CQ dele naquela
  // data). Pela função do banco, o dia contestado é sempre de quem está logado —
  // o func_id que a tela passa serve só para o admin, que escreve direto.
  const contestar = async (funcId, dataDia, motivo) => {
    const token = getFuncToken()
    const { error } = token
      ? await supabase.rpc('contestar_revisao', { p_token: token, p_data: dataDia, p_motivo: motivo })
      : await supabase
          .from('controle_qualidade')
          .update({ contestacao: motivo, contestada_em: new Date().toISOString(), contestacao_status: 'aberta' })
          .eq('func_id', funcId)
          .eq('data', dataDia)
    if (error) { toast.error('Erro ao enviar contestação: ' + traduzErro(error)); return false }
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

  return { cqRegistros: data, loading, refetch: fetch, registrar, registrarVarios, atualizar, atualizarVarios, excluir, contestar, resolverContestacao }
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
    valorMil: 75, uniDisplay: 200, uniMaco: 20, tolerancia: 2, quinzenaD1: 8, quinzenaD2: 23, diasSemRevisao: 2, estoqueMinimo: 0,
    faixaMinInter: 11, faixaMinPrem: 18,
    faixaCpBase: 85, faixaCpInter: 90, faixaCpPrem: 95,
    faixaExtBase: 85, faixaExtInter: 88, faixaExtPrem: 90,
    qualPremium: 97, qualMinima: 94, ajudaCustoDia: 10,
    qualifVol1: 7, qualifQual1: 94, qualifVol2: 10, qualifQual2: 96, qualifVol3: 12, qualifQual3: 97,
    premioQualificacao: 300, premioPadrinho: 150,
    premioProdV1: 250, premioProdP1: 500, premioProdV2: 400, premioProdP2: 1000, premioProdV3: 550, premioProdP3: 1500,
    premioFidMin: 250, premioQualAnual: 500, premioQualMin: 200,
  })

  // Os valores acima são só o ponto de partida até o banco responder. Quem manda é
  // a tabela `configuracoes`: preço do milheiro, faixas, corte da quinzena. Se a
  // busca falhar e ninguém avisar, a tela segue exibindo dinheiro calculado com
  // número de fábrica — certinha por fora e errada por dentro. Daí este status:
  // 'carregando' → 'ok' | 'erro', com o aviso aparecendo no Layout.
  const [status, setStatus] = useState('carregando')

  useEffect(() => {
    let cancelado = false
    supabase.from('configuracoes').select('chave, valor').in('chave', Object.keys(CFG_KEYS))
      .then(({ data, error }) => {
        if (cancelado) return
        if (error || !data) { setStatus('erro'); return }
        setCfg(c => {
          const next = { ...c }
          data.forEach(({ chave, valor }) => {
            const v = Number(valor)
            if (CFG_KEYS[chave] && !isNaN(v)) next[CFG_KEYS[chave]] = v
          })
          return next
        })
        setStatus('ok')
      })
    return () => { cancelado = true }
  }, [])

  const salvarConfig = async (chave, valor) => {
    const { error } = await supabase.from('configuracoes')
      .upsert({ chave, valor: String(valor) }, { onConflict: 'chave' })
    if (error) { toast.error('Não foi possível salvar: ' + error.message); return false }
    setCfg(c => ({ ...c, [CFG_KEYS[chave]]: Number(valor) }))
    return true
  }

  const salvarValorMil = async (v) => {
    if (await salvarConfig('valor_mil', v)) toast.success('Valor atualizado!')
  }

  return { ...cfg, cfgStatus: status, salvarValorMil, salvarConfig }
}
