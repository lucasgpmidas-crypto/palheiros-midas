import { useState, useMemo, useEffect } from 'react'
import { useFuncionarios, useConfig, useApuracaoPremios } from '../lib/hooks'
import { supabase } from '../lib/supabase'
import {
  fmtMoeda, fmtNum, fmtData, fmtMilheiros, corQualidade, exportCSV, exportXLSX,
} from '../lib/utils'

// Indicadores de acompanhamento do programa (item 9.1 do documento v3), todos
// apurados por quinzena sobre a mesma base do pagamento: o entregue na conferência.
const pct = (q) => q == null ? '—' : q.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'

function Card({ titulo, valor, sub, cor = 'var(--text)' }) {
  return (
    <div style={{ background: 'var(--bg3)', borderRadius: 'var(--rs)', padding: '12px 16px', flex: 1, minWidth: 170 }}>
      <div style={{ fontSize: 10.5, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{titulo}</div>
      <div style={{ fontSize: 25, fontWeight: 800, color: cor, fontFamily: 'Barlow Condensed,sans-serif', lineHeight: 1.1 }}>{valor}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

export default function Indicadores() {
  const cfg = useConfig()
  const { funcionarios } = useFuncionarios()
  const anoAtual = new Date().getFullYear()
  const [ano, setAno] = useState(anoAtual)
  const { linhas, quinzenasAno, loading } = useApuracaoPremios({ ano, funcionarios, cfg })

  // Dias com produção declarada — base da ajuda de custo do parceiro CP
  const [dias, setDias] = useState([])
  useEffect(() => {
    if (!quinzenasAno.length) return
    supabase.from('registros_producao')
      .select('func_id, data')
      .gte('data', quinzenasAno[0].inicio).lte('data', quinzenasAno[23].fim)
      .then(({ data }) => setDias(data || []))
  }, [quinzenasAno])

  // Uma linha por quinzena, com tudo o que o item 9.1 pede
  const porQuinzena = useMemo(() => quinzenasAno.map((q, i) => {
    const doPeriodo = linhas.map(l => ({ f: l.f, p: l.periodosAno[i] })).filter(x => x.p?.entregue > 0)
    const milheiros = doPeriodo.reduce((s, x) => s + x.p.milheiros, 0)
    const entregue = doPeriodo.reduce((s, x) => s + x.p.entregue, 0)
    const revisada = doPeriodo.reduce((s, x) => s + x.p.revisada, 0)
    const producao = doPeriodo.reduce((s, x) => s + x.p.valor, 0)
    const faixa = (nome) => doPeriodo.filter(x => x.p.faixaEfetiva.nome === nome).length
    const acima = doPeriodo.filter(x => x.p.qualidade >= cfg.qualPremium).length
    // Ajuda de custo: dias distintos com registro, só para quem é CP
    const ajuda = doPeriodo.reduce((s, x) => {
      if ((x.f.modalidade || 'cp') !== 'cp') return s
      const meus = new Set(dias.filter(d => d.func_id === x.f.id && d.data >= q.inicio && d.data <= q.fim).map(d => d.data))
      return s + meus.size * cfg.ajudaCustoDia
    }, 0)
    return {
      ...q, ordem: i + 1, parceiros: doPeriodo.length, milheiros, entregue, revisada, producao, ajuda,
      media: doPeriodo.length ? milheiros / doPeriodo.length : 0,
      qualidade: entregue > 0 ? revisada / entregue * 100 : null,
      base: faixa('Base'), inter: faixa('Intermediária'), premium: faixa('Premium'), acima,
      encerrada: q.fim < new Date().toISOString().slice(0, 10),
    }
  }), [quinzenasAno, linhas, cfg, dias])

  const comMovimento = porQuinzena.filter(q => q.parceiros > 0)
  const totalMilheiros = comMovimento.reduce((s, q) => s + q.milheiros, 0)
  const totalProducao = comMovimento.reduce((s, q) => s + q.producao, 0)
  const totalAjuda = comMovimento.reduce((s, q) => s + q.ajuda, 0)
  const entregueAno = comMovimento.reduce((s, q) => s + q.entregue, 0)
  const revisadaAno = comMovimento.reduce((s, q) => s + q.revisada, 0)
  const qualidadeAno = entregueAno > 0 ? revisadaAno / entregueAno * 100 : null

  // Provisão de prêmios: o que seria devido hoje se o ano fechasse agora
  const provisao = linhas.reduce((s, l) =>
    s + l.anual.produtividade.valor
      + (l.anual.fidelidade.elegivel ? l.anual.fidelidade.valor : 0)
      + (l.anual.qualidade.elegivel ? l.anual.qualidade.valor : 0), 0)

  const custoTotal = totalProducao + totalAjuda + provisao
  const custoPorMilheiro = totalMilheiros > 0 ? custoTotal / totalMilheiros : 0

  // Permanência: de quantas quinzenas com movimento cada parceiro participou
  const ativos = linhas.filter(l => l.anual.milheiros > 0)
  const permanencia = ativos.length && comMovimento.length
    ? ativos.reduce((s, l) => s + l.anual.quinzenasComEntrega, 0) / ativos.length / comMovimento.length * 100
    : null

  // Comparativo 1ª × 2ª quinzena do mês (item 9.1: oscilação de ritmo dentro do mês)
  const fechadas = comMovimento.filter(q => q.encerrada)
  const primeiras = fechadas.filter(q => q.ordem % 2 === 1)
  const segundas = fechadas.filter(q => q.ordem % 2 === 0)
  const mediaDe = (arr) => arr.length ? arr.reduce((s, q) => s + q.milheiros, 0) / arr.length : 0
  const media1 = mediaDe(primeiras), media2 = mediaDe(segundas)

  const linhasCSV = () => [
    ['Quinzena', 'Início', 'Fim', 'Parceiros', 'Volume (milheiros)', 'Média por parceiro', 'Qualidade %',
     'Acima do padrão', 'Base', 'Intermediária', 'Premium', 'Produção (R$)', 'Ajuda de custo (R$)'],
    ...comMovimento.map(q => [q.ordem, q.inicio, q.fim, q.parceiros, q.milheiros.toFixed(1), q.media.toFixed(1),
      q.qualidade?.toFixed(1) ?? '—', q.acima, q.base, q.inter, q.premium, q.producao.toFixed(2), q.ajuda.toFixed(2)]),
    ['TOTAL', '', '', '', totalMilheiros.toFixed(1), '', qualidadeAno?.toFixed(1) ?? '—', '', '', '', '',
     totalProducao.toFixed(2), totalAjuda.toFixed(2)],
  ]

  return (
    <div>
      <div className="card mb16">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
          <div className="fg" style={{ margin: 0 }}>
            <label>Ano</label>
            <select value={ano} onChange={e => setAno(Number(e.target.value))} style={{ width: 120 }}>
              {[anoAtual, anoAtual - 1, anoAtual - 2].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <button className="btn btn-secondary" onClick={() => exportCSV(linhasCSV(), `indicadores_${ano}.csv`)} disabled={!comMovimento.length}>⬇ CSV</button>
          <button className="btn btn-secondary" onClick={() => exportXLSX([{ name: 'Indicadores', rows: linhasCSV() }], `indicadores_${ano}.xlsx`)} disabled={!comMovimento.length} style={{ color: 'var(--green)', borderColor: 'rgba(40,180,133,.3)' }}>⬇ Excel</button>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Card titulo="Volume no ano" valor={`${fmtMilheiros(totalMilheiros)} mil`} sub={`${comMovimento.length} quinzenas com produção`} cor="var(--gold-light)" />
          <Card titulo="Parceiros ativos" valor={ativos.length} sub={permanencia == null ? '—' : `presença média de ${pct(permanencia)} das quinzenas`} />
          <Card titulo="Qualidade média" valor={pct(qualidadeAno)} sub={`padrão do programa: ${cfg.qualPremium}%`} cor={corQualidade(qualidadeAno, cfg)} />
          <Card titulo="Custo por milheiro" valor={fmtMoeda(custoPorMilheiro)} sub="produção + ajuda de custo + provisão de prêmios" cor="var(--amber)" />
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
          <Card titulo="Produção paga" valor={fmtMoeda(totalProducao)} sub="só o milheiro, pelas faixas" cor="var(--green)" />
          <Card titulo="Ajuda de custo" valor={fmtMoeda(totalAjuda)} sub={`${fmtMoeda(cfg.ajudaCustoDia)} por dia com entrega, só CP`} />
          <Card titulo="Provisão de prêmios" valor={fmtMoeda(provisao)} sub="se o ano fechasse hoje" cor="var(--gold-light)" />
          <Card titulo="1ª × 2ª quinzena" valor={`${fmtMilheiros(media1)} × ${fmtMilheiros(media2)}`}
            sub={media1 && media2
              ? `${media2 >= media1 ? 'a 2ª rende' : 'a 1ª rende'} ${pct(Math.abs(media2 - media1) / Math.max(media1, media2) * 100)} a mais · só quinzenas fechadas`
              : 'ainda sem duas quinzenas fechadas para comparar'} />
        </div>
      </div>

      <div className="card">
        <div className="card-title">📊 Quinzena a quinzena — {ano}</div>
        {loading ? <div className="loading"><div className="spin" /></div>
          : comMovimento.length === 0
            ? <div className="empty-state"><div className="es-icon">📊</div><div className="es-text">Nenhuma produção conferida em {ano}</div></div>
            : <div className="table-wrap"><table>
                <thead><tr>
                  <th>#</th><th>Período</th><th>Parceiros</th><th>Volume</th><th>Média/parceiro</th>
                  <th>Variação</th><th>Qualidade</th><th>Acima do padrão</th>
                  <th>Base</th><th>Inter.</th><th>Premium</th><th>Produção</th><th>Ajuda</th>
                </tr></thead>
                <tbody>
                  {comMovimento.map((q, i) => {
                    const ant = comMovimento[i - 1]
                    // quinzena aberta ainda não fechou o período: comparar seria enganoso
                    const varia = q.encerrada && ant?.encerrada && ant.milheiros > 0
                      ? (q.milheiros - ant.milheiros) / ant.milheiros * 100 : null
                    return (
                      <tr key={q.ordem}>
                        <td style={{ color: 'var(--text3)' }}>{q.ordem}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <strong style={{ color: 'var(--text)' }}>{fmtData(q.inicio, 'dd/MM')} a {fmtData(q.fim, 'dd/MM')}</strong>
                          {!q.encerrada && <div style={{ fontSize: 10.5, color: 'var(--amber)' }}>em andamento</div>}
                        </td>
                        <td>{q.parceiros}</td>
                        <td><strong style={{ color: 'var(--gold-light)' }}>{fmtMilheiros(q.milheiros)} mil</strong></td>
                        <td>{fmtMilheiros(q.media)} mil</td>
                        <td>{varia == null ? <span style={{ color: 'var(--text3)' }} title={q.encerrada ? '' : 'quinzena em andamento'}>—</span>
                          : <span style={{ color: varia >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                              {varia >= 0 ? '▲' : '▼'} {Math.abs(varia).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                            </span>}
                        </td>
                        <td style={{ color: corQualidade(q.qualidade, cfg), fontWeight: 700 }}>{pct(q.qualidade)}</td>
                        <td>{q.acima}/{q.parceiros}</td>
                        <td style={{ color: 'var(--text3)' }}>{q.base}</td>
                        <td style={{ color: 'var(--blue)' }}>{q.inter}</td>
                        <td style={{ color: 'var(--gold-light)' }}>{q.premium}</td>
                        <td style={{ color: 'var(--text2)' }}>{fmtMoeda(q.producao)}</td>
                        <td style={{ color: 'var(--text3)' }}>{q.ajuda > 0 ? fmtMoeda(q.ajuda) : '—'}</td>
                      </tr>
                    )
                  })}
                  <tr style={{ background: 'var(--bg3)' }}>
                    <td /><td><strong style={{ color: 'var(--text)' }}>TOTAL</strong></td>
                    <td>{ativos.length}</td>
                    <td><strong style={{ color: 'var(--gold-light)' }}>{fmtMilheiros(totalMilheiros)} mil</strong></td>
                    <td colSpan={2} />
                    <td style={{ color: corQualidade(qualidadeAno, cfg), fontWeight: 700 }}>{pct(qualidadeAno)}</td>
                    <td colSpan={4} />
                    <td><strong style={{ color: 'var(--green)' }}>{fmtMoeda(totalProducao)}</strong></td>
                    <td><strong style={{ color: 'var(--text2)' }}>{fmtMoeda(totalAjuda)}</strong></td>
                  </tr>
                </tbody>
              </table></div>
        }
        <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 12 }}>
          ℹ️ Tudo apurado sobre o <strong>entregue na conferência</strong> — a mesma base do pagamento.
          O custo por milheiro inclui a provisão de prêmios, então ele sobe conforme o ano avança e os parceiros se aproximam das faixas anuais.
        </div>
      </div>
    </div>
  )
}
