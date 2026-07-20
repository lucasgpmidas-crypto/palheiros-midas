import { useState } from 'react'
import { useFuncionarios } from '../lib/hooks'
import { fmtData, fmtNum, getHoje } from '../lib/utils'
import Modal from '../components/Modal'
import toast from 'react-hot-toast'

const FORM0 = { nome: '', entrada: getHoje(), meta_diaria: 3000, situacao: 'ativo', setor: 'producao', pin: '', obs: '' }

export default function Funcionarios() {
  const { funcionarios, loading, salvar } = useFuncionarios()
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(FORM0)
  const [saving, setSaving] = useState(false)
  const [busca, setBusca] = useState('')

  const lista = funcionarios.filter(f => f.nome.toLowerCase().includes(busca.toLowerCase()))
  const ativos = funcionarios.filter(f => f.situacao === 'ativo').length

  const abrirNovo = () => { setEditId(null); setForm(FORM0); setModal(true) }
  const abrirEditar = (f) => {
    setEditId(f.id)
    setForm({ nome: f.nome, entrada: f.entrada, meta_diaria: f.meta_diaria, situacao: f.situacao, setor: f.setor || 'producao', pin: '', obs: f.obs || '' })
    setModal(true)
  }

  const handleSalvar = async () => {
    if (!form.nome.trim()) { toast.error('Informe o nome'); return }
    setSaving(true)
    const payload = { nome: form.nome.trim(), entrada: form.entrada, meta_diaria: Math.max(1, Number(form.meta_diaria) || 3000), situacao: form.situacao, setor: form.setor, obs: form.obs || null }
    if (form.pin) payload.pin = form.pin
    const ok = await salvar(payload, editId)
    if (ok) setModal(false)
    setSaving(false)
  }

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="stats-chip"><span style={{ color: 'var(--text3)' }}>Ativos: </span><strong style={{ color: 'var(--green)' }}>{ativos}</strong></div>
          <div className="stats-chip"><span style={{ color: 'var(--text3)' }}>Total: </span><strong>{funcionarios.length}</strong></div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input placeholder="🔍 Buscar..." value={busca} onChange={e => setBusca(e.target.value)}
            style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--rs)', padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none', width: 190 }} />
          <button className="btn btn-primary" onClick={abrirNovo}>+ Novo Funcionário</button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">👥 Enroladores Cadastrados</div>
        {loading ? <div className="loading"><div className="spin" /></div>
          : lista.length === 0
            ? <div className="empty-state"><div className="es-icon">👥</div><div className="es-text">Nenhum funcionário encontrado</div></div>
            : <div className="table-wrap">
                <table>
                  <thead><tr><th>Nome</th><th>Entrada</th><th>Setor</th><th>Meta Diária</th><th>PIN</th><th>Situação</th><th>Observações</th><th>Ações</th></tr></thead>
                  <tbody>
                    {lista.map(f => (
                      <tr key={f.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: 'var(--text2)', flexShrink: 0 }}>
                              {f.nome.split(' ').slice(0, 2).map(x => x[0]).join('')}
                            </div>
                            <strong style={{ color: 'var(--text)' }}>{f.nome}</strong>
                          </div>
                        </td>
                        <td>{fmtData(f.entrada)}</td>
                        <td><span className={`badge ${(f.setor || 'producao') === 'finalizacao' ? 'b-blue' : 'b-gold'}`}>{(f.setor || 'producao') === 'finalizacao' ? '📦 Finalização' : '🌾 Produção'}</span></td>
                        <td><span style={{ color: 'var(--gold-light)', fontWeight: 700 }}>{fmtNum(f.meta_diaria)} un.</span></td>
                        <td><span className={`badge ${f.pin ? 'b-green' : 'b-red'}`}>{f.pin ? '✓ Configurado' : 'Sem PIN'}</span></td>
                        <td><span className={`badge ${f.situacao === 'ativo' ? 'b-green' : 'b-red'}`}>{f.situacao}</span></td>
                        <td style={{ color: 'var(--text3)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.obs || '—'}</td>
                        <td><button className="btn btn-secondary btn-sm" onClick={() => abrirEditar(f)}>✏️ Editar</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
        }
      </div>

      {modal && (
        <Modal title={editId ? 'Editar Funcionário' : 'Novo Funcionário'} onClose={() => setModal(false)}>
          <div className="fgrid">
            <div className="fg"><label>Nome Completo *</label><input value={form.nome} onChange={e => setF('nome', e.target.value)} placeholder="Nome do enrolador" autoFocus /></div>
            <div className="fg"><label>Data de Entrada</label><input type="date" value={form.entrada} onChange={e => setF('entrada', e.target.value)} /></div>
            <div className="fg"><label>Meta Diária (un.)</label><input type="number" min="1" value={form.meta_diaria} onChange={e => setF('meta_diaria', e.target.value)} /></div>
            <div className="fg"><label>Situação</label>
              <select value={form.situacao} onChange={e => setF('situacao', e.target.value)}>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </div>
            <div className="fg"><label>Setor</label>
              <select value={form.setor} onChange={e => setF('setor', e.target.value)}>
                <option value="producao">🌾 Produção (enrolador)</option>
                <option value="finalizacao">📦 Finalização (revisa/empacota)</option>
              </select>
            </div>
          </div>
          <div className="fg" style={{ background: 'rgba(201,162,39,.06)', border: '1px solid rgba(201,162,39,.2)', borderRadius: 'var(--rs)', padding: 12 }}>
            <label style={{ color: 'var(--gold-light)' }}>🔑 PIN de Acesso (4 dígitos)</label>
            <input type="password" maxLength={4} inputMode="numeric" placeholder={editId ? 'Deixe em branco para não alterar' : 'Ex: 1234'} value={form.pin} onChange={e => setF('pin', e.target.value)} style={{ width: 160, letterSpacing: 6, fontSize: 18, textAlign: 'center' }} />
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>O funcionário usa este PIN para acessar o sistema</div>
          </div>
          <div className="fg"><label>Observações</label><textarea value={form.obs} onChange={e => setF('obs', e.target.value)} placeholder="Observações..." /></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={handleSalvar} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
            <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
