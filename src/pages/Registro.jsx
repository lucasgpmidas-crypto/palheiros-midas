import { useState } from 'react'
import { useRegistros, useFuncionarios, useConfig } from '../lib/hooks'
import { getHoje, fmtMoeda, fmtNum, fmtData, calcValor, pctMeta, corPct, isProducao } from '../lib/utils'
import Modal from '../components/Modal'
import ConfirmModal from '../components/ConfirmModal'

export default function Registro() {
  const hoje = getHoje()
  const { valorMil } = useConfig()
  const { funcionarios } = useFuncionarios()
  const { registros, loading, registrar, atualizar, excluir } = useRegistros({ data: hoje })

  const [dataReg, setDataReg] = useState(hoje)
  const [form, setForm] = useState({ funcId: '', qty: '', aprov: '', obs: '' })
  const [saving, setSaving] = useState(false)
  const [editando, setEditando] = useState(null)
  const [excluindo, setExcluindo] = useState(null)
  const [justAdded, setJustAdded] = useState(null)

  const ativos = funcionarios.filter(f => f.situacao === 'ativo' && isProducao(f))
  const regsData = registros.filter(r => r.data === dataReg).sort((a, b) => b.quantidade - a.quantidade)

  const previewQty  = parseInt(form.qty) || 0
  const previewAprov = parseInt(form.aprov) || 0
  const previewVal  = calcValor(previewAprov || previewQty, valorMil)
  const previewTaxa = previewAprov > 0 && previewQty > 0 ? Math.round(previewAprov / previewQty * 100) : null
  const previewPerda = previewAprov > 0 ? previewQty - previewAprov : 0

  const handleRegistrar = async () => {
    if (!form.funcId) return
    if (!form.qty || parseInt(form.qty) <= 0) return
    const aprov = parseInt(form.aprov) || null
    if (aprov && aprov > parseInt(form.qty)) return
    setSaving(true)
    const nomeFunc = ativos.find(f => f.id === Number(form.funcId))?.nome
    const ok = await registrar({ funcId: Number(form.funcId), quantidade: parseInt(form.qty), aproveitado: aprov, data: dataReg, obs: form.obs, valorMil })
    if (ok) {
      setForm({ funcId: '', qty: '', aprov: '', obs: '' })
      setJustAdded(nomeFunc || 'Funcionário')
      setTimeout(() => setJustAdded(null), 3000)
    }
    setSaving(false)
  }

  const handleEditar = (r) => setEditando({ ...r, func_nome: r.funcionarios?.nome })
  const handleSalvarEdicao = async () => {
    if (!editando) return
    const qty = parseInt(editando.quantidade) || 0
    const aprov = parseInt(editando.aproveitado) || null
    if (aprov && aprov > qty) return
    const valor = calcValor(aprov ?? qty, valorMil)
    const ok = await atualizar(editando.id, { quantidade: qty, aproveitado: aprov, data: editando.data, obs: editando.obs || null, valor })
    if (ok) setEditando(null)
  }

  const handleExcluir = async () => {
    if (!excluindo) return
    await excluir(excluindo.id)
    setExcluindo(null)
  }

  const MEDALS = ['🥇', '🥈', '🥉']
  const total = regsData.reduce((s, r) => s + r.quantidade, 0)
  const valor = regsData.reduce((s, r) => s + (Number(r.valor) || 0), 0)

  return (
    <div>
      {/* Quick reg */}
      <div className="card mb16">
        <div className="card-title">⚡ Registro Rápido</div>
        <div className="quick-reg">
          <div className="fg" style={{ margin: 0 }}>
            <label>Data</label>
            <input type="date" value={dataReg} max={hoje} onChange={e => setDataReg(e.target.value)} />
          </div>
          <div className="fg" style={{ margin: 0 }}>
            <label>Funcionário</label>
            <select value={form.funcId} onChange={e => setForm(f => ({ ...f, funcId: e.target.value }))}>
              <option value="">Selecionar...</option>
              {ativos.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>
          <div className="fg" style={{ margin: 0 }}>
            <label>Qtd. Produzida</label>
            <input type="number" min="0" placeholder="Ex: 3000" value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} />
          </div>
          <div className="fg" style={{ margin: 0 }}>
            <label>Qtd. Aproveitada</label>
            <input type="number" min="0" placeholder="Opcional" value={form.aprov} onChange={e => setForm(f => ({ ...f, aprov: e.target.value }))} />
          </div>
          <div className="fg" style={{ margin: 0 }}>
            <label>Observação</label>
            <input type="text" placeholder="Opcional" value={form.obs} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} />
          </div>
          <button className="btn btn-primary" onClick={handleRegistrar} disabled={saving || !form.funcId || !form.qty} style={{ height: 42 }}>
            {saving ? '...' : '✓ Registrar'}
          </button>
        </div>
        {justAdded && (
          <div style={{ display:'flex', alignItems:'center', gap:10, background:'rgba(40,180,133,.1)', border:'1px solid rgba(40,180,133,.25)', borderRadius:'var(--rs)', padding:'9px 14px', fontSize:13, color:'var(--green)', marginTop:6, animation:'slideUp .25s ease' }}>
            <span style={{ fontSize:18 }}>✅</span>
            <span><strong>{justAdded}</strong> registrado com sucesso!</span>
          </div>
        )}
        {previewQty > 0 && (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', background: 'var(--bg3)', borderRadius: 'var(--rs)', padding: '8px 14px', fontSize: 12.5, marginTop: 6 }}>
            <span style={{ color: 'var(--text3)' }}>Produzido: <strong style={{ color: 'var(--text)' }}>{fmtNum(previewQty)} un.</strong></span>
            {previewAprov > 0 && <>
              <span style={{ color: 'var(--text3)' }}>Aproveitado: <strong style={{ color: 'var(--green)' }}>{fmtNum(previewAprov)} un.</strong></span>
              <span style={{ color: 'var(--text3)' }}>Perda: <strong style={{ color: 'var(--red)' }}>{fmtNum(previewPerda)} un.</strong></span>
              <span style={{ color: 'var(--text3)' }}>Taxa: <strong style={{ color: 'var(--amber)' }}>{previewTaxa}%</strong></span>
            </>}
            <span style={{ color: 'var(--text3)' }}>Valor: <strong style={{ color: 'var(--green)' }}>{fmtMoeda(previewVal)}</strong></span>
          </div>
        )}
      </div>

      {/* Tabela */}
      <div className="card">
        <div className="card-title">
          📋 Registros —&nbsp;
          <span style={{ color: 'var(--gold-light)', textTransform: 'none', fontWeight: 600, fontSize: 14 }}>
            {new Date(dataReg + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
        </div>

        {loading ? <div className="loading"><div className="spin" /></div>
          : regsData.length === 0
            ? <div className="empty-state"><div className="es-icon">📝</div><div className="es-text">Nenhum registro nesta data</div></div>
            : <>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                {[['Total', fmtNum(total) + ' un.', 'var(--gold-light)'], ['Valor', fmtMoeda(valor), 'var(--green)'], ['Registros', regsData.length, 'var(--text)']].map(([l, v, c]) => (
                  <div key={l} className="stats-chip"><span style={{ color: 'var(--text3)' }}>{l}: </span><strong style={{ color: c }}>{v}</strong></div>
                ))}
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>#</th><th>Funcionário</th><th>Produzido</th><th>Aproveitado</th><th>Perda</th><th>Taxa</th><th>Valor</th><th>% Meta</th><th>Obs.</th><th>Ações</th></tr></thead>
                  <tbody>
                    {regsData.map((r, i) => {
                      const meta = r.funcionarios?.meta_diaria || 1
                      const pct = pctMeta(r.quantidade, meta)
                      return (
                        <tr key={r.id}>
                          <td style={{ fontFamily: 'Barlow Condensed,sans-serif', fontSize: 18, fontWeight: 800, color: 'var(--text3)' }}>{MEDALS[i] || i + 1}</td>
                          <td><strong style={{ color: 'var(--text)' }}>{r.funcionarios?.nome}</strong></td>
                          <td>{fmtNum(r.quantidade)} un.</td>
                          <td style={{ color: r.aproveitado != null ? 'var(--green)' : 'var(--text3)' }}>{r.aproveitado != null ? fmtNum(r.aproveitado) + ' un.' : '—'}</td>
                          <td style={{ color: r.perda > 0 ? 'var(--red)' : 'var(--text3)' }}>{r.perda != null ? fmtNum(r.perda) + ' un.' : '—'}</td>
                          <td><span style={{ fontWeight: 700, color: r.taxa != null ? (r.taxa >= 90 ? 'var(--green)' : r.taxa >= 70 ? 'var(--amber)' : 'var(--red)') : 'var(--text3)' }}>{r.taxa != null ? r.taxa + '%' : '—'}</span></td>
                          <td style={{ color: 'var(--green)' }}>{fmtMoeda(Number(r.valor))}</td>
                          <td><span style={{ color: corPct(pct), fontWeight: 700 }}>{pct}%</span></td>
                          <td style={{ color: 'var(--text3)' }}>{r.obs || '—'}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 5 }}>
                              <button className="btn btn-secondary btn-xs" onClick={() => handleEditar(r)}>✏️</button>
                              <button className="btn btn-danger btn-xs" onClick={() => setExcluindo(r)}>🗑</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
        }
      </div>

      {/* Modal Editar */}
      {editando && (
        <Modal title="Editar Registro" onClose={() => setEditando(null)}>
          <div className="fgrid">
            <div className="fg"><label>Funcionário</label><input value={editando.func_nome || ''} readOnly /></div>
            <div className="fg"><label>Data</label><input type="date" value={editando.data} max={hoje} onChange={e => setEditando(v => ({ ...v, data: e.target.value }))} /></div>
            <div className="fg"><label>Qtd. Produzida</label><input type="number" min="0" value={editando.quantidade} onChange={e => setEditando(v => ({ ...v, quantidade: e.target.value }))} /></div>
            <div className="fg"><label>Valor (auto)</label><input value={fmtMoeda(calcValor(parseInt(editando.aproveitado) || parseInt(editando.quantidade) || 0, valorMil))} readOnly /></div>
            <div className="fg"><label>Qtd. Aproveitada</label><input type="number" min="0" placeholder="Opcional" value={editando.aproveitado || ''} onChange={e => setEditando(v => ({ ...v, aproveitado: e.target.value }))} /></div>
            <div className="fg"><label>Taxa</label><input value={editando.aproveitado && editando.quantidade ? Math.round(editando.aproveitado / editando.quantidade * 100) + '%' : '—'} readOnly /></div>
          </div>
          <div className="fg"><label>Observação</label><input value={editando.obs || ''} onChange={e => setEditando(v => ({ ...v, obs: e.target.value }))} /></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={handleSalvarEdicao}>Salvar</button>
            <button className="btn btn-secondary" onClick={() => setEditando(null)}>Cancelar</button>
          </div>
        </Modal>
      )}

      {/* Confirm Excluir */}
      {excluindo && (
        <ConfirmModal
          title="Excluir registro?"
          onConfirm={handleExcluir}
          onCancel={() => setExcluindo(null)}
          details={[
            ['Funcionário', excluindo.funcionarios?.nome],
            ['Data', fmtData(excluindo.data)],
            ['Quantidade', fmtNum(excluindo.quantidade) + ' un.'],
            ['Valor', fmtMoeda(Number(excluindo.valor))],
          ]}
        />
      )}
    </div>
  )
}
