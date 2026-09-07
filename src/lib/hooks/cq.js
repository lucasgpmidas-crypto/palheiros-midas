import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import { getFuncToken } from '../auth'
import toast from 'react-hot-toast'
import { traduzErro } from './erros'

// A tela da revisao monta duas listas de CQ ao mesmo tempo: a tabela filtrada e a dos
// ultimos 30 dias, que alimenta o lote e a embalagem. Cada useCQ tem seu proprio estado,
// entao gravar por uma deixava a outra com dado velho — a embalagem em lote nao enxergava
// a revisao que acabara de ser lancada e dizia que ja estava tudo embalado. Este aviso faz
// todas as listas de CQ recarregarem juntas depois de qualquer gravacao.
const EVENTO_CQ = 'midas:cq-alterado'
const avisarCQ = () => { try { window.dispatchEvent(new Event(EVENTO_CQ)) } catch {} }

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

  // Recarrega quando qualquer outra lista de CQ grava algo (ver EVENTO_CQ acima)
  useEffect(() => {
    window.addEventListener(EVENTO_CQ, fetch)
    return () => window.removeEventListener(EVENTO_CQ, fetch)
  }, [fetch])

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
    avisarCQ()
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
    avisarCQ()
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
    avisarCQ()
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
      if (error) { toast.error('Erro ao gravar a embalagem: ' + traduzErro(error)); avisarCQ(); return false }
    } else {
      const erros = []
      for (const { id, ...campos } of itens) {
        const { error } = await supabase.from('controle_qualidade').update(campos).eq('id', id)
        if (error) erros.push(error.message)
      }
      if (erros.length) { toast.error('Erro ao gravar a embalagem: ' + erros[0]); avisarCQ(); return false }
    }

    toast.success(`✓ Embalagem de ${itens.length} ${itens.length === 1 ? 'dia' : 'dias'} registrada!`)
    avisarCQ()
    return true
  }

  const excluir = async (id) => {
    const { error } = await supabase.from('controle_qualidade').delete().eq('id', id)
    if (error) { toast.error('Erro ao excluir: ' + error.message); return false }
    toast.success('Registro excluído')
    avisarCQ()
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
    avisarCQ()
    return true
  }

  const resolverContestacao = async (id) => {
    const { error } = await supabase.from('controle_qualidade').update({ contestacao_status: 'resolvida' }).eq('id', id)
    if (error) { toast.error('Erro ao resolver contestação'); return false }
    toast.success('Contestação resolvida')
    avisarCQ()
    return true
  }

  return { cqRegistros: data, loading, refetch: fetch, registrar, registrarVarios, atualizar, atualizarVarios, excluir, contestar, resolverContestacao }
}
