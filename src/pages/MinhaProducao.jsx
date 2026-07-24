import { useMemo, useState, useEffect } from 'react'
import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, LineElement, PointElement } from 'chart.js'
import { subDays, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useRegistros, useFuncionarios, useConfig, useCQ } from '../lib/hooks'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { getHoje, fmtMoeda, fmtNum, fmtData, pctMeta, corPct, avatarCor, getIniciais, ultimosDias, calcValor, statusConferencia, getQuinzenaAtual, calcParceria, fmtMilheiros, corQualidade } from '../lib/utils'
import Modal from '../components/Modal'
import toast from 'react-hot-toast'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, LineElement, PointElement)

export default function MinhaProducao() {
  const { funcSession, isFinalizacao } = useAuth()
  const funcId = funcSession?.id
  const { funcionarios } = useFuncionarios()
  const cfg = useConfig()
  const { valorMil, uniDisplay, uniMaco, tolerancia, quinzenaD1, quinzenaD2 } = cfg
  const hoje = getHoje()
  const ini30 = format(subDays(new Date(), 30), 'yyyy-MM-dd')

  const { registros: regsHoje, registrar }        = useRegistros({ data: hoje })
  const { registros: meusRegs, refetch: refetchMeus } = useRegistros({ funcId, dataInicio: ini30, dataFim: hoje })
  const { cqRegistros: meusCQ, contestar } = useCQ({ funcId, dataInicio: ini30, dataFim: hoje })

  const [qtd, setQtd] = useState('')
  const [obs, setObs] = useState('')
  const [saving, setSaving] = useState(false)
  const [contestando, setContestando] = useState(null)
  const [motivoCont, setMotivoCont] = useState('')
  const [enviandoCont, setEnviandoCont] = useState(false)

  const f = funcionarios.find(x => x.id === funcId)
  const meuHoje = regsHoje.find(r => r.func_id === funcId)

  // Recorde pessoal de todos os tempos (uma linha só, direto do banco)
  const [recorde, setRecorde] = useState(null)
  useEffect(() => {
    if (!funcId) return
    supabase.from('registros_producao')
      .select('quantidade, data')
      .eq('func_id', funcId)
      .order('quantidade', { ascending: false })
      .limit(1)
      .then(({ data }) => setRecorde(data?.[0] || null))
  }, [funcId, meuHoje?.quantidade])

  // Sequência de registros consecutivos batendo a meta (mais recente primeiro;
  // dias sem registro não quebram, só não contam)
  const streak = useMemo(() => {
    if (!f?.meta_diaria) return 0
    let s = 0
    for (const r of meusRegs) {
      if (r.quantidade >= f.meta_diaria) s++
      else break
    }
    return s
  }, [meusRegs, f])

  const recordeHoje = !!(meuHoje && recorde && recorde.data === hoje && meuHoje.quantidade >= recorde.quantidade)

  const handleRegistrar = async () => {
    const q = parseInt(qtd)
    if (!q || q <= 0) { toast.error('Informe a quantidade produzida'); return }
    setSaving(true)
    const ok = await registrar({ funcId, quantidade: q, data: hoje, obs, valorMil })
    if (ok) { setQtd(''); setObs(''); await refetchMeus() }
    setSaving(false)
  }
  const rankHoje = [...regsHoje].sort((a, b) => b.quantidade - a.quantidade)
  const minhaPos = rankHoje.findIndex(r => r.func_id === funcId) + 1

  // Quinzena de pagamento atual (o início fica no máximo ~16 dias atrás, coberto pelos 30 dias buscados)
  const qz = getQuinzenaAtual(quinzenaD1, quinzenaD2)
  const regsQz  = meusRegs.filter(r => r.data >= qz.inicio && r.data <= qz.fim)
  const totalQz = regsQz.reduce((s, r) => s + r.quantidade, 0)

  // Programa de Parceria: a quinzena é apurada pelo CONFERIDO (entregue na revisão),
  // com faixa de preço e trava de qualidade — mesma conta usada na Folha do admin
  const cqQz = meusCQ.filter(c => c.data >= qz.inicio && c.data <= qz.fim)
  const entregueQz = cqQz.reduce((s, c) => s + (c.entregue || 0), 0)
  const revisadaQz = cqQz.reduce((s, c) => s + (c.revisada || 0), 0)
  const modalidade = f?.modalidade || 'cp'
  const parceria = calcParceria({ entregue: entregueQz, revisada: revisadaQz, modalidade, cfg })
  const diasCqQz = new Set(cqQz.map(c => c.data))
  const aguardandoQz = regsQz.filter(r => !diasCqQz.has(r.data)).reduce((s, r) => s + r.quantidade, 0)
  // Rastreio declarado × aprovado (só dias já conferidos): perda + o que foi declarado mas nunca chegou
  const declaradoConfQz = regsQz.filter(r => diasCqQz.has(r.data)).reduce((s, r) => s + r.quantidade, 0)
  const difDeclaradoQz = declaradoConfQz - revisadaQz
  const diasEntregaQz = new Set(regsQz.map(r => r.data)).size
  const ajudaQz = modalidade === 'cp' ? diasEntregaQz * cfg.ajudaCustoDia : 0
  const totalQzReceber = parceria.valor + ajudaQz

  const total30  = meusRegs.reduce((s, r) => s + r.quantidade, 0)
  const valor30  = meusRegs.reduce((s, r) => s + Number(r.valor || 0), 0)
  const media30  = meusRegs.length ? Math.round(total30 / meusRegs.length) : 0
  const diasMeta = f ? meusRegs.filter(r => r.quantidade >= f.meta_diaria).length : 0

  // Revisão/embalagem da finalização, por dia — perda e diferença entre o que eu declarei e o que foi empacotado
  const confPorDia = useMemo(() => {
    const map = new Map()
    meusCQ.forEach(c => {
      const cur = map.get(c.data) || { perda: 0, entregue: 0, display: 0, macos: 0, temCQ: false, pendenteEmbalagem: true, contestacao: null, contestacaoStatus: null }
      cur.temCQ = true
      cur.entregue += c.entregue || 0
      cur.perda += c.perda || 0
      cur.display += c.display || 0
      cur.macos += c.macos || 0
      cur.pendenteEmbalagem = cur.pendenteEmbalagem && !c.registrado_por_display
      cur.contestacao = cur.contestacao || c.contestacao || null
      cur.contestacaoStatus = cur.contestacaoStatus || c.contestacao_status || null
      map.set(c.data, cur)
    })
    return map
  }, [meusCQ])

  const confLinha = (r) => {
    const c = confPorDia.get(r.data)
    if (!c) return { temCQ: false, status: 'aguardando' }
    const empacotado = c.display * uniDisplay + c.macos * uniMaco
    const diferenca = r.quantidade - c.perda - empacotado
    const status = statusConferencia({ temCQ: true, pendenteEmbalagem: c.pendenteEmbalagem, base: r.quantidade, perda: c.perda, empacotado, tolerancia })
    return { temCQ: true, perda: c.perda, empacotado, diferenca, status, contestacao: c.contestacao, contestacaoStatus: c.contestacaoStatus }
  }

  const handleContestar = async () => {
    if (!motivoCont.trim()) { toast.error('Explique o motivo da contestação'); return }
    setEnviandoCont(true)
    const ok = await contestar(funcId, contestando.data, motivoCont.trim())
    if (ok) { setContestando(null); setMotivoCont('') }
    setEnviandoCont(false)
  }

  const perda30 = [...confPorDia.values()].reduce((s, c) => s + c.perda, 0)

  const chartData = useMemo(() => {
    const dias14 = ultimosDias(14)
    const labels = dias14.map(d => format(new Date(d + 'T12:00'), 'dd/MM', { locale: ptBR }))
    const dados  = dias14.map(d => meusRegs.find(r => r.data === d)?.quantidade || 0)
    const meta   = Array(14).fill(f?.meta_diaria || 0)
    return {
      labels,
      datasets: [
        {
          type: 'bar',
          data: dados,
          backgroundColor: dados.map(v => f?.meta_diaria && v >= f.meta_diaria ? 'rgba(40,180,133,.3)' : 'rgba(201,162,39,.2)'),
          borderColor: dados.map(v => f?.meta_diaria && v >= f.meta_diaria ? '#28B485' : '#C9A227'),
          borderWidth: 1.5,
          borderRadius: 4,
        },
        {
          type: 'line',
          data: meta,
          borderColor: 'rgba(201,162,39,.4)',
          borderWidth: 1.5,
          borderDash: [5, 4],
          pointRadius: 0,
          fill: false,
        },
      ],
    }
  }, [meusRegs, f])

  const MEDALS = ['🥇', '🥈', '🥉']
  const posLabel = minhaPos > 0 ? (MEDALS[minhaPos - 1] || '#' + minhaPos) : '—'

  return (
    <div>
      {/* Boas vindas */}
      <div className="card mb16">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {f && <div style={{ width: 56, height: 56, borderRadius: '50%', background: avatarCor(funcId), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: '#0D1018', flexShrink: 0 }}>{getIniciais(f.nome)}</div>}
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'Barlow Condensed,sans-serif', fontSize: 22, fontWeight: 700 }}>Olá, {f?.nome?.split(' ')[0] || 'Funcionário'}! 👋</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
              Meta: {fmtNum(f?.meta_diaria || 0)} un./dia · {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
          </div>
          {meuHoje
            ? <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>Produção de hoje</div>
                <div style={{ fontFamily: 'Barlow Condensed,sans-serif', fontSize: 32, fontWeight: 800, color: corPct(f ? pctMeta(meuHoje.quantidade, f.meta_diaria) : 0) }}>{fmtNum(meuHoje.quantidade)}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>unidades · {fmtMoeda(Number(meuHoje.valor))}</div>
              </div>
            : <div style={{ fontSize: 13, color: 'var(--amber)' }}>⚠️ Sem registro hoje</div>
          }
        </div>

        {/* Conquistas */}
        {!isFinalizacao && (streak >= 2 || recorde || recordeHoje) && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            {recordeHoje && (
              <div className="stats-chip" style={{ borderColor: 'rgba(40,180,133,.45)', background: 'rgba(40,180,133,.08)' }}>
                🎉 <strong style={{ color: 'var(--green)' }}>Novo recorde pessoal hoje!</strong>
              </div>
            )}
            {streak >= 2 && (
              <div className="stats-chip">
                🔥 <strong style={{ color: 'var(--amber)' }}>{streak} registros seguidos</strong>&nbsp;<span style={{ color: 'var(--text3)' }}>batendo a meta</span>
              </div>
            )}
            {recorde && !recordeHoje && (
              <div className="stats-chip">
                🏅 <span style={{ color: 'var(--text3)' }}>Recorde pessoal:</span>&nbsp;<strong style={{ color: 'var(--gold-light)' }}>{fmtNum(recorde.quantidade)} un.</strong>&nbsp;<span style={{ color: 'var(--text3)' }}>({fmtData(recorde.data, 'dd/MM/yy')})</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Registrar produção de hoje */}
      {!isFinalizacao && (
        <div className="card mb16">
          <div className="card-title">✏️ Registrar Minha Produção — Hoje</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="fg" style={{ margin: 0, width: 170 }}>
              <label>Quantidade (un.)</label>
              <input type="number" min="0" inputMode="numeric" value={qtd} placeholder={`Ex: ${fmtNum(f?.meta_diaria || 3000)}`} onChange={e => setQtd(e.target.value)} />
            </div>
            <div className="fg" style={{ margin: 0, flex: 1, minWidth: 170 }}>
              <label>Observação</label>
              <input value={obs} placeholder="Opcional..." onChange={e => setObs(e.target.value)} />
            </div>
            <button className="btn btn-primary" onClick={handleRegistrar} disabled={saving} style={{ height: 40 }}>
              {saving ? '...' : meuHoje ? '✓ Atualizar Registro' : '✓ Registrar Produção'}
            </button>
          </div>
          {parseInt(qtd) > 0 && (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', background: 'var(--bg3)', borderRadius: 'var(--rs)', padding: '8px 14px', fontSize: 12.5, marginTop: 10 }}>
              <span style={{ color: 'var(--text3)' }}>Valor estimado: <strong style={{ color: 'var(--green)' }}>{fmtMoeda(calcValor(parseInt(qtd), valorMil))}</strong> <span style={{ fontSize: 11 }}>(o valor final é o que chegar na conferência)</span></span>
              {f?.meta_diaria > 0 && <span style={{ color: 'var(--text3)' }}>Meta: <strong style={{ color: corPct(pctMeta(parseInt(qtd), f.meta_diaria)) }}>{pctMeta(parseInt(qtd), f.meta_diaria)}%</strong></span>}
            </div>
          )}
          {meuHoje && (
            <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 8 }}>
              ℹ️ Você já registrou {fmtNum(meuHoje.quantidade)} un. hoje. Registrar novamente substitui o valor anterior.
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="stat-grid mb16">
        <div className="stat-card sc-green">
          <div className="stat-label">💵 Quinzena Atual</div>
          <div className="stat-value sv-green" style={{ fontSize: 22 }}>{fmtMoeda(totalQzReceber)}</div>
          <div className="stat-sub">{fmtMilheiros(parceria.milheiros)} milheiros aprovados · {fmtData(qz.inicio, 'dd/MM')} a {fmtData(qz.fim, 'dd/MM')}</div>
          <div className="stat-sub" style={{ marginTop: 2 }}>
            {totalQz === 0 ? 'sem produção ainda'
              : aguardandoQz > 0 ? <>⏳ {fmtNum(aguardandoQz)} un. aguardam conferência</>
              : '✔ tudo conferido'}
          </div>
        </div>
        <div className="stat-card sc-gold">
          <div className="stat-label">Posição Hoje</div>
          <div className="stat-value sv-gold" style={{ fontSize: 28 }}>{posLabel}</div>
          <div className="stat-sub">{minhaPos > 0 ? 'de ' + rankHoje.length + ' registros' : 'sem registro hoje'}</div>
        </div>
        <div className="stat-card sc-green">
          <div className="stat-label">Valor 30 Dias</div>
          <div className="stat-value sv-green" style={{ fontSize: 20 }}>{fmtMoeda(valor30)}</div>
          <div className="stat-sub">{fmtNum(total30)} un. produzidas</div>
        </div>
        <div className="stat-card sc-blue">
          <div className="stat-label">Média Diária</div>
          <div className="stat-value sv-blue">{fmtNum(media30)}</div>
          <div className="stat-sub">un. por dia</div>
        </div>
        <div className="stat-card sc-amber">
          <div className="stat-label">Dias na Meta</div>
          <div className="stat-value sv-amber">{diasMeta}/{meusRegs.length}</div>
          <div className="stat-sub">nos últimos 30 dias</div>
        </div>
        <div className="stat-card sc-red">
          <div className="stat-label">Perda 30 Dias</div>
          <div className="stat-value sv-red">{fmtNum(perda30)}</div>
          <div className="stat-sub">descarte na conferência · não desconta do seu pagamento</div>
        </div>
      </div>

      {/* Programa de Parceria — quinzena com a conta aberta */}
      {!isFinalizacao && (() => {
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
                <span style={{ color: 'var(--text3)' }}>Produção aprovada: </span>
                <strong>{fmtMilheiros(milheiros)} milheiros × {fmtMoeda(preco)} = </strong>
                <strong style={{ color: 'var(--green)' }}>{fmtMoeda(valor)}</strong>
              </div>
              {difDeclaradoQz > 0 && (
                <div style={{ fontSize: 12 }}>
                  <span style={{ color: 'var(--text3)' }}>Declarado nos dias já conferidos: </span>
                  <strong>{fmtNum(declaradoConfQz)} un.</strong>
                  <span style={{ color: 'var(--text3)' }}> · aprovado: </span>
                  <strong>{fmtNum(revisadaQz)} un.</strong>
                  <span style={{ color: 'var(--text3)' }}> · diferença: </span>
                  <strong style={{ color: 'var(--red)' }}>{fmtNum(difDeclaradoQz)} un. não pagas</strong>
                  <span style={{ color: 'var(--text3)' }}> (descarte + o que não chegou na conferência)</span>
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
                  ⏳ Mais {fmtNum(aguardandoQz)} un. declaradas aguardam conferência — o que for aprovado entra na conta (e pode subir sua faixa).
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
      })()}

      <div className="g2">
        {/* Ranking do dia */}
        <div className="card">
          <div className="card-title">🏆 Ranking de Hoje</div>
          {rankHoje.length === 0
            ? <div className="empty-state"><div className="es-icon">📭</div><div className="es-text">Nenhum registro hoje</div></div>
            : rankHoje.map((r, i) => {
                const isMe = r.func_id === funcId
                const fData = funcionarios.find(x => x.id === r.func_id)
                const pct = fData ? pctMeta(r.quantidade, fData.meta_diaria) : 0
                return (
                  <div key={r.id} className="rank-row" style={isMe ? { background: 'rgba(201,162,39,.07)', borderRadius: 8, padding: '10px', margin: '-4px -8px' } : {}}>
                    <div className={`rank-num ${i < 3 ? 'rn-' + (i + 1) : ''}`}>{MEDALS[i] || i + 1}</div>
                    <div className="rank-av" style={{ background: avatarCor(r.func_id) }}>{isMe ? '⭐' : getIniciais(r.funcionarios?.nome || '')}</div>
                    <div className="rank-info">
                      <div className="rank-name" style={isMe ? { color: 'var(--gold-light)', fontWeight: 700 } : {}}>{isMe ? '👉 ' : ''}{r.funcionarios?.nome}</div>
                      <div className="pbar"><div className="pfill pf-gold" style={{ width: `${Math.min(100, pct)}%` }} /></div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'Barlow Condensed,sans-serif', fontSize: 18, fontWeight: 800, color: isMe ? 'var(--gold-light)' : 'var(--text2)' }}>{fmtNum(r.quantidade)}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{fmtMoeda(Number(r.valor))}</div>
                    </div>
                  </div>
                )
              })
          }
        </div>

        {/* Minha evolução */}
        <div className="card">
          <div className="card-title">
            📈 Minha Evolução — 14 Dias
            {f?.meta_diaria ? <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text3)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>linha = meta {fmtNum(f.meta_diaria)} un.</span> : null}
          </div>
          {meusRegs.length === 0
            ? <div className="empty-state"><div className="es-icon">📭</div><div className="es-text">Sem registros no período</div></div>
            : (
              <>
                <div className="chart-wrap" style={{ height: 180, marginBottom: 16 }}>
                  <Bar
                    data={chartData}
                    options={{
                      responsive: true, maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                      scales: {
                        x: { ticks: { color: '#5E6A8A', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,.04)' } },
                        y: { ticks: { color: '#5E6A8A', font: { size: 10 }, callback: v => fmtNum(v) }, grid: { color: 'rgba(255,255,255,.04)' } },
                      },
                    }}
                  />
                </div>
                <div className="table-wrap"><table>
                  <thead><tr><th>Data</th><th>Dia</th><th>Produção</th><th>Valor</th><th>Meta</th><th>Perda</th><th>Diferença</th><th>Contestação</th></tr></thead>
                  <tbody>{meusRegs.slice(0, 10).map(r => {
                    const pct = f ? pctMeta(r.quantidade, f.meta_diaria) : 0
                    const c = confLinha(r)
                    return (
                      <tr key={r.id}>
                        <td>{new Date(r.data + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</td>
                        <td style={{ color: 'var(--text3)' }}>{new Date(r.data + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short' })}</td>
                        <td><strong style={{ color: 'var(--text)' }}>{fmtNum(r.quantidade)} un.</strong></td>
                        <td style={{ color: 'var(--green)' }}>
                          {fmtMoeda(Number(r.valor))}{' '}
                          {c.temCQ
                            ? <span title="Dia conferido — o valor final segue a faixa da quinzena (veja Minha Parceria)" style={{ fontSize: 11 }}>✔</span>
                            : <span title="Estimativa — o valor final depende da conferência e da faixa da quinzena" style={{ fontSize: 11, color: 'var(--text3)' }}>⏳</span>}
                        </td>
                        <td><span style={{ color: corPct(pct), fontWeight: 700 }}>{pct}%</span></td>
                        <td style={{ color: c.temCQ ? 'var(--red)' : 'var(--text3)' }}>{c.temCQ ? fmtNum(c.perda) + ' un.' : '—'}</td>
                        <td>{c.status === 'aguardando' ? <span style={{ color: 'var(--text3)' }}>⏳ aguardando conferência</span>
                          : c.status === 'aguardando_embalagem' ? <span style={{ color: 'var(--text3)' }}>📦 aguardando embalagem</span>
                          : <span style={{ color: c.status === 'ok' ? 'var(--green)' : c.diferenca > 0 ? 'var(--red)' : 'var(--amber)', fontWeight: 700 }}>{c.diferenca === 0 ? '0' : (c.diferenca > 0 ? '−' : '+') + fmtNum(Math.abs(c.diferenca)) + ' un.'}</span>}
                        </td>
                        <td>{!c.temCQ ? <span style={{ color: 'var(--text3)' }}>—</span>
                          : c.contestacao
                            ? <span style={{ color: c.contestacaoStatus === 'resolvida' ? 'var(--green)' : 'var(--amber)', fontSize: 12, fontWeight: 600 }} title={c.contestacao}>{c.contestacaoStatus === 'resolvida' ? '✓ resolvida' : '⚑ contestada'}</span>
                            : <button className="btn btn-secondary btn-xs" title="Discorda da contagem ou da perda? Envie uma contestação ao administrador" onClick={() => setContestando({ data: r.data, perda: c.perda, diferenca: c.diferenca })}>⚑ Contestar</button>}
                        </td>
                      </tr>
                    )
                  })}</tbody>
                </table></div>
              </>
            )
          }
        </div>
      </div>

      {/* Modal Contestar Revisão */}
      {contestando && (
        <Modal title="⚑ Contestar Conferência" onClose={() => { setContestando(null); setMotivoCont('') }} width={460}>
          <div style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 10 }}>
            Dia {fmtData(contestando.data)} · Perda registrada: <strong style={{ color: 'var(--red)' }}>{fmtNum(contestando.perda || 0)} un.</strong>
          </div>
          <div className="fg">
            <label>Motivo da contestação *</label>
            <textarea rows={3} value={motivoCont} placeholder="Ex: entreguei 3.000 unidades contadas, a perda registrada não bate..." onChange={e => setMotivoCont(e.target.value)} />
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 12 }}>
            ℹ️ Sua contestação vai aparecer para o administrador, que vai conferir e te responder.
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" onClick={handleContestar} disabled={enviandoCont}>{enviandoCont ? '...' : 'Enviar Contestação'}</button>
            <button className="btn btn-secondary" onClick={() => { setContestando(null); setMotivoCont('') }}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
