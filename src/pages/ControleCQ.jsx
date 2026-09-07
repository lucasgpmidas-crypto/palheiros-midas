import { useState } from 'react'
import Campo from '../components/Campo'
import { subDays, format } from 'date-fns'
import { useCQ, useFuncionarios, useRegistros, useConfig } from '../lib/hooks'
import { useAuth } from '../lib/auth'
import { getHoje, fmtNum, fmtData, exportCSV, sugerirEmpacote, isProducao } from '../lib/utils'
import Modal from '../components/Modal'
import ConfirmModal from '../components/ConfirmModal'
import toast from 'react-hot-toast'
import { useLoteRevisao } from './ControleCQ/useLoteRevisao'
import { useEmbalagemLote } from './ControleCQ/useEmbalagemLote'
import { badgeTipo, taxaCor } from './ControleCQ/cq-visual'
import FormEmbalagem from './ControleCQ/FormEmbalagem'
import FormLote from './ControleCQ/FormLote'
import FormAvulso from './ControleCQ/FormAvulso'

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

  // Sem filtro de funcionário de propósito: os modos "Vários dias" e "Embalagem" podem
  // estar em parceiros diferentes, e filtrar por um deixaria o outro sem dados.
  const { registros: regsLote } = useRegistros({ dataInicio: ini30, dataFim: hoje })
  const { cqRegistros: cqLote } = useCQ({ dataInicio: ini30, dataFim: hoje })

  const loteRevisao = useLoteRevisao({ regsLote, cqLote, hoje, isAdmin, funcSession, registrarVarios })

  const embalagemLote = useEmbalagemLote({ cqLote, uniDisplay, uniMaco, isAdmin, funcSession, atualizarVarios })



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


  // Por tipo
  const porTipo = TIPOS.map(t => {
    const tr = cqRegistros.filter(r => r.tipo === t)
    if (!tr.length) return null
    const ent = tr.reduce((s, r) => s + r.entregue, 0)
    const rev = tr.reduce((s, r) => s + r.revisada, 0)
    const taxa = ent > 0 ? Math.round(rev / ent * 100) : 0
    return { t, ent, rev, perd: ent - rev, taxa, n: tr.length }
  }).filter(Boolean)


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
          <FormEmbalagem ativos={ativos} hoje={hoje} {...embalagemLote} />
        ) : modo === 'lote' ? (
          <FormLote TIPOS={TIPOS} ativos={ativos} hoje={hoje} {...loteRevisao} />
        ) : (
          <FormAvulso TIPOS={TIPOS} ativos={ativos} hoje={hoje} form={form} setF={setF} saving={saving} handleRegistrar={handleRegistrar} prodDeclarada={prodDeclarada} ent={ent} rev={rev} perda={perda} taxa={taxa} />
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
