import { fmtMoeda, fmtMilheiros, corQualidade, getFaixasProdutividade } from '../../lib/utils'

// Qualificacao (as 6 primeiras quinzenas) e o acumulado do ano.
export default function PremiosPrograma({ meuPremio, meusPremios, cfg, anoAtual }) {
  const { qualif, anual } = meuPremio
  const faixasProd = getFaixasProdutividade(cfg)
  const atingida = faixasProd.find(fx => anual.milheiros >= fx.min)
  const proximaProd = [...faixasProd].reverse().find(fx => anual.milheiros < fx.min)
  const mostrarQualif = qualif.itens.length > 0 && (qualif.emAndamento || qualif.aprovado)
  return (
    <div className="card mb16">
      <div className="card-title">🏅 Meus Prêmios — {anoAtual}</div>

      {mostrarQualif && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12.5, color: 'var(--text2)', marginBottom: 8 }}>
            🎓 <strong>Prêmio de Qualificação</strong> — {fmtMoeda(cfg.premioQualificacao)} para quem cumpre volume e qualidade nas 6 primeiras quinzenas.
            {qualif.aprovado
              ? <span style={{ color: 'var(--green)', fontWeight: 700 }}> Você cumpriu as seis! 🎉</span>
              : <span style={{ color: 'var(--text3)' }}> Você já cumpriu {qualif.cumpridas} de 6.</span>}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {qualif.itens.map(item => {
              const cor = item.status === 'cumprida' ? 'var(--green)' : item.status === 'falhou' ? 'var(--red)' : 'var(--text3)'
              return (
                <div key={item.ordem} title={`Precisa de ${item.etapa.vol} milheiros e ${item.etapa.qual}% de qualidade`}
                  style={{ background: 'var(--bg3)', border: `1px solid ${cor}33`, borderRadius: 'var(--rs)', padding: '5px 8px', fontSize: 11.5 }}>
                  <span style={{ color: 'var(--text3)' }}>{item.ordem}ª </span>
                  <strong style={{ color: cor }}>
                    {item.status === 'cumprida' ? '✔' : item.status === 'falhou' ? '✕' : '⏳'} {fmtMilheiros(item.milheiros)} mil
                  </strong>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div className="stats-chip">Volume no ano: <strong style={{ color: 'var(--gold-light)' }}>&nbsp;{fmtMilheiros(anual.milheiros)} milheiros</strong></div>
        <div className="stats-chip">Qualidade do ano: <strong style={{ color: corQualidade(anual.qualidadeMedia, cfg) }}>&nbsp;{anual.qualidadeMedia == null ? '—' : anual.qualidadeMedia.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'}</strong></div>
        {atingida && <div className="stats-chip" style={{ borderColor: 'rgba(40,180,133,.45)' }}>Prêmio anual garantido: <strong style={{ color: 'var(--green)' }}>&nbsp;{fmtMoeda(atingida.valor)}</strong></div>}
      </div>

      {proximaProd && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text3)', marginBottom: 4, gap: 10, flexWrap: 'wrap' }}>
            <span>{fmtMilheiros(anual.milheiros)} de {fmtMilheiros(proximaProd.min)} milheiros no ano</span>
            <span>faltam <strong style={{ color: 'var(--gold-light)' }}>{fmtMilheiros(proximaProd.min - anual.milheiros)} milheiros</strong> para o prêmio de {fmtMoeda(proximaProd.valor)}</span>
          </div>
          <div className="pbar"><div className="pfill pf-gold" style={{ width: `${Math.min(100, anual.milheiros / proximaProd.min * 100)}%` }} /></div>
        </div>
      )}

      <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>
        ✨ Qualidade acima de {cfg.qualPremium}% em todas as quinzenas do ano (com {cfg.premioQualMin}+ milheiros) vale {fmtMoeda(cfg.premioQualAnual)} ·
        💛 {cfg.premioFidMin}+ milheiros no ano dão direito ao prêmio de fidelidade, equivalente a um mês médio de faturamento.
        Tudo conta pelo <strong>entregue na conferência</strong>.
      </div>

      {meusPremios.length > 0 && (
        <div style={{ marginTop: 12, background: 'var(--bg3)', borderRadius: 'var(--rs)', padding: '10px 14px', display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>Prêmios que já conquistei</div>
          {meusPremios.map(p => (
            <div key={p.id} style={{ fontSize: 13 }}>
              <strong style={{ color: 'var(--gold-light)' }}>🏅 {p.obs || p.tipo}</strong>
              <span style={{ color: 'var(--text3)' }}> · {Number(p.valor) > 0 ? fmtMoeda(p.valor) : 'prêmio físico'} · </span>
              <strong style={{ color: p.status === 'pago' ? 'var(--green)' : 'var(--amber)' }}>{p.status === 'pago' ? 'pago' : 'a receber'}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
