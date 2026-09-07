import { fmtMoeda, fmtNum, fmtData, fmtMilheiros, corQualidade } from '../../lib/utils'

// A quinzena do Programa de Parceria com a conta aberta: faixa de preco,
// trava de qualidade, memoria de calculo e a tabela de precos da modalidade.
export default function ParceriaQuinzena({ parceria, qz, modalidade, cfg, difDeclaradoQz, declaradoConfQz, entregueQz, diasEntregaQz, ajudaQz, totalQzReceber, aguardandoQz }) {
  const { milheiros, qualidade, faixaVolume, faixaEfetiva, travada, preco, valor, proxima, faixas } = parceria
  const qualStr = qualidade == null ? null : qualidade.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
  return (
    <div className="card mb16">
      <div className="card-title">🤝 Minha Parceria — Quinzena {fmtData(qz.inicio, 'dd/MM')} a {fmtData(qz.fim, 'dd/MM')}</div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div className="stats-chip">{modalidade === 'externo' ? '🏠 Parceiro Externo' : '🏭 Parceiro CP Barretos'}</div>
        <div className="stats-chip" style={{ borderColor: 'rgba(201,162,39,.45)' }}>
          Faixa: <strong style={{ color: 'var(--gold-light)' }}>&nbsp;{faixaEfetiva.nome} · {fmtMoeda(preco)}/milheiro</strong>
        </div>
        <div className="stats-chip">
          Qualidade: <strong style={{ color: corQualidade(qualidade, cfg) }}>&nbsp;{qualStr == null ? 'aguardando conferência' : qualStr + '%'}</strong>
        </div>
      </div>

      {/* Progresso até a próxima faixa (pelo volume) */}
      {proxima ? (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
            <span>{fmtMilheiros(milheiros)} de {fmtMilheiros(proxima.min)} milheiros</span>
            <span>faltam <strong style={{ color: 'var(--gold-light)' }}>{fmtMilheiros(proxima.faltam)} milheiros</strong> para a faixa {proxima.nome} ({fmtMoeda(proxima.preco)}/mil)</span>
          </div>
          <div className="pbar"><div className="pfill pf-gold" style={{ width: `${Math.min(100, milheiros / proxima.min * 100)}%` }} /></div>
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: 'var(--green)', marginBottom: 12 }}>🏆 Você está na faixa máxima ({faixaVolume.nome})!</div>
      )}

      {/* Avisos de qualidade — por que o preço está onde está */}
      {travada && (
        <div style={{ fontSize: 12.5, color: 'var(--amber)', background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.25)', borderRadius: 'var(--rs)', padding: '8px 12px', marginBottom: 12 }}>
          ⚠️ Pelo volume você alcançou a faixa <strong>{faixaVolume.nome}</strong>, mas a qualidade de {qualStr}% está segurando seu preço em <strong>{faixaEfetiva.nome} ({fmtMoeda(preco)}/mil)</strong>.
          Qualidade de {cfg.qualPremium}% ou mais garante o preço integral da faixa.
        </div>
      )}

      {/* Memória de cálculo — nenhum número sem a conta do lado */}
      <div style={{ background: 'var(--bg3)', borderRadius: 'var(--rs)', padding: '10px 14px', fontSize: 13, display: 'grid', gap: 6 }}>
        <div>
          <span style={{ color: 'var(--text3)' }}>Produção conferida: </span>
          <strong>{fmtMilheiros(milheiros)} milheiros × {fmtMoeda(preco)} = </strong>
          <strong style={{ color: 'var(--green)' }}>{fmtMoeda(valor)}</strong>
        </div>
        {difDeclaradoQz > 0 && (
          <div style={{ fontSize: 12 }}>
            <span style={{ color: 'var(--text3)' }}>Declarado nos dias já conferidos: </span>
            <strong>{fmtNum(declaradoConfQz)} un.</strong>
            <span style={{ color: 'var(--text3)' }}> · chegou na conferência: </span>
            <strong>{fmtNum(entregueQz)} un.</strong>
            <span style={{ color: 'var(--text3)' }}> · diferença: </span>
            <strong style={{ color: 'var(--red)' }}>{fmtNum(difDeclaradoQz)} un. não pagas</strong>
            <span style={{ color: 'var(--text3)' }}> (declarado que não chegou — o descarte da revisão continua sendo pago)</span>
          </div>
        )}
        {modalidade === 'cp' && (
          <div>
            <span style={{ color: 'var(--text3)' }}>Ajuda de custo: </span>
            <strong>{diasEntregaQz} {diasEntregaQz === 1 ? 'dia' : 'dias'} com entrega × {fmtMoeda(cfg.ajudaCustoDia)} = </strong>
            <strong style={{ color: 'var(--green)' }}>{fmtMoeda(ajudaQz)}</strong>
          </div>
        )}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6 }}>
          <span style={{ color: 'var(--text3)' }}>Total da quinzena até agora: </span>
          <strong style={{ color: 'var(--green)', fontSize: 15 }}>{fmtMoeda(totalQzReceber)}</strong>
        </div>
        {aguardandoQz > 0 && (
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>
            ⏳ Mais {fmtNum(aguardandoQz)} un. declaradas aguardam conferência — o que chegar lá entra na conta (e pode subir sua faixa).
          </div>
        )}
      </div>

      {/* Tabela de preços do programa — sempre visível para todos */}
      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: 'pointer', fontSize: 12.5, color: 'var(--gold-light)', fontWeight: 600 }}>📋 Ver tabela de preços da minha modalidade</summary>
        <div className="table-wrap" style={{ marginTop: 8 }}><table>
          <thead><tr><th>Faixa</th><th>Volume na quinzena</th><th>Preço por milheiro</th></tr></thead>
          <tbody>
            {faixas.map((fx, i) => (
              <tr key={fx.nome} style={fx.nome === faixaEfetiva.nome ? { background: 'rgba(201,162,39,.07)' } : {}}>
                <td><strong style={{ color: fx.nome === faixaEfetiva.nome ? 'var(--gold-light)' : 'var(--text)' }}>{fx.nome}{fx.nome === faixaEfetiva.nome ? ' ← você' : ''}</strong></td>
                <td>{i === 0 ? `até ${fmtMilheiros(faixas[1].min - 1)}` : i < faixas.length - 1 ? `${fmtMilheiros(fx.min)} a ${fmtMilheiros(faixas[i + 1].min - 1)}` : `${fmtMilheiros(fx.min)} ou mais`} milheiros</td>
                <td style={{ color: 'var(--green)', fontWeight: 700 }}>{fmtMoeda(fx.preco)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 6 }}>
          Qualidade ≥ {cfg.qualPremium}%: preço integral da faixa · entre {cfg.qualMinima}% e {cfg.qualPremium}%: preço da faixa anterior · abaixo de {cfg.qualMinima}%: preço Base.
          A qualidade é o quanto da sua entrega passa na conferência. Cada quinzena começa do zero.
        </div>
      </details>
    </div>
  )
}
