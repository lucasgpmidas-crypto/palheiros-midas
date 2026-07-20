import { useState } from 'react'
import { useConfig } from '../lib/hooks'
import { fmtMoeda, fmtNum } from '../lib/utils'
import toast from 'react-hot-toast'

export default function Configuracoes() {
  const { valorMil, uniDisplay, uniMaco, tolerancia, salvarValorMil, salvarConfig } = useConfig()
  const [novoValor, setNovoValor] = useState('')
  const [saving, setSaving] = useState(false)
  const [emb, setEmb] = useState({ display: '', maco: '', tol: '' })
  const [savingEmb, setSavingEmb] = useState(false)

  const handleSalvar = async () => {
    const v = parseFloat(novoValor)
    if (!v || v <= 0) { toast.error('Informe um valor válido'); return }
    setSaving(true)
    await salvarValorMil(v)
    setNovoValor('')
    setSaving(false)
  }

  const handleSalvarEmb = async () => {
    const itens = [
      ['uni_display', parseInt(emb.display)],
      ['uni_maco', parseInt(emb.maco)],
      ['tolerancia_conf', parseFloat(emb.tol)],
    ].filter(([, v]) => v > 0)
    if (!itens.length) { toast.error('Preencha ao menos um campo com valor válido'); return }
    setSavingEmb(true)
    for (const [chave, v] of itens) await salvarConfig(chave, v)
    setEmb({ display: '', maco: '', tol: '' })
    setSavingEmb(false)
    toast.success('Configurações da conferência salvas!')
  }

  return (
    <div>
      <div className="card mb16">
        <div className="card-title">💰 Valor por 1.000 Unidades</div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="fg" style={{ margin: 0 }}>
            <label>Valor Atual</label>
            <input value={fmtMoeda(valorMil)} readOnly style={{ width: 160, opacity: .7, fontWeight: 700, color: 'var(--gold-light)' }} />
          </div>
          <div className="fg" style={{ margin: 0 }}>
            <label>Novo Valor (R$)</label>
            <input type="number" min="1" step="0.01" placeholder={String(valorMil)} value={novoValor} onChange={e => setNovoValor(e.target.value)} style={{ width: 160 }} />
          </div>
          <button className="btn btn-primary" onClick={handleSalvar} disabled={saving || !novoValor}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
        {novoValor && (
          <div style={{ marginTop: 14, background: 'var(--bg3)', borderRadius: 'var(--rs)', padding: '10px 14px' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Prévia com novo valor</div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13 }}>
              {[1000, 3000, 5000].map(q => (
                <span key={q}>
                  <span style={{ color: 'var(--text3)' }}>{fmtNum(q)} un. = </span>
                  <strong style={{ color: 'var(--green)' }}>{fmtMoeda((parseFloat(novoValor) || 0) * q / 1000)}</strong>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card mb16">
        <div className="card-title">📦 Embalagem & Conferência</div>
        <div style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 14 }}>
          Usado na conferência automática: Diferença = Produzido − Perda − (displays × un. + maços × un.)
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="fg" style={{ margin: 0 }}>
            <label>Un. por Display (atual: {fmtNum(uniDisplay)})</label>
            <input type="number" min="1" placeholder={String(uniDisplay)} value={emb.display} onChange={e => setEmb(v => ({ ...v, display: e.target.value }))} style={{ width: 160 }} />
          </div>
          <div className="fg" style={{ margin: 0 }}>
            <label>Un. por Maço (atual: {fmtNum(uniMaco)})</label>
            <input type="number" min="1" placeholder={String(uniMaco)} value={emb.maco} onChange={e => setEmb(v => ({ ...v, maco: e.target.value }))} style={{ width: 160 }} />
          </div>
          <div className="fg" style={{ margin: 0 }}>
            <label>Tolerância % (atual: {tolerancia}%)</label>
            <input type="number" min="0" step="0.5" placeholder={String(tolerancia)} value={emb.tol} onChange={e => setEmb(v => ({ ...v, tol: e.target.value }))} style={{ width: 160 }} />
          </div>
          <button className="btn btn-primary" onClick={handleSalvarEmb} disabled={savingEmb || (!emb.display && !emb.maco && !emb.tol)}>
            {savingEmb ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      <div className="card mb16">
        <div className="card-title">👤 Administradores</div>
        <div className="alert a-success" style={{ marginBottom: 12 }}>
          <div>
            <strong>Acesso simultâneo de qualquer lugar</strong>
            <span>Você (Orlândia) e o líder (Barretos) podem usar ao mesmo tempo com os mesmos dados em tempo real.</span>
          </div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>Para adicionar ou remover administradores, acesse o painel do Supabase:</div>
        <a href="https://app.supabase.com" target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ display: 'inline-flex' }}>
          🔗 Abrir Painel Supabase → Authentication → Users
        </a>
      </div>

      <div className="card">
        <div className="card-title">ℹ️ Sobre o Sistema</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
          {[
            ['Sistema', 'Palheiros Midas v1.0'],
            ['Banco de Dados', 'Supabase (PostgreSQL)'],
            ['Hospedagem', 'Vercel (gratuito)'],
            ['Acesso', 'Qualquer navegador, qualquer lugar'],
            ['Admins', 'Você + Líder de Barretos'],
            ['Funcionários', 'Login via PIN de 4 dígitos'],
          ].map(([k, v]) => (
            <div key={k} style={{ background: 'var(--bg3)', borderRadius: 'var(--rs)', padding: '10px 14px' }}>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>{k}</div>
              <div style={{ fontWeight: 600 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
