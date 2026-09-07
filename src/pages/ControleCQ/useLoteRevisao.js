import { useState, useEffect, useMemo } from 'react'
import toast from 'react-hot-toast'
import { getHoje, ratearRevisado } from '../../lib/utils'

// O lote de varios dias: a revisadora conta varios montes do mesmo parceiro de
// uma vez e o sistema grava um registro por data, rateando o aprovado.
// O estado mora aqui, mas o hook e chamado pela tela — trocar de modo nao pode
// perder o que ja foi digitado, e nao perde.
export function useLoteRevisao({ regsLote, cqLote, hoje, isAdmin, funcSession, registrarVarios }) {
  const [lote, setLote] = useState({ funcId: '', tipo: 'Original', revisado: '', obs: '', revisadoEm: getHoje() })
  const [itens, setItens] = useState({})            // data -> { incluir, entregue }
  const [salvandoLote, setSalvandoLote] = useState(false)
  // Dias que o parceiro declarou e ainda não passaram pela revisão
  const diasPendentes = useMemo(() => {
    if (!lote.funcId) return []
    const comCQ = new Set(cqLote.filter(c => c.func_id === Number(lote.funcId)).map(c => c.data))
    return regsLote
      .filter(r => r.func_id === Number(lote.funcId) && !comCQ.has(r.data))
      .sort((a, b) => a.data.localeCompare(b.data))
  }, [lote.funcId, regsLote, cqLote])

  // Ao trocar de parceiro, já traz os dias pendentes com o que ele declarou. O dia de
  // hoje vem desmarcado: a produção de hoje costuma estar com o enrolador ainda, e
  // marcá-la por engano criaria uma revisão de um lote que não chegou.
  useEffect(() => {
    const inicial = {}
    diasPendentes.forEach(r => { inicial[r.data] = { incluir: r.data < hoje, entregue: String(r.quantidade) } })
    setItens(inicial)
    setLote(l => ({ ...l, revisado: '' }))
  }, [lote.funcId, diasPendentes.map(r => r.data).join(','), hoje])

  // Um monte contado junto ganha um identificador comum, para as linhas daqueles dias
  // continuarem se reconhecendo como o mesmo lote depois de gravadas
  const novoLoteId = () => 'L' + Date.now().toString(36).toUpperCase()

  const selecionados = diasPendentes
    .filter(r => itens[r.data]?.incluir)
    .map(r => ({ data: r.data, declarado: r.quantidade, entregue: parseInt(itens[r.data]?.entregue) || 0 }))
  const totalEntregueLote = selecionados.reduce((s, i) => s + i.entregue, 0)
  const revisadoLote = lote.revisado === '' ? totalEntregueLote : (parseInt(lote.revisado) || 0)
  const previa = ratearRevisado(selecionados, revisadoLote)
  const descarteLote = totalEntregueLote - previa.reduce((s, i) => s + i.revisada, 0)

  const setItem = (data, campo, valor) =>
    setItens(m => ({ ...m, [data]: { ...m[data], [campo]: valor } }))

  const handleRegistrarLote = async () => {
    if (!lote.funcId) { toast.error('Selecione o parceiro'); return }
    if (!selecionados.length) { toast.error('Marque ao menos um dia'); return }
    if (totalEntregueLote <= 0) { toast.error('Informe o que foi entregue em cada dia'); return }
    if (revisadoLote > totalEntregueLote) { toast.error('O aprovado não pode ser maior que o entregue'); return }
    setSalvandoLote(true)
    const quem = isAdmin ? 'Admin' : funcSession?.nome || null
    const loteId = previa.length > 1 ? novoLoteId() : null
    const ok = await registrarVarios(previa.map(i => ({
      func_id: Number(lote.funcId), data: i.data, os: null, tipo: lote.tipo,
      entregue: i.entregue, revisada: i.revisada, display: null, macos: null,
      obs: lote.obs || null, registrado_por_revisao: quem,
      lote_id: loteId, revisado_em: lote.revisadoEm,
    })))
    if (ok) { setLote({ funcId: '', tipo: 'Original', revisado: '', obs: '', revisadoEm: getHoje() }); setItens({}) }
    setSalvandoLote(false)
  }

  return { lote, setLote, itens, salvandoLote, diasPendentes, selecionados,
           totalEntregueLote, revisadoLote, previa, descarteLote, setItem, handleRegistrarLote }
}
