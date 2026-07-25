import { useState } from 'react'
import { useConfig } from '../lib/hooks'
import { fmtMoeda, fmtNum } from '../lib/utils'
import toast from 'react-hot-toast'

const PC_CAMPOS = [
  ['faixa_min_inter', 'faixaMinInter', 'Faixa Intermediária a partir de (milheiros)'],
  ['faixa_min_prem',  'faixaMinPrem',  'Faixa Premium a partir de (milheiros)'],
  ['faixa_cp_base',   'faixaCpBase',   'CP — Base (R$/milheiro)'],
  ['faixa_cp_inter',  'faixaCpInter',  'CP — Intermediária (R$/milheiro)'],
  ['faixa_cp_prem',   'faixaCpPrem',   'CP — Premium (R$/milheiro)'],
  ['faixa_ext_base',  'faixaExtBase',  'Externo — Base (R$/milheiro)'],
  ['faixa_ext_inter', 'faixaExtInter', 'Externo — Intermediária (R$/milheiro)'],
  ['faixa_ext_prem',  'faixaExtPrem',  'Externo — Premium (R$/milheiro)'],
  ['qual_premium',    'qualPremium',   'Qualidade p/ preço integral (%)'],
  ['qual_minima',     'qualMinima',    'Qualidade mínima — abaixo vai p/ Base (%)'],
  ['ajuda_custo_dia', 'ajudaCustoDia', 'Ajuda de custo CP (R$/dia com entrega)'],
]

// Prêmios: qualificação (6 quinzenas em 3 etapas) + anuais
const PM_CAMPOS = [
  ['qualif_vol1',         'qualifVol1',         'Qualif. 1ª e 2ª quinzena — volume (milheiros)'],
  ['qualif_qual1',        'qualifQual1',        'Qualif. 1ª e 2ª quinzena — qualidade (%)'],
  ['qualif_vol2',         'qualifVol2',         'Qualif. 3ª e 4ª quinzena — volume (milheiros)'],
  ['qualif_qual2',        'qualifQual2',        'Qualif. 3ª e 4ª quinzena — qualidade (%)'],
  ['qualif_vol3',         'qualifVol3',         'Qualif. 5ª e 6ª quinzena — volume (milheiros)'],
  ['qualif_qual3',        'qualifQual3',        'Qualif. 5ª e 6ª quinzena — qualidade (%)'],
  ['premio_qualificacao', 'premioQualificacao', 'Prêmio de Qualificação (R$)'],
  ['premio_padrinho',     'premioPadrinho',     'Prêmio de Padrinho (R$)'],
  ['premio_prod_v1',      'premioProdV1',       'Anual 1ª faixa — volume no ano (milheiros)'],
  ['premio_prod_p1',      'premioProdP1',       'Anual 1ª faixa — prêmio (R$)'],
  ['premio_prod_v2',      'premioProdV2',       'Anual 2ª faixa — volume no ano (milheiros)'],
  ['premio_prod_p2',      'premioProdP2',       'Anual 2ª faixa — prêmio (R$)'],
  ['premio_prod_v3',      'premioProdV3',       'Anual 3ª faixa — volume no ano (milheiros)'],
  ['premio_prod_p3',      'premioProdP3',       'Anual 3ª faixa — prêmio (R$)'],
  ['premio_fid_min',      'premioFidMin',       'Fidelidade — volume mínimo no ano (milheiros)'],
  ['premio_qual_anual',   'premioQualAnual',    'Prêmio de Qualidade Anual (R$)'],
  ['premio_qual_min',     'premioQualMin',      'Qualidade Anual — volume mínimo (milheiros)'],
]

export default function Configuracoes() {
  const cfg = useConfig()
  const { valorMil, uniDisplay, uniMaco, tolerancia, quinzenaD1, quinzenaD2, diasSemRevisao, estoqueMinimo, salvarValorMil, salvarConfig } = cfg
  const [novoValor, setNovoValor] = useState('')
  const [saving, setSaving] = useState(false)
  const [emb, setEmb] = useState({ display: '', maco: '', tol: '' })
  const [savingEmb, setSavingEmb] = useState(false)
  const [qz, setQz] = useState({ d1: '', d2: '' })
  const [savingQz, setSavingQz] = useState(false)
  const [al, setAl] = useState({ dias: '', minimo: '' })
  const [savingAl, setSavingAl] = useState(false)
  const [pc, setPc] = useState({})
  const [savingPc, setSavingPc] = useState(false)
  const [pm, setPm] = useState({})
  const [savingPm, setSavingPm] = useState(false)

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

  const handleSalvarQz = async () => {
    const d1 = parseInt(qz.d1) || quinzenaD1
    const d2 = parseInt(qz.d2) || quinzenaD2
    if (d1 < 1 || d1 > 28 || d2 < 1 || d2 > 28) { toast.error('Use dias entre 1 e 28'); return }
    if (d2 <= d1) { toast.error('O início da 2ª quinzena deve ser depois do início da 1ª'); return }
    setSavingQz(true)
    if (parseInt(qz.d1)) await salvarConfig('quinzena_d1', d1)
    if (parseInt(qz.d2)) await salvarConfig('quinzena_d2', d2)
    setQz({ d1: '', d2: '' })
    setSavingQz(false)
    toast.success('Quinzena de pagamento salva!')
  }

  const handleSalvarAl = async () => {
    const dias = parseInt(al.dias)
    const minimo = parseInt(al.minimo)
    if (al.dias !== '' && (isNaN(dias) || dias < 1)) { toast.error('Dias sem revisão deve ser 1 ou mais'); return }
    if (al.minimo !== '' && (isNaN(minimo) || minimo < 0)) { toast.error('Estoque mínimo deve ser 0 ou mais'); return }
    setSavingAl(true)
    if (al.dias !== '') await salvarConfig('dias_sem_revisao', dias)
    if (al.minimo !== '') await salvarConfig('estoque_minimo', minimo)
    setAl({ dias: '', minimo: '' })
    setSavingAl(false)
    toast.success('Configurações de alertas salvas!')
  }

  const handleSalvarPc = async () => {
    const itens = PC_CAMPOS.filter(([ch]) => pc[ch] !== undefined && pc[ch] !== '')
      .map(([ch]) => [ch, parseFloat(pc[ch])])
    if (!itens.length) { toast.error('Altere ao menos um campo'); return }
    if (itens.some(([, v]) => isNaN(v) || v < 0)) { toast.error('Use apenas números válidos'); return }
    const minInter = parseFloat(pc.faixa_min_inter) || cfg.faixaMinInter
    const minPrem  = parseFloat(pc.faixa_min_prem) || cfg.faixaMinPrem
    if (minPrem <= minInter) { toast.error('A faixa Premium deve começar depois da Intermediária'); return }
    setSavingPc(true)
    for (const [chave, v] of itens) await salvarConfig(chave, v)
    setPc({})
    setSavingPc(false)
    toast.success('Programa de Parceria atualizado! Vale a partir de agora — comunique os parceiros com antecedência.')
  }

  const handleSalvarPm = async () => {
    const itens = PM_CAMPOS.filter(([ch]) => pm[ch] !== undefined && pm[ch] !== '')
      .map(([ch]) => [ch, parseFloat(pm[ch])])
    if (!itens.length) { toast.error('Altere ao menos um campo'); return }
    if (itens.some(([, v]) => isNaN(v) || v < 0)) { toast.error('Use apenas números válidos'); return }
    setSavingPm(true)
    for (const [chave, v] of itens) await salvarConfig(chave, v)
    setPm({})
    setSavingPm(false)
    toast.success('Prêmios do programa atualizados!')
  }

  const pvD1 = parseInt(qz.d1) || quinzenaD1
  const pvD2 = parseInt(qz.d2) || quinzenaD2

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
        <div className="card-title">🗓 Quinzena de Pagamento</div>
        <div style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 14 }}>
          Define o período que o funcionário vê como "quinzena atual" e os botões de quinzena da Folha de Pagamento.
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="fg" style={{ margin: 0 }}>
            <label>Dia que abre a 1ª quinzena (atual: {quinzenaD1})</label>
            <input type="number" min="1" max="28" placeholder={String(quinzenaD1)} value={qz.d1} onChange={e => setQz(v => ({ ...v, d1: e.target.value }))} style={{ width: 160 }} />
          </div>
          <div className="fg" style={{ margin: 0 }}>
            <label>Dia que abre a 2ª quinzena (atual: {quinzenaD2})</label>
            <input type="number" min="1" max="28" placeholder={String(quinzenaD2)} value={qz.d2} onChange={e => setQz(v => ({ ...v, d2: e.target.value }))} style={{ width: 160 }} />
          </div>
          <button className="btn btn-primary" onClick={handleSalvarQz} disabled={savingQz || (!qz.d1 && !qz.d2)}>
            {savingQz ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
        <div style={{ marginTop: 14, background: 'var(--bg3)', borderRadius: 'var(--rs)', padding: '10px 14px', fontSize: 13 }}>
          <span style={{ color: 'var(--text3)' }}>Períodos resultantes: </span>
          <strong style={{ color: 'var(--gold-light)' }}>1ª quinzena: dia {pvD1} a {pvD2 - 1}</strong>
          <span style={{ color: 'var(--text3)' }}> · </span>
          <strong style={{ color: 'var(--gold-light)' }}>2ª quinzena: dia {pvD2} ao dia {pvD1 - 1} do mês seguinte</strong>
        </div>
      </div>

      <div className="card mb16">
        <div className="card-title">🤝 Programa de Parceria — Faixas Quinzenais</div>
        <div style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 14 }}>
          O preço do milheiro é definido pelo volume conferido na quinzena e vale para toda ela.
          Qualidade (conferido ÷ entregue) abaixo de {cfg.qualPremium}% derruba o preço uma faixa; abaixo de {cfg.qualMinima}% vai para a Base.
          A tabela fica visível para todos os parceiros no app.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
          {PC_CAMPOS.map(([chave, key, label]) => (
            <div className="fg" key={chave} style={{ margin: 0 }}>
              <label>{label} (atual: {cfg[key]})</label>
              <input type="number" min="0" step="0.5" placeholder={String(cfg[key])} value={pc[chave] ?? ''}
                onChange={e => setPc(v => ({ ...v, [chave]: e.target.value }))} />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={handleSalvarPc} disabled={savingPc || !Object.values(pc).some(v => v !== '')}>
            {savingPc ? 'Salvando...' : 'Salvar Programa'}
          </button>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>
            Faixas atuais: Base até {cfg.faixaMinInter - 1} mil · Intermediária {cfg.faixaMinInter}–{cfg.faixaMinPrem - 1} mil · Premium {cfg.faixaMinPrem}+ mil
          </span>
        </div>
      </div>

      <div className="card mb16">
        <div className="card-title">🏅 Prêmios do Programa</div>
        <div style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 14 }}>
          Qualificação: o parceiro novo precisa cumprir volume <strong>e</strong> qualidade nas 6 primeiras quinzenas — falhou uma, não recebe.
          Prêmios anuais são apurados pelo aprovado no ano e concedidos na tela <strong>Prêmios</strong>; a fidelidade vale o faturamento do ano ÷ 24 × 2.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
          {PM_CAMPOS.map(([chave, key, label]) => (
            <div className="fg" key={chave} style={{ margin: 0 }}>
              <label>{label} (atual: {cfg[key]})</label>
              <input type="number" min="0" step="1" placeholder={String(cfg[key])} value={pm[chave] ?? ''}
                onChange={e => setPm(v => ({ ...v, [chave]: e.target.value }))} />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14 }}>
          <button className="btn btn-primary" onClick={handleSalvarPm} disabled={savingPm || !Object.values(pm).some(v => v !== '')}>
            {savingPm ? 'Salvando...' : 'Salvar Prêmios'}
          </button>
        </div>
      </div>

      <div className="card mb16">
        <div className="card-title">🔔 Alertas Proativos</div>
        <div style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 14 }}>
          O sistema avisa quando a produção declarada em Barretos não aparece na revisão de Orlândia dentro do prazo, e quando o estoque de displays fica abaixo do mínimo (0 = desativado).
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="fg" style={{ margin: 0 }}>
            <label>Dias até alertar produção sem revisão (atual: {diasSemRevisao})</label>
            <input type="number" min="1" placeholder={String(diasSemRevisao)} value={al.dias} onChange={e => setAl(v => ({ ...v, dias: e.target.value }))} style={{ width: 160 }} />
          </div>
          <div className="fg" style={{ margin: 0 }}>
            <label>Estoque mínimo em displays (atual: {fmtNum(estoqueMinimo)})</label>
            <input type="number" min="0" placeholder={String(estoqueMinimo)} value={al.minimo} onChange={e => setAl(v => ({ ...v, minimo: e.target.value }))} style={{ width: 160 }} />
          </div>
          <button className="btn btn-primary" onClick={handleSalvarAl} disabled={savingAl || (al.dias === '' && al.minimo === '')}>
            {savingAl ? 'Salvando...' : 'Salvar'}
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
