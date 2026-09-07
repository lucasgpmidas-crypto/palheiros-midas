import { useState, useEffect, useMemo } from 'react'
import toast from 'react-hot-toast'
import { getHoje, sugerirEmpacote, ratearInteiro } from '../../lib/utils'

// A embalagem em lote: quem passa para display embala o monte inteiro de uma vez
// e o sistema divide entre os dias, proporcional ao aprovado de cada um.
export function useEmbalagemLote({ cqLote, uniDisplay, uniMaco, isAdmin, funcSession, atualizarVarios }) {
  // ── Embalagem em lote ──────────────────────────────────────────────────────
  // Quem passa para display embala o monte inteiro do parceiro de uma vez. Ela informa
  // o total de displays e maços; o sistema divide entre os dias, proporcional ao que
  // cada um teve de aprovado. Display é inteiro: quem tem a maior fração leva a sobra.
  const [embLote, setEmbLote] = useState({ funcId: '', displays: '', macos: '', embaladoEm: getHoje(), grupo: '' })
  const [marcadosEmb, setMarcadosEmb] = useState({})
  const [salvandoEmbLote, setSalvandoEmbLote] = useState(false)

  // Todos os dias revisados sem display, do parceiro. O lote aparece como etiqueta em
  // cada linha (de qual monte veio), mas não limita a seleção: dias lançados avulsos,
  // ou de montes diferentes, podem ter sido embalados juntos assim mesmo.
  const pendentesEmb = useMemo(() => {
    if (!embLote.funcId) return []
    return cqLote
      .filter(c => c.func_id === Number(embLote.funcId) && !c.registrado_por_display && c.revisada > 0)
      .sort((a, b) => a.data.localeCompare(b.data))
  }, [embLote.funcId, cqLote])

  // Sem revisao lancada e com tudo ja embalado a lista fica vazia do mesmo jeito, mas
  // sao situacoes opostas: uma pede que se lance a revisao antes, a outra diz que nao ha
  // o que fazer. Dizer "ja embalado" para quem nao lancou nada manda a pessoa embora.
  const temRevisaoEmb = useMemo(() => {
    if (!embLote.funcId) return false
    return cqLote.some(c => c.func_id === Number(embLote.funcId) && c.revisada > 0)
  }, [embLote.funcId, cqLote])

  // Quantos dias cada monte tem, para a etiqueta da linha
  const tamanhoLote = useMemo(() => {
    const m = {}
    cqLote.forEach(c => { if (c.lote_id) m[c.lote_id] = (m[c.lote_id] || 0) + 1 })
    return m
  }, [cqLote])

  useEffect(() => {
    const m = {}
    pendentesEmb.forEach(c => { m[c.id] = true })
    setMarcadosEmb(m)
    setEmbLote(l => ({ ...l, displays: '', macos: '' }))
  }, [embLote.funcId, pendentesEmb.map(c => c.id).join(',')])

  const embSelecionados = pendentesEmb.filter(c => marcadosEmb[c.id])
  const revisadoEmb = embSelecionados.reduce((s, c) => s + (c.revisada || 0), 0)
  const sugestaoEmb = revisadoEmb > 0 ? sugerirEmpacote(revisadoEmb, uniDisplay, uniMaco) : null
  const dispTotal = embLote.displays === '' ? (sugestaoEmb?.displays || 0) : (parseInt(embLote.displays) || 0)
  const macTotal  = embLote.macos === '' ? (sugestaoEmb?.macos || 0) : (parseInt(embLote.macos) || 0)
  const dispRateio = ratearInteiro(embSelecionados.map(c => c.revisada || 0), dispTotal)
  const macRateio  = ratearInteiro(embSelecionados.map(c => c.revisada || 0), macTotal)
  const embaladoTotal = dispTotal * uniDisplay + macTotal * uniMaco
  const sobraEmb = revisadoEmb - embaladoTotal

  const handleEmbalarLote = async () => {
    if (!embSelecionados.length) { toast.error('Marque ao menos um dia'); return }
    if (dispTotal <= 0 && macTotal <= 0) { toast.error('Informe displays ou maços'); return }
    if (embaladoTotal > revisadoEmb) { toast.error('O empacotado não pode passar do aprovado na revisão'); return }
    setSalvandoEmbLote(true)
    const quem = isAdmin ? 'Admin' : funcSession?.nome || null
    const ok = await atualizarVarios(embSelecionados.map((c, i) => ({
      id: c.id, display: dispRateio[i], macos: macRateio[i], registrado_por_display: quem,
      embalado_em: embLote.embaladoEm,
    })))
    if (ok) { setEmbLote({ funcId: '', displays: '', macos: '', embaladoEm: getHoje(), grupo: '' }); setMarcadosEmb({}) }
    setSalvandoEmbLote(false)
  }

  return { embLote, setEmbLote, marcadosEmb, setMarcadosEmb, salvandoEmbLote,
           pendentesEmb, temRevisaoEmb, tamanhoLote, embSelecionados, revisadoEmb,
           sugestaoEmb, dispTotal, macTotal, dispRateio, macRateio, embaladoTotal,
           sobraEmb, handleEmbalarLote }
}
