import { useState } from 'react'
import { subDays, format } from 'date-fns'
import { useCQ, useFuncionarios, useRegistros, useConfig } from '../lib/hooks'
import { useAuth } from '../lib/auth'
import { getHoje, fmtNum, fmtData, exportCSV, sugerirEmpacote, isProducao } from '../lib/utils'
import Modal from '../components/Modal'
import ConfirmModal from '../components/ConfirmModal'
import toast from 'react-hot-toast'

const TIPOS = ['Original', 'Menta', 'Ouro', 'Outro']
const FORM0 = { funcId: '', data: getHoje(), os: '', tipo: 'Original', entregue: '', revisada: '', obs: '' }
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
  const { cqRegistros, loading, registrar, atualizar, excluir, resolverContestacao } = useCQ({ funcId: aplicados.funcId || undefined, dataInicio: aplicados.dataInicio, dataFim: aplicados.dataFim, tipo: aplicados.tipo || undefined })
  // Produção declarada pelo funcionário na data selecionada no formulário
  const { registros: regsDia } = useRegistros({ data: form.data })
  const prodDeclarada = form.funcId ? (regsDia.find(r => r.func_id === Number(form.funcId))?.quantidade || 0) : null

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
    const ok = await registrar({ func_id: Number(form.funcId), data: form.data, os: form.os || null, tipo: form.tipo, entregue: ent, revisada: rev, display: null, macos: null, obs: form.obs || null, registrado_por_revisao: isAdmin ? 'Admin' : funcSession?.nome || null })
    if (ok) setForm(FORM0)
    setSaving(false)
  }

  const handleSalvarEdicao = async () => {
    if (!isAdmin) return
    if (!editando) return
    const e2 = parseInt(editando.entregue) || 0
    const r2 = parseInt(editando.revisada) || 0
    if (r2 > e2) { toast.error('Revisada não pode ser maior que entregue'); return }
    const ok = await atualizar(editando.id, { data: editando.data, os: editando.os || null, tipo: editando.tipo, entregue: e2, revisada: r2, display: editando.display === '' ? null : parseInt(editando.display), macos: editando.macos === '' ? null : parseInt(editando.macos), obs: editando.obs || null })
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

  const handleExportar = () => exportCSV([['Data','Funcionário','OS','Tipo','Entregue','Revisado','Display','Maços','Perda','% Aprov.','% Perda','Revisão por','Embalagem por','Contestação','Obs.'],...cqRegistros.map(r=>[fmtData(r.data),r.funcionarios?.nome,r.os||'',r.tipo,r.entregue,r.revisada,r.display ?? '',r.macos ?? '',r.perda,r.taxa+'%',r.entregue>0?Math.round(r.perda/r.entregue*100)+'%':'0%',r.registrado_por_revisao||'',r.registrado_por_display||'(pendente)',r.contestacao?(r.contestacao_status==='resolvida'?'[resolvida] ':'[aberta] ')+r.contestacao:'',r.obs||''])], `cq_${hoje}.csv`)

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
        <div className="card-title">📦 Registrar Revisão (contagem, maços e descarte)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.6fr 1fr 1fr 0.7fr', gap: 10, alignItems: 'flex-end', marginBottom: 10 }}>
          {[
            { label: 'Funcionário', el: <select value={form.funcId} onChange={e => setF('funcId', e.target.value)}><option value="">Selecionar...</option>{ativos.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</select> },
            { label: 'Data', el: <input type="date" value={form.data} max={hoje} onChange={e => setF('data', e.target.value)} /> },
            { label: 'OS', el: <input type="text" value={form.os} placeholder="Nº" onChange={e => setF('os', e.target.value)} /> },
            { label: 'Qtd. Entregue', el: <input type="number" min="0" value={form.entregue} placeholder="Ex: 10000" onChange={e => setF('entregue', e.target.value)} /> },
            { label: 'Qtd. Revisada', el: <input type="number" min="0" value={form.revisada} placeholder="Ex: 9500" onChange={e => setF('revisada', e.target.value)} /> },
            { label: 'Tipo', el: <select value={form.tipo} onChange={e => setF('tipo', e.target.value)}>{TIPOS.map(t => <option key={t} value={t}>{t}</option>)}</select> },
          ].map(({ label, el }) => (
            <div className="fg" key={label} style={{ margin: 0 }}><label>{label}</label>{el}</div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div className="fg" style={{ margin: 0, flex: 1 }}><label>Observação</label><input type="text" value={form.obs} placeholder="Observações..." onChange={e => setF('obs', e.target.value)} /></div>
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
      </div>

      {/* Filtros */}
      <div className="card mb16">
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="fg" style={{ margin: 0, minWidth: 160 }}><label>Funcionário</label>
            <select value={filtros.funcId} onChange={e => setFiltros(f => ({ ...f, funcId: e.target.value }))}>
              <option value="">Todos</option>{funcionarios.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          <div className="fg" style={{ margin: 0 }}><label>De</label><input type="date" value={filtros.dataInicio} onChange={e => setFiltros(f => ({ ...f, dataInicio: e.target.value }))} /></div>
          <div className="fg" style={{ margin: 0 }}><label>Até</label><input type="date" value={filtros.dataFim} max={hoje} onChange={e => setFiltros(f => ({ ...f, dataFim: e.target.value }))} /></div>
          <div className="fg" style={{ margin: 0 }}><label>Tipo</label>
            <select value={filtros.tipo} onChange={e => setFiltros(f => ({ ...f, tipo: e.target.value }))}>
              <option value="">Todos</option>{TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setAplicados({ ...filtros })}>🔍 Filtrar</button>
          <button className="btn btn-secondary btn-sm" onClick={handleExportar}>⬇ CSV</button>
        </div>

        {/* Totais */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
          {[['Total Entregue', fmtNum(totEnt) + ' un.', 'var(--text)'], ['Total Revisado', fmtNum(totRev) + ' un.', 'var(--green)'], ['Total Perda', fmtNum(totPerd) + ' un.', 'var(--red)'], ['Taxa Geral', taxaGeral + '%', taxaCor(taxaGeral)], ['Registros', cqRegistros.length, 'var(--text)'], ...(contestacoesAbertas > 0 ? [['⚑ Contestações abertas', contestacoesAbertas, 'var(--amber)']] : [])].map(([l, v, c]) => (
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
                <thead><tr><th>Data</th><th>Funcionário</th><th>OS</th><th>Tipo</th><th>Entregue</th><th>Revisado</th><th>Perda</th><th>% Aprov.</th><th>% Perda</th><th>Revisão por</th><th>Embalagem</th><th>Contestação</th><th>Obs.</th><th>Ações</th></tr></thead>
                <tbody>{cqRegistros.map(r => {
                  const ptaxa = r.entregue > 0 ? Math.round(r.perda / r.entregue * 100) : 0
                  const pendente = !r.registrado_por_display
                  return (
                    <tr key={r.id}>
                      <td>{fmtData(r.data)}</td>
                      <td><strong style={{ color: 'var(--text)' }}>{r.funcionarios?.nome}</strong></td>
                      <td style={{ color: 'var(--text3)' }}>{r.os || '—'}</td>
                      <td><span className={`badge ${badgeTipo(r.tipo)}`}>{r.tipo}</span></td>
                      <td>{fmtNum(r.entregue)} un.</td>
                      <td style={{ color: 'var(--green)' }}>{fmtNum(r.revisada)} un.</td>
                      <td style={{ color: 'var(--red)' }}>{fmtNum(r.perda)} un.</td>
                      <td><span style={{ fontWeight: 700, color: taxaCor(r.taxa) }}>{r.taxa}%</span></td>
                      <td style={{ color: 'var(--red)' }}>{ptaxa}%</td>
                      <td style={{ color: 'var(--text3)' }}>{r.registrado_por_revisao || '—'}</td>
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
              <thead><tr><th>Tipo</th><th>Entregue</th><th>Revisado</th><th>Perda</th><th>Aproveit.</th><th>Regs</th></tr></thead>
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
            <div className="fg"><label>Funcionário</label><input value={editando.funcionarios?.nome || ''} readOnly /></div>
            <div className="fg"><label>Data</label><input type="date" value={editando.data} max={hoje} onChange={e => setEditando(v => ({ ...v, data: e.target.value }))} /></div>
            <div className="fg"><label>OS</label><input value={editando.os || ''} onChange={e => setEditando(v => ({ ...v, os: e.target.value }))} /></div>
            <div className="fg"><label>Tipo</label><select value={editando.tipo} onChange={e => setEditando(v => ({ ...v, tipo: e.target.value }))}>{TIPOS.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
            <div className="fg"><label>Qtd. Entregue</label><input type="number" min="0" value={editando.entregue} onChange={e => setEditando(v => ({ ...v, entregue: e.target.value }))} /></div>
            <div className="fg"><label>Qtd. Revisada</label><input type="number" min="0" value={editando.revisada} onChange={e => setEditando(v => ({ ...v, revisada: e.target.value }))} /></div>
            <div className="fg"><label>Display</label><input type="number" min="0" value={editando.display || 0} onChange={e => setEditando(v => ({ ...v, display: e.target.value }))} /></div>
            <div className="fg"><label>Maços</label><input type="number" min="0" value={editando.macos || 0} onChange={e => setEditando(v => ({ ...v, macos: e.target.value }))} /></div>
            <div className="fg"><label>Perda (auto)</label><input value={editando.entregue > 0 ? fmtNum(editando.entregue - editando.revisada) + ' un.' : '—'} readOnly /></div>
            <div className="fg"><label>% Aproveit. (auto)</label><input value={editando.entregue > 0 ? Math.round(editando.revisada / editando.entregue * 100) + '%' : '—'} readOnly /></div>
          </div>
          <div className="fg"><label>Observação</label><input value={editando.obs || ''} onChange={e => setEditando(v => ({ ...v, obs: e.target.value }))} /></div>
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
            <div className="fg"><label>Displays</label><input type="number" min="0" value={emb.display} placeholder="47" onChange={e => setEmb(v => ({ ...v, display: e.target.value }))} /></div>
            <div className="fg"><label>Maços</label><input type="number" min="0" value={emb.macos} placeholder="15" onChange={e => setEmb(v => ({ ...v, macos: e.target.value }))} /></div>
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
