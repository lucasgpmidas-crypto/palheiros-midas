import { useState, useEffect, useMemo } from 'react'
import { useExpedicoes, useConfig } from '../lib/hooks'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { getHoje, fmtNum, fmtData, exportCSV } from '../lib/utils'
import Modal from '../components/Modal'
import ConfirmModal from '../components/ConfirmModal'
import toast from 'react-hot-toast'

const TIPOS = ['Original', 'Menta', 'Ouro', 'Outro']
const FORM0 = { data: getHoje(), tipo: 'Original', displays: '', obs: '' }

export default function Estoque() {
  const hoje = getHoje()
  const { session } = useAuth()
  const { uniDisplay } = useConfig()
  const { expedicoes, loading, registrar, atualizar, excluir } = useExpedicoes()

  const [form, setForm] = useState(FORM0)
  const [saving, setSaving] = useState(false)
  const [editando, setEditando] = useState(null)
  const [excluindo, setExcluindo] = useState(null)

  // Entradas: displays registrados no empacotamento (Revisão & Empacote)
  const [empacotado, setEmpacotado] = useState([])
  useEffect(() => {
    supabase.from('controle_qualidade')
      .select('tipo, display')
      .not('display', 'is', null)
      .then(({ data }) => setEmpacotado(data || []))
  }, [])

  const admin = session?.user?.email?.split('@')[0] || 'Admin'

  const saldos = useMemo(() => {
    const porTipo = TIPOS.map(t => {
      const entrada = empacotado.filter(e => e.tipo === t).reduce((s, e) => s + (e.display || 0), 0)
      const saida = expedicoes.filter(x => x.tipo === t).reduce((s, x) => s + (x.displays || 0), 0)
      return { tipo: t, entrada, saida, saldo: entrada - saida }
    })
    const total = porTipo.reduce((s, x) => s + x.saldo, 0)
    return { porTipo, total }
  }, [empacotado, expedicoes])

  const saldoTipoForm = saldos.porTipo.find(x => x.tipo === form.tipo)?.saldo ?? 0
  const dForm = parseInt(form.displays) || 0

  const handleRegistrar = async () => {
    if (!dForm || dForm <= 0) { toast.error('Informe a quantidade de displays'); return }
    if (form.data > hoje) { toast.error('Data não pode ser futura'); return }
    setSaving(true)
    const ok = await registrar({ data: form.data, tipo: form.tipo, displays: dForm, obs: form.obs || null, registrado_por: admin })
    if (ok) setForm({ ...FORM0, data: form.data })
    setSaving(false)
  }

  const handleSalvarEdicao = async () => {
    if (!editando) return
    const d = parseInt(editando.displays) || 0
    if (d <= 0) { toast.error('Informe a quantidade de displays'); return }
    const ok = await atualizar(editando.id, { data: editando.data, tipo: editando.tipo, displays: d, obs: editando.obs || null })
    if (ok) setEditando(null)
  }

  const totalExpedido = expedicoes.reduce((s, x) => s + (x.displays || 0), 0)
  const badgeTipo = (t) => ({ Original: 'b-blue', Menta: 'b-green', Ouro: 'b-gold', Outro: 'b-amber' }[t] || 'b-amber')
  const corSaldo = (s) => s > 0 ? 'var(--green)' : s < 0 ? 'var(--red)' : 'var(--text3)'

  const handleExportar = () => exportCSV(
    [['Data', 'Tipo', 'Displays', 'Unidades', 'Registrado por', 'Obs.'],
      ...expedicoes.map(x => [fmtData(x.data), x.tipo, x.displays, x.displays * uniDisplay, x.registrado_por || '', x.obs || ''])],
    `expedicoes_${hoje}.csv`)

  return (
    <div>
      {/* Saldo em estoque */}
      <div className="stat-grid mb16">
        <div className="stat-card sc-gold">
          <div className="stat-label">📦 Estoque Total</div>
          <div className="stat-value sv-gold">{fmtNum(saldos.total)}</div>
          <div className="stat-sub">displays · ≈ {fmtNum(saldos.total * uniDisplay)} un.</div>
        </div>
        {saldos.porTipo.filter(x => x.entrada > 0 || x.saida > 0).map(x => (
          <div key={x.tipo} className="stat-card sc-blue">
            <div className="stat-label">{x.tipo}</div>
            <div className="stat-value" style={{ color: corSaldo(x.saldo) }}>{fmtNum(x.saldo)}</div>
            <div className="stat-sub">displays · entrou {fmtNum(x.entrada)} / saiu {fmtNum(x.saida)}</div>
          </div>
        ))}
      </div>

      {/* Registrar expedição */}
      <div className="card mb16">
        <div className="card-title">🚚 Registrar Expedição (saída para o distribuidor)</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="fg" style={{ margin: 0 }}>
            <label>Data</label>
            <input type="date" value={form.data} max={hoje} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} />
          </div>
          <div className="fg" style={{ margin: 0 }}>
            <label>Tipo</label>
            <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
              {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="fg" style={{ margin: 0, width: 150 }}>
            <label>Displays</label>
            <input type="number" min="1" placeholder="Ex: 50" value={form.displays} onChange={e => setForm(f => ({ ...f, displays: e.target.value }))} />
          </div>
          <div className="fg" style={{ margin: 0, flex: 1, minWidth: 160 }}>
            <label>Observação</label>
            <input value={form.obs} placeholder="Nota fiscal, ajuste de saldo..." onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} />
          </div>
          <button className="btn btn-primary" onClick={handleRegistrar} disabled={saving || !dForm} style={{ height: 40 }}>
            {saving ? '...' : '✓ Registrar'}
          </button>
        </div>
        {dForm > 0 && (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', background: 'var(--bg3)', borderRadius: 'var(--rs)', padding: '8px 14px', fontSize: 12.5, marginTop: 10 }}>
            <span style={{ color: 'var(--text3)' }}>Saída: <strong style={{ color: 'var(--text)' }}>{fmtNum(dForm)} displays</strong> = <strong style={{ color: 'var(--gold-light)' }}>{fmtNum(dForm * uniDisplay)} un.</strong></span>
            <span style={{ color: 'var(--text3)' }}>Saldo de {form.tipo} após a saída: <strong style={{ color: corSaldo(saldoTipoForm - dForm) }}>{fmtNum(saldoTipoForm - dForm)} displays</strong></span>
            {dForm > saldoTipoForm && <span style={{ color: 'var(--amber)', fontWeight: 700 }}>⚠ Maior que o saldo atual ({fmtNum(saldoTipoForm)})</span>}
          </div>
        )}
      </div>

      <div className="alert a-warn" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 17 }}>ℹ️</div>
        <div>
          <strong>Como o saldo é calculado</strong>
          <span>Entradas vêm automaticamente do empacotamento (Revisão & Empacote). Se o saldo inicial não bater com o estoque físico (displays expedidos antes deste controle existir), registre uma expedição com a observação "ajuste de saldo inicial".</span>
        </div>
      </div>

      {/* Histórico de expedições */}
      <div className="card">
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>📋 Histórico de Expedições</span>
          <button className="btn btn-secondary btn-sm" onClick={handleExportar} disabled={expedicoes.length === 0}>⬇ CSV</button>
        </div>
        {expedicoes.length > 0 && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            {[['Expedições', expedicoes.length, 'var(--text)'], ['Total expedido', fmtNum(totalExpedido) + ' displays', 'var(--gold-light)'], ['Em unidades', '≈ ' + fmtNum(totalExpedido * uniDisplay) + ' un.', 'var(--text)']].map(([l, v, c]) => (
              <div key={l} className="stats-chip"><span style={{ color: 'var(--text3)' }}>{l}: </span><strong style={{ color: c }}>{v}</strong></div>
            ))}
          </div>
        )}
        {loading ? <div className="loading"><div className="spin" /></div>
          : expedicoes.length === 0
            ? <div className="empty-state"><div className="es-icon">🚚</div><div className="es-text">Nenhuma expedição registrada ainda</div></div>
            : <div className="table-wrap"><table>
                <thead><tr><th>Data</th><th>Tipo</th><th>Displays</th><th>Unidades</th><th>Registrado por</th><th>Obs.</th><th>Ações</th></tr></thead>
                <tbody>{expedicoes.map(x => (
                  <tr key={x.id}>
                    <td>{fmtData(x.data)}</td>
                    <td><span className={`badge ${badgeTipo(x.tipo)}`}>{x.tipo}</span></td>
                    <td><strong style={{ color: 'var(--text)' }}>{fmtNum(x.displays)}</strong></td>
                    <td style={{ color: 'var(--text3)' }}>≈ {fmtNum(x.displays * uniDisplay)} un.</td>
                    <td style={{ color: 'var(--text3)' }}>{x.registrado_por || '—'}</td>
                    <td style={{ color: 'var(--text3)' }}>{x.obs || '—'}</td>
                    <td><div style={{ display: 'flex', gap: 5 }}>
                      <button className="btn btn-secondary btn-xs" onClick={() => setEditando({ ...x })}>✏️</button>
                      <button className="btn btn-danger btn-xs" onClick={() => setExcluindo(x)}>🗑</button>
                    </div></td>
                  </tr>
                ))}</tbody>
              </table></div>
        }
      </div>

      {/* Modal Editar */}
      {editando && (
        <Modal title="Editar Expedição" onClose={() => setEditando(null)} width={460}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="fg"><label>Data</label><input type="date" value={editando.data} max={hoje} onChange={e => setEditando(v => ({ ...v, data: e.target.value }))} /></div>
            <div className="fg"><label>Tipo</label><select value={editando.tipo} onChange={e => setEditando(v => ({ ...v, tipo: e.target.value }))}>{TIPOS.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
            <div className="fg"><label>Displays</label><input type="number" min="1" value={editando.displays} onChange={e => setEditando(v => ({ ...v, displays: e.target.value }))} /></div>
            <div className="fg"><label>Unidades (auto)</label><input value={fmtNum((parseInt(editando.displays) || 0) * uniDisplay)} readOnly /></div>
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
          title="Excluir expedição?"
          onConfirm={async () => { await excluir(excluindo.id); setExcluindo(null) }}
          onCancel={() => setExcluindo(null)}
          details={[
            ['Data', fmtData(excluindo.data)],
            ['Tipo', excluindo.tipo],
            ['Displays', fmtNum(excluindo.displays)],
          ]}
        />
      )}
    </div>
  )
}
