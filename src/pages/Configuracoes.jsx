import { useState } from 'react'
import { useConfig } from '../lib/hooks'
import { fmtMoeda, fmtNum } from '../lib/utils'
import toast from 'react-hot-toast'

export default function Configuracoes() {
  const { valorMil, salvarValorMil } = useConfig()
  const [novoValor, setNovoValor] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSalvar = async () => {
    const v = parseFloat(novoValor)
    if (!v || v <= 0) { toast.error('Informe um valor válido'); return }
    setSaving(true)
    await salvarValorMil(v)
    setNovoValor('')
    setSaving(false)
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
