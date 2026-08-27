import { useState, useMemo, useEffect } from 'react'
import Campo from '../components/Campo'
import { subDays, format } from 'date-fns'
import { useCQ, useFuncionarios, useRegistros, useConfig } from '../lib/hooks'
import { useAuth } from '../lib/auth'
import { getHoje, fmtNum, fmtData, exportCSV, sugerirEmpacote, isProducao, ratearRevisado, ratearInteiro } from '../lib/utils'
import Modal from '../components/Modal'
import ConfirmModal from '../components/ConfirmModal'
import toast from 'react-hot-toast'

const TIPOS = ['Original', 'Menta', 'Ouro', 'Outro']
// Sem campo de OS: a operação não usa ordem de serviço (foi por isso que o item 6
// do plano foi pulado). A coluna continua no banco, guardando o que já foi
// lançado; o que saiu é o campo vazio que ninguém sabia preencher.
const FORM0 = { funcId: '', data: getHoje(), tipo: 'Original', entregue: '', revisada: '', obs: '' }
const EMB0 = { display: '', macos: '' }

export default function ControleCQ() {
  const { isAdmin, funcSession } = useAuth()
  const hoje = getHoje()
  const ini30 = format(subDays(new Date(), 30), 'yyyy-MM-dd')
  const [form, setForm] = useState(FORM0)
  const [saving, setSaving] = useState(false)
  const [editando, setEditando] = useState(null)
  const [excluindo, setExcluindo] = useState(null)
  const [embalando, setEmbalando] = useState(null)
  const [emb, setEmb] = useState(EMB0)
  const [salvandoEmb, setSalvandoEmb] = useState(false)
  const [filtros, setFiltros] = useState({ funcId: '', dataInicio: ini30, dataFim: hoje, tipo: '' })
  const [aplicados, setAplicados] = useState({ ...filtros })

  const { funcionarios } = useFuncionarios()
  const { uniDisplay, uniMaco } = useConfig()
  const { cqRegistros, loading, registrar, registrarVarios, atualizar, atualizarVarios, excluir, resolverContestacao } = useCQ({ funcId: aplicados.funcId || undefined, dataInicio: aplicados.dataInicio, dataFim: aplicados.dataFim, tipo: aplicados.tipo || undefined })
  // Produção declarada pelo funcionário na data selecionada no formulário
  const { registros: regsDia } = useRegistros({ data: form.data })
  const prodDeclarada = form.funcId ? (regsDia.find(r => r.func_id === Number(form.funcId))?.quantidade || 0) : null

  // ── Lote de vários dias ────────────────────────────────────────────────────
  // O lote chega com a etiqueta de cada dia, mas a revisão é feita e contada de uma
  // vez só. Aqui ela lança os dias juntos e o sistema grava um registro por data.
  // Abre no lote, não no dia avulso: a revisadora pega vários lotes do mesmo
  // enrolador e conta tudo junto — é esse o trabalho dela. O dia avulso é a
  // exceção (correção de um lançamento), e era justamente o único modo sem uma
  // linha explicando o que fazer.
  const [modo, setModo] = useState('lote')
  const [lote, setLote] = useState({ funcId: '', tipo: 'Original', revisado: '', obs: '', revisadoEm: getHoje() })
  const [itens, setItens] = useState({})            // data -> { incluir, entregue }
  const [salvandoLote, setSalvandoLote] = useState(false)

  // Sem filtro de funcionário de propósito: os modos "Vários dias" e "Embalagem" podem
  // estar em parceiros diferentes, e filtrar por um deixaria o outro sem dados.
  const { registros: regsLote } = useRegistros({ dataInicio: ini30, dataFim: hoje })
  const { cqRegistros: cqLote } = useCQ({ dataInicio: ini30, dataFim: hoje })

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

  // Só enroladores (produção) aparecem para seleção — a finalização revisa a produção deles
  const ativos = funcionarios.filter(f => f.situacao === 'ativo' && isProducao(f))
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const ent = parseInt(form.entregue) || 0
  const rev = parseInt(form.revisada) || 0
  const perda = ent - rev
  const taxa = ent > 0 ? Math.round(rev / ent * 100) : 0

  const handleRegistrar = async () => {
    if (!form.funcId) { toast.error('Selecione um funcionário'); return }
    if (!form.entregue) { toast.error('Informe a quantidade entregue'); return }
    if (rev > ent) { toast.error('Revisada não pode ser maior que entregue'); return }
    if (form.data > hoje) { toast.error('Data não pode ser futura'); return }
    setSaving(true)
    const ok = await registrar({ func_id: Number(form.funcId), data: form.data, os: null, tipo: form.tipo, entregue: ent, revisada: rev, display: null, macos: null, obs: form.obs || null, registrado_por_revisao: isAdmin ? 'Admin' : funcSession?.nome || null, revisado_em: hoje })
    if (ok) setForm(FORM0)
    setSaving(false)
  }

  const handleSalvarEdicao = async () => {
    if (!isAdmin) return
    if (!editando) return
    const e2 = parseInt(editando.entregue) || 0
    const r2 = parseInt(editando.revisada) || 0
    if (r2 > e2) { toast.error('Revisada não pode ser maior que entregue'); return }
    const ok = await atualizar(editando.id, { data: editando.data, tipo: editando.tipo, entregue: e2, revisada: r2, display: editando.display === '' ? null : parseInt(editando.display), macos: editando.macos === '' ? null : parseInt(editando.macos), obs: editando.obs || null })
    if (ok) setEditando(null)
  }

  const sugEmb = embalando && embalando.revisada > 0 ? sugerirEmpacote(embalando.revisada, uniDisplay, uniMaco) : null

  const handleSalvarEmbalagem = async () => {
    if (!embalando) return
    const d = parseInt(emb.display) || 0
    const m = parseInt(emb.macos) || 0
    setSalvandoEmb(true)
    const ok = await atualizar(embalando.id, { display: d, macos: m, registrado_por_display: isAdmin ? 'Admin' : funcSession?.nome || null })
    if (ok) { setEmbalando(null); setEmb(EMB0) }
    setSalvandoEmb(false)
  }

  const contestacoesAbertas = cqRegistros.filter(r => r.contestacao_status === 'aberta').length
  const totEnt  = cqRegistros.reduce((s, r) => s + (r.entregue || 0), 0)
  const totRev  = cqRegistros.reduce((s, r) => s + (r.revisada || 0), 0)
  const totPerd = cqRegistros.reduce((s, r) => s + (r.perda || 0), 0)
  const taxaGeral = totEnt > 0 ? Math.round(totRev / totEnt * 100) : 0

  const handleExportar = () => exportCSV([['Data','Parceiro','Tipo','Veio','Prestou','Display','Maços','Descarte','% Aprov.','% Descarte','Revisão por','Embalagem por','Contestação','Obs.'],...cqRegistros.map(r=>[fmtData(r.data),r.funcionarios?.nome,r.tipo,r.entregue,r.revisada,r.display ?? '',r.macos ?? '',r.perda,r.taxa+'%',r.entregue>0?Math.round(r.perda/r.entregue*100)+'%':'0%',r.registrado_por_revisao||'',r.registrado_por_display||'(pendente)',r.contestacao?(r.contestacao_status==='resolvida'?'[resolvida] ':'[aberta] ')+r.contestacao:'',r.obs||''])], `cq_${hoje}.csv`)

  const badgeTipo = (t) => ({ Original: 'b-blue', Menta: 'b-green', Ouro: 'b-gold', Outro: 'b-amber' }[t] || 'b-amber')

  // Por tipo
  const porTipo = TIPOS.map(t => {
    const tr = cqRegistros.filter(r => r.tipo === t)
    if (!tr.length) return null
    const ent = tr.reduce((s, r) => s + r.entregue, 0)
    const rev = tr.reduce((s, r) => s + r.revisada, 0)
    const taxa = ent > 0 ? Math.round(rev / ent * 100) : 0
    return { t, ent, rev, perd: ent - rev, taxa, n: tr.length }
  }).filter(Boolean)

  const taxaCor = (t) => t >= 90 ? 'var(--green)' : t >= 70 ? 'var(--gold-light)' : 'var(--red)'

  return (
    <div>
      {/* Formulário */}
      <div className="card mb16">
        {/* O título acompanha o modo: dizer "Registrar Revisão" enquanto a pessoa
            está embalando é o tipo de detalhe que faz quem chegou agora achar que
            entrou na tela errada. */}
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <span>{modo === 'embalagem' ? '🏷 Embalar o que já foi revisado' : modo === 'lote' ? '📦 Revisar vários dias de uma vez' : '📦 Revisar um dia só'}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['lote', 'Vários dias'], ['dia', '1 dia'], ['embalagem', '🏷 Embalagem']].map(([m, label]) => (
              <button key={m} onClick={() => setModo(m)}
                style={{ padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
                  border: modo === m ? '2px solid var(--gold)' : '1px solid var(--border)',
                  background: modo === m ? 'rgba(201,162,39,.14)' : 'var(--bg3)',
                  color: modo === m ? 'var(--gold-light)' : 'var(--text2)' }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {modo === 'embalagem' ? (
          <>
            <div style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 12 }}>
              Para quando o monte do parceiro é embalado todo de uma vez. Informe <strong>o total de displays e maços</strong> que saiu;
              o sistema divide entre os dias, proporcional ao aprovado de cada um.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, alignItems: 'flex-end', marginBottom: 12 }}>
              <Campo label="Parceiro" style={{ margin: 0 }}><select value={embLote.funcId} onChange={e => setEmbLote(l => ({ ...l, funcId: e.target.value }))}>
                  <option value="">Selecionar...</option>
                  {ativos.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select></Campo>
              <Campo label="Embalado em" style={{ margin: 0 }}><input type="date" value={embLote.embaladoEm} max={hoje} onChange={e => setEmbLote(l => ({ ...l, embaladoEm: e.target.value }))} /></Campo>
              <Campo label="Displays (total)" style={{ margin: 0 }}><input type="number" min="0" value={embLote.displays} placeholder={sugestaoEmb ? String(sugestaoEmb.displays) : '0'}
                  onChange={e => setEmbLote(l => ({ ...l, displays: e.target.value }))} /></Campo>
              <Campo label="Maços (total)" style={{ margin: 0 }}><input type="number" min="0" value={embLote.macos} placeholder={sugestaoEmb ? String(sugestaoEmb.macos) : '0'}
                  onChange={e => setEmbLote(l => ({ ...l, macos: e.target.value }))} /></Campo>
            </div>

            {!embLote.funcId ? (
              <div style={{ fontSize: 13, color: 'var(--text3)', padding: '14px 0' }}>Escolha o parceiro para ver o que está revisado e ainda não foi embalado.</div>
            ) : pendentesEmb.length === 0 ? (
              temRevisaoEmb ? (
                <div className="alert a-success"><div>✓</div><div><strong>Nada pendente de embalagem</strong><span>Tudo que foi revisado deste parceiro nos últimos 30 dias já tem display lançado.</span></div></div>
              ) : (
                <div className="alert a-warn"><div>⚠</div><div><strong>Nenhuma revisão lançada</strong><span>Este parceiro não tem nenhum dia revisado nos últimos 30 dias. Lance a revisão em “Vários dias” antes de embalar.</span></div></div>
              )
            ) : (
              <>
                {sugestaoEmb && (
                  <div style={{ fontSize: 12.5, color: 'var(--gold-light)', background: 'rgba(201,162,39,.07)', border: '1px solid rgba(201,162,39,.25)', borderRadius: 'var(--rs)', padding: '8px 14px', marginBottom: 10 }}>
                    🏷 {fmtNum(revisadoEmb)} un. aprovadas dão <strong>{sugestaoEmb.displays} displays + {sugestaoEmb.macos} maços</strong>
                    {sugestaoEmb.avulso > 0 && <> e sobram <strong>{sugestaoEmb.avulso} un. avulsas</strong></>} — confira com o que saiu de verdade.
                  </div>
                )}
                <div className="table-wrap"><table className="compacta">
                  <thead><tr><th style={{ width: 40 }}>✓</th><th>Dia</th><th>Prestou</th><th>Displays</th><th>Maços</th></tr></thead>
                  <tbody>
                    {pendentesEmb.map(c => {
                      const idx = embSelecionados.findIndex(x => x.id === c.id)
                      return (
                        <tr key={c.id} style={{ opacity: marcadosEmb[c.id] ? 1 : .45 }}>
                          <td><input type="checkbox" checked={!!marcadosEmb[c.id]} onChange={e => setMarcadosEmb(m => ({ ...m, [c.id]: e.target.checked }))} style={{ width: 'auto', margin: 0 }} /></td>
                          {/* De onde veio o dia fica embaixo da data, não numa coluna
                              própria: a informação importa (é o contexto de quem
                              contestar), mas não vale uma coluna num celular. */}
                          <td>
                            <strong style={{ color: 'var(--text)' }}>{fmtData(c.data)}</strong>
                            <div style={{ color: 'var(--text3)', fontSize: 11 }}>
                              {c.lote_id
                                ? <>🧾 lote de {tamanhoLote[c.lote_id]} dias{c.revisado_em ? ` · ${fmtData(c.revisado_em, 'dd/MM')}` : ''}</>
                                : 'avulso'}
                            </div>
                          </td>
                          <td style={{ color: 'var(--green)' }}>{fmtNum(c.revisada)} un.</td>
                          <td style={{ color: 'var(--gold-light)', fontWeight: 700 }}>{idx >= 0 ? dispRateio[idx] : '—'}</td>
                          <td style={{ color: 'var(--text2)' }}>{idx >= 0 ? macRateio[idx] : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table></div>

                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg3)', borderRadius: 'var(--rs)', padding: '10px 14px', fontSize: 13, marginTop: 12 }}>
                  <span style={{ color: 'var(--text3)' }}>Dias: <strong style={{ color: 'var(--text)' }}>{embSelecionados.length}</strong></span>
                  <span style={{ color: 'var(--text3)' }}>Aprovado: <strong style={{ color: 'var(--green)' }}>{fmtNum(revisadoEmb)} un.</strong></span>
                  <span style={{ color: 'var(--text3)' }}>Embalado: <strong style={{ color: 'var(--text)' }}>{dispTotal} disp. + {macTotal} maços = {fmtNum(embaladoTotal)} un.</strong></span>
                  <span style={{ color: 'var(--text3)' }}>Sobra avulsa: <strong style={{ color: sobraEmb < 0 ? 'var(--red)' : 'var(--text2)' }}>{fmtNum(sobraEmb)} un.</strong></span>
                  <button className="btn btn-primary" onClick={handleEmbalarLote} disabled={salvandoEmbLote || !embSelecionados.length} style={{ marginLeft: 'auto' }}>
                    {salvandoEmbLote ? '...' : `🏷 Lançar embalagem de ${embSelecionados.length} ${embSelecionados.length === 1 ? 'dia' : 'dias'}`}
                  </button>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 8 }}>
                  ℹ️ Display e maço são inteiros: quem tem a maior sobra na conta leva a unidade a mais, e a soma fecha exatamente com o total que você informou.
                </div>
              </>
            )}
          </>
        ) : modo === 'lote' ? (
          <>
            <div style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 12 }}>
              Para quando chegam vários dias do mesmo parceiro de uma vez. Confira o entregue de cada dia pela etiqueta,
              informe <strong>quanto foi aprovado no total</strong> e o sistema divide o descarte entre os dias, proporcional ao tamanho de cada lote.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, alignItems: 'flex-end', marginBottom: 12 }}>
              <Campo label="Parceiro" style={{ margin: 0 }}><select value={lote.funcId} onChange={e => setLote(l => ({ ...l, funcId: e.target.value }))}>
                  <option value="">Selecionar...</option>
                  {ativos.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select></Campo>
              <Campo label="Tipo" style={{ margin: 0 }}><select value={lote.tipo} onChange={e => setLote(l => ({ ...l, tipo: e.target.value }))}>{TIPOS.map(t => <option key={t} value={t}>{t}</option>)}</select></Campo>
              <Campo label="Revisão fechada em" style={{ margin: 0 }}><input type="date" value={lote.revisadoEm} max={hoje} onChange={e => setLote(l => ({ ...l, revisadoEm: e.target.value }))} /></Campo>
              <Campo label="Total aprovado na revisão" style={{ margin: 0 }}><input type="number" min="0" value={lote.revisado} placeholder={totalEntregueLote ? String(totalEntregueLote) : 'Ex: 2900'}
                  onChange={e => setLote(l => ({ ...l, revisado: e.target.value }))} /></Campo>
              <Campo label="Observação" style={{ margin: 0 }}><input type="text" value={lote.obs} placeholder="Opcional..." onChange={e => setLote(l => ({ ...l, obs: e.target.value }))} /></Campo>
            </div>

            {!lote.funcId ? (
              <div style={{ fontSize: 13, color: 'var(--text3)', padding: '14px 0' }}>Escolha o parceiro para ver os dias que faltam revisar.</div>
            ) : diasPendentes.length === 0 ? (
              <div className="alert a-success"><div>✓</div><div><strong>Nenhum dia pendente</strong><span>Toda a produção declarada deste parceiro nos últimos 30 dias já passou pela revisão.</span></div></div>
            ) : (
              <>
                <div className="table-wrap"><table className="compacta">
                  {/* Quatro colunas, não seis: com o rateado e o descarte em colunas
                      próprias a tabela não cabia num celular, e o que ficava fora da
                      borda dependia de uma rolagem lateral que ninguém descobre. Os
                      dois viraram uma linha embaixo do campo, onde ela já olha. */}
                  <thead><tr><th style={{ width: 40 }}>✓</th><th>Dia</th><th>Declarado</th><th>Quanto veio</th></tr></thead>
                  <tbody>
                    {diasPendentes.map(r => {
                      const it = itens[r.data] || {}
                      const calc = previa.find(p => p.data === r.data)
                      const ent = parseInt(it.entregue) || 0
                      return (
                        <tr key={r.data} style={{ opacity: it.incluir ? 1 : .45 }}>
                          <td><input type="checkbox" checked={!!it.incluir} onChange={e => setItem(r.data, 'incluir', e.target.checked)} style={{ width: 'auto', margin: 0 }} /></td>
                          <td><strong style={{ color: 'var(--text)' }}>{fmtData(r.data)}</strong></td>
                          <td style={{ color: 'var(--gold-light)' }}>{fmtNum(r.quantidade)} un.</td>
                          <td>
                            <input type="number" min="0" value={it.entregue ?? ''} disabled={!it.incluir}
                              onChange={e => setItem(r.data, 'entregue', e.target.value)} style={{ width: 110 }} />
                            {it.incluir && ent > 0 && ent !== r.quantidade && (
                              <div style={{ fontSize: 10.5, color: 'var(--amber)' }}>
                                {ent > r.quantidade ? '+' : '−'}{fmtNum(Math.abs(ent - r.quantidade))} vs declarado
                              </div>
                            )}
                            {/* Só depois que ela informa o total aprovado: antes disso
                                o rateio assume tudo aprovado e mostraria "descarte 0"
                                em todos os dias, que não é resultado, é ruído. */}
                            {it.incluir && calc && lote.revisado !== '' && (
                              <div style={{ fontSize: 11, marginTop: 3 }}>
                                <span style={{ color: 'var(--green)' }}>prestou {fmtNum(calc.revisada)}</span>
                                {calc.entregue - calc.revisada > 0 && (
                                  <span style={{ color: 'var(--red)' }}> · −{fmtNum(calc.entregue - calc.revisada)}</span>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table></div>

                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg3)', borderRadius: 'var(--rs)', padding: '10px 14px', fontSize: 13, marginTop: 12 }}>
                  <span style={{ color: 'var(--text3)' }}>Dias: <strong style={{ color: 'var(--text)' }}>{selecionados.length}</strong></span>
                  <span style={{ color: 'var(--text3)' }}>Entregue: <strong style={{ color: 'var(--text)' }}>{fmtNum(totalEntregueLote)} un.</strong></span>
                  <span style={{ color: 'var(--text3)' }}>Aprovado: <strong style={{ color: 'var(--green)' }}>{fmtNum(revisadoLote)} un.</strong></span>
                  <span style={{ color: 'var(--text3)' }}>Descarte: <strong style={{ color: 'var(--red)' }}>{fmtNum(descarteLote)} un.</strong></span>
                  {totalEntregueLote > 0 && <span style={{ color: 'var(--text3)' }}>Qualidade: <strong style={{ color: 'var(--gold-light)' }}>{(revisadoLote / totalEntregueLote * 100).toFixed(1)}%</strong></span>}
                  <button className="btn btn-primary" onClick={handleRegistrarLote} disabled={salvandoLote || !selecionados.length} style={{ marginLeft: 'auto' }}>
                    {salvandoLote ? '...' : `✓ Registrar ${selecionados.length} ${selecionados.length === 1 ? 'dia' : 'dias'}`}
                  </button>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 8 }}>
                  ℹ️ Cada dia vira um registro separado, para a conferência diária continuar batendo.
                  A divisão do descarte não muda o pagamento nem a qualidade da quinzena — só distribui o que foi reprovado entre os lotes.
                </div>
              </>
            )}
          </>
        ) : (
        <>
        {/* auto-fit em vez de 6 colunas fixas: no celular os campos quebram em linhas
            em vez de sair pela borda — a revisão é lançada no chão de fábrica */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 10, alignItems: 'flex-end', marginBottom: 10 }}>
          {[
            { label: 'Parceiro', el: <select value={form.funcId} onChange={e => setF('funcId', e.target.value)}><option value="">Selecionar...</option>{ativos.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</select> },
            { label: 'Dia de produção', el: <input type="date" value={form.data} max={hoje} onChange={e => setF('data', e.target.value)} /> },
            { label: 'Quanto veio (contagem)', el: <input type="number" min="0" value={form.entregue} placeholder="Ex: 10000" onChange={e => setF('entregue', e.target.value)} /> },
            { label: 'Quanto prestou (aprovado)', el: <input type="number" min="0" value={form.revisada} placeholder="Ex: 9500" onChange={e => setF('revisada', e.target.value)} /> },
            { label: 'Tipo', el: <select value={form.tipo} onChange={e => setF('tipo', e.target.value)}>{TIPOS.map(t => <option key={t} value={t}>{t}</option>)}</select> },
          ].map(({ label, el }) => (
            <div className="fg" key={label} style={{ margin: 0 }}><label>{label}</label>{el}</div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <Campo label="Observação" style={{ margin: 0, flex: 1 }}><input type="text" value={form.obs} placeholder="Observações..." onChange={e => setF('obs', e.target.value)} /></Campo>
          <button className="btn btn-primary" onClick={handleRegistrar} disabled={saving} style={{ height: 40 }}>
            {saving ? '...' : '✓ Registrar Revisão'}
          </button>
        </div>

        {/* Produção declarada pelo funcionário na data */}
        {form.funcId && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: prodDeclarada > 0 ? 'rgba(201,162,39,.07)' : 'rgba(245,158,11,.07)', border: `1px solid ${prodDeclarada > 0 ? 'rgba(201,162,39,.25)' : 'rgba(245,158,11,.25)'}`, borderRadius: 'var(--rs)', padding: '8px 14px', fontSize: 12.5, marginTop: 8 }}>
            {prodDeclarada > 0 ? <>
              <span style={{ color: 'var(--text3)' }}>🌾 Produção declarada em {fmtData(form.data)}: <strong style={{ color: 'var(--gold-light)' }}>{fmtNum(prodDeclarada)} un.</strong></span>
              {ent !== prodDeclarada && (
                <button className="btn btn-secondary btn-xs" onClick={() => setF('entregue', String(prodDeclarada))}>Usar como entregue</button>
              )}
              {ent > 0 && ent !== prodDeclarada && (
                <span style={{ color: 'var(--amber)', fontWeight: 700 }}>⚠ Entregue difere do declarado ({ent > prodDeclarada ? '+' : '−'}{fmtNum(Math.abs(ent - prodDeclarada))} un.)</span>
              )}
            </> : (
              <span style={{ color: 'var(--amber)' }}>⚠ Este funcionário não registrou produção em {fmtData(form.data)}</span>
            )}
          </div>
        )}

        {ent > 0 && (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg3)', borderRadius: 'var(--rs)', padding: '8px 14px', fontSize: 12.5, marginTop: 8 }}>
            <span style={{ color: 'var(--text3)' }}>Entregue: <strong style={{ color: 'var(--text)' }}>{fmtNum(ent)} un.</strong></span>
            {rev > 0 && <>
              <span style={{ color: 'var(--text3)' }}>Revisado: <strong style={{ color: 'var(--green)' }}>{fmtNum(rev)} un.</strong></span>
              <span style={{ color: 'var(--text3)' }}>Perda: <strong style={{ color: 'var(--red)' }}>{fmtNum(perda)} un.</strong></span>
              <span style={{ color: 'var(--text3)' }}>Aproveitamento: <strong style={{ color: taxaCor(taxa) }}>{taxa}%</strong></span>
            </>}
          </div>
        )}
        </>
        )}
      </div>

      {/* Filtros. O título não é enfeite: sem ele, no celular este bloco fica
          colado no formulário e parece a continuação dele — dava para preencher
          o filtro achando que estava lançando e concluir que o sistema não grava. */}
      <div className="card mb16">
        <div className="card-title">🔎 Consultar o que já foi lançado</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Campo label="Parceiro" style={{ margin: 0, minWidth: 160 }}><select value={filtros.funcId} onChange={e => setFiltros(f => ({ ...f, funcId: e.target.value }))}>
              <option value="">Todos</option>{funcionarios.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select></Campo>
          <Campo label="De" style={{ margin: 0 }}><input type="date" value={filtros.dataInicio} onChange={e => setFiltros(f => ({ ...f, dataInicio: e.target.value }))} /></Campo>
          <Campo label="Até" style={{ margin: 0 }}><input type="date" value={filtros.dataFim} max={hoje} onChange={e => setFiltros(f => ({ ...f, dataFim: e.target.value }))} /></Campo>
          <Campo label="Tipo" style={{ margin: 0 }}><select value={filtros.tipo} onChange={e => setFiltros(f => ({ ...f, tipo: e.target.value }))}>
              <option value="">Todos</option>{TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
            </select></Campo>
          <button className="btn btn-primary btn-sm" onClick={() => setAplicados({ ...filtros })}>🔍 Filtrar</button>
          <button className="btn btn-secondary btn-sm" onClick={handleExportar}>⬇ CSV</button>
        </div>

        {/* Totais */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
          {[['Veio', fmtNum(totEnt) + ' un.', 'var(--text)'], ['Prestou', fmtNum(totRev) + ' un.', 'var(--green)'], ['Descarte', fmtNum(totPerd) + ' un.', 'var(--red)'], ['Aproveitamento', taxaGeral + '%', taxaCor(taxaGeral)], ['Lançamentos', cqRegistros.length, 'var(--text)'], ...(contestacoesAbertas > 0 ? [['⚑ Contestações abertas', contestacoesAbertas, 'var(--amber)']] : [])].map(([l, v, c]) => (
            <div key={l} className="stats-chip"><span style={{ color: 'var(--text3)' }}>{l}: </span><strong style={{ color: c }}>{v}</strong></div>
          ))}
        </div>
      </div>

      {/* Tabela */}
      <div className="card mb16">
        <div className="card-title">📋 Registros de Revisão & Empacotamento</div>
        {loading ? <div className="loading"><div className="spin" /></div>
          : cqRegistros.length === 0
            ? <div className="empty-state"><div className="es-icon">📦</div><div className="es-text">Nenhum registro de revisão no período</div></div>
            : <div className="table-wrap"><table>
                <thead><tr><th>Data</th><th>Parceiro</th><th>Tipo</th><th>Veio</th><th>Prestou</th><th>Descarte</th><th>% Aprov.</th><th>% Descarte</th><th>Revisão por</th><th>Embalagem</th><th>Contestação</th><th>Obs.</th><th>Ações</th></tr></thead>
                <tbody>{cqRegistros.map(r => {
                  const ptaxa = r.entregue > 0 ? Math.round(r.perda / r.entregue * 100) : 0
                  const pendente = !r.registrado_por_display
                  return (
                    <tr key={r.id}>
                      <td>{fmtData(r.data)}</td>
                      <td><strong style={{ color: 'var(--text)' }}>{r.funcionarios?.nome}</strong></td>
                      <td><span className={`badge ${badgeTipo(r.tipo)}`}>{r.tipo}</span></td>
                      <td>{fmtNum(r.entregue)} un.</td>
                      <td style={{ color: 'var(--green)' }}>{fmtNum(r.revisada)} un.</td>
                      <td style={{ color: 'var(--red)' }}>{fmtNum(r.perda)} un.</td>
                      <td><span style={{ fontWeight: 700, color: taxaCor(r.taxa) }}>{r.taxa}%</span></td>
                      <td style={{ color: 'var(--red)' }}>{ptaxa}%</td>
                      <td style={{ color: 'var(--text3)' }}>
                        {r.registrado_por_revisao || '—'}
                        {r.revisado_em && <div style={{ fontSize: 10.5 }}>em {fmtData(r.revisado_em)}</div>}
                        {r.lote_id && (
                          <div style={{ fontSize: 10.5, color: 'var(--blue)' }}
                            title="Este dia foi contado junto com outros no mesmo monte — o descarte foi dividido proporcionalmente">
                            🧾 lote de {cqRegistros.filter(x => x.lote_id === r.lote_id).length} dias
                          </div>
                        )}
                      </td>
                      <td>{pendente
                        ? <button className="btn btn-secondary btn-xs" onClick={() => { setEmbalando(r); setEmb(EMB0) }}>🏷 Registrar embalagem</button>
                        : <span style={{ color: 'var(--text3)' }}>{r.display} disp. + {r.macos} maços <span style={{ fontSize: 11, opacity: 0.75 }}>— {r.registrado_por_display}</span></span>}
                      </td>
                      <td>{!r.contestacao ? <span style={{ color: 'var(--text3)' }}>—</span>
                        : <div style={{ maxWidth: 180 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: r.contestacao_status === 'resolvida' ? 'var(--green)' : 'var(--amber)' }}>
                              {r.contestacao_status === 'resolvida' ? '✓ Resolvida' : '⚑ Aberta'}
                              {r.contestacao_status === 'aberta' && isAdmin && (
                                <button className="btn btn-secondary btn-xs" style={{ marginLeft: 6 }} title="Marcar como resolvida" onClick={() => resolverContestacao(r.id)}>✓ Resolver</button>
                              )}
                            </div>
                            <div style={{ fontSize: 11.5, color: 'var(--text3)', whiteSpace: 'normal' }} title={r.contestacao}>{r.contestacao}</div>
                          </div>}
                      </td>
                      <td style={{ color: 'var(--text3)' }}>{r.obs || '—'}</td>
                      <td><div style={{ display: 'flex', gap: 5 }}>
                        {isAdmin && <button className="btn btn-secondary btn-xs" onClick={() => setEditando({ ...r })}>✏️</button>}
                        {isAdmin && <button className="btn btn-danger btn-xs" onClick={() => setExcluindo(r)}>🗑</button>}
                        {pendente && !isAdmin && <span style={{ color: 'var(--text3)', fontSize: 11 }}>⏳ pendente</span>}
                      </div></td>
                    </tr>
                  )
                })}</tbody>
              </table></div>
        }
      </div>

      {/* Análise */}
      <div className="card">
        <div className="card-title">📊 Aproveitamento por Tipo</div>
        {porTipo.length === 0
          ? <div className="empty-state"><div className="es-icon">📭</div><div className="es-text">Sem dados por tipo</div></div>
          : <div className="table-wrap"><table>
              <thead><tr><th>Tipo</th><th>Veio</th><th>Prestou</th><th>Descarte</th><th>Aproveit.</th><th>Regs</th></tr></thead>
              <tbody>{porTipo.map(x => (
                <tr key={x.t}>
                  <td><span className={`badge ${badgeTipo(x.t)}`}>{x.t}</span></td>
                  <td>{fmtNum(x.ent)} un.</td>
                  <td style={{ color: 'var(--green)' }}>{fmtNum(x.rev)} un.</td>
                  <td style={{ color: 'var(--red)' }}>{fmtNum(x.perd)} un.</td>
                  <td><span style={{ fontWeight: 700, color: taxaCor(x.taxa) }}>{x.taxa}%</span></td>
                  <td>{x.n}</td>
                </tr>
              ))}</tbody>
            </table></div>
        }
      </div>

      {/* Modal Editar */}
      {editando && (
        <Modal title="Editar Registro CQ" onClose={() => setEditando(null)} width={600}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Campo label="Parceiro"><input value={editando.funcionarios?.nome || ''} readOnly /></Campo>
            <Campo label="Dia de produção"><input type="date" value={editando.data} max={hoje} onChange={e => setEditando(v => ({ ...v, data: e.target.value }))} /></Campo>
            <Campo label="Tipo"><select value={editando.tipo} onChange={e => setEditando(v => ({ ...v, tipo: e.target.value }))}>{TIPOS.map(t => <option key={t} value={t}>{t}</option>)}</select></Campo>
            <Campo label="Quanto veio"><input type="number" min="0" value={editando.entregue} onChange={e => setEditando(v => ({ ...v, entregue: e.target.value }))} /></Campo>
            <Campo label="Quanto prestou"><input type="number" min="0" value={editando.revisada} onChange={e => setEditando(v => ({ ...v, revisada: e.target.value }))} /></Campo>
            <Campo label="Display"><input type="number" min="0" value={editando.display || 0} onChange={e => setEditando(v => ({ ...v, display: e.target.value }))} /></Campo>
            <Campo label="Maços"><input type="number" min="0" value={editando.macos || 0} onChange={e => setEditando(v => ({ ...v, macos: e.target.value }))} /></Campo>
            <Campo label="Descarte (auto)"><input value={editando.entregue > 0 ? fmtNum(editando.entregue - editando.revisada) + ' un.' : '—'} readOnly /></Campo>
            <Campo label="% Aproveit. (auto)"><input value={editando.entregue > 0 ? Math.round(editando.revisada / editando.entregue * 100) + '%' : '—'} readOnly /></Campo>
          </div>
          <Campo label="Observação"><input value={editando.obs || ''} onChange={e => setEditando(v => ({ ...v, obs: e.target.value }))} /></Campo>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={handleSalvarEdicao}>Salvar</button>
            <button className="btn btn-secondary" onClick={() => setEditando(null)}>Cancelar</button>
          </div>
        </Modal>
      )}

      {excluindo && (
        <ConfirmModal title="Excluir registro de CQ?" onConfirm={async () => { if (isAdmin) await excluir(excluindo.id); setExcluindo(null) }} onCancel={() => setExcluindo(null)}
          details={[['Funcionário', excluindo.funcionarios?.nome], ['Data', fmtData(excluindo.data)], ['Entregue', fmtNum(excluindo.entregue) + ' un.'], ['Taxa', excluindo.taxa + '%']]} />
      )}

      {/* Modal Registrar Embalagem */}
      {embalando && (
        <Modal title="🏷 Registrar Embalagem" onClose={() => { setEmbalando(null); setEmb(EMB0) }} width={440}>
          <div style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 10 }}>
            {embalando.funcionarios?.nome} — {fmtData(embalando.data)} · {fmtNum(embalando.revisada)} un. revisadas
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Campo label="Displays"><input type="number" min="0" value={emb.display} placeholder="47" onChange={e => setEmb(v => ({ ...v, display: e.target.value }))} /></Campo>
            <Campo label="Maços"><input type="number" min="0" value={emb.macos} placeholder="15" onChange={e => setEmb(v => ({ ...v, macos: e.target.value }))} /></Campo>
          </div>
          {sugEmb && (sugEmb.displays > 0 || sugEmb.macos > 0) && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: 'rgba(59,130,246,.07)', border: '1px solid rgba(59,130,246,.2)', borderRadius: 'var(--rs)', padding: '8px 14px', fontSize: 12.5, marginBottom: 10 }}>
              <span style={{ color: 'var(--text3)' }}>
                💡 Sugestão: <strong style={{ color: 'var(--blue)' }}>{sugEmb.displays} displays + {sugEmb.macos} maços</strong>
                {sugEmb.avulso > 0 && <span style={{ color: 'var(--amber)' }}> ({sugEmb.avulso} un. avulsas)</span>}
              </span>
              {(String(sugEmb.displays) !== emb.display || String(sugEmb.macos) !== emb.macos) && (
                <button className="btn btn-secondary btn-xs" onClick={() => setEmb({ display: String(sugEmb.displays), macos: String(sugEmb.macos) })}>Aplicar</button>
              )}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={handleSalvarEmbalagem} disabled={salvandoEmb}>{salvandoEmb ? '...' : 'Salvar'}</button>
            <button className="btn btn-secondary" onClick={() => { setEmbalando(null); setEmb(EMB0) }}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
