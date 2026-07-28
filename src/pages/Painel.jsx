import { useState, useEffect, useMemo } from 'react'
import { useFuncionarios, useConfig, useCQ, useApuracaoPremios } from '../lib/hooks'
import {
  getQuinzenaAtual, fmtData, fmtMilheiros, fmtMoeda, calcParceria, corQualidade,
  getFaixasProdutividade, getIniciais, avatarCor, isProducao,
} from '../lib/utils'

// Painel para a TV do Centro de Produção (item 7.2 do programa): volume da quinzena,
// faixa de cada um, quanto falta para a próxima e o acumulado do ano.
// Fica em tela cheia, sem menu, troca de página sozinho e recarrega os dados sozinho.
const SEGUNDOS_POR_PAGINA = 18
const MINUTOS_ATE_RECARREGAR = 2

const CORES_FAIXA = { Base: 'var(--text2)', 'Intermediária': 'var(--blue)', Premium: 'var(--gold-light)' }

export default function Painel() {
  const cfg = useConfig()
  const { funcionarios } = useFuncionarios()
  const qz = getQuinzenaAtual(cfg.quinzenaD1, cfg.quinzenaD2)
  const { cqRegistros, refetch } = useCQ({ dataInicio: qz.inicio, dataFim: qz.fim })
  const anoAtual = new Date().getFullYear()
  const { linhas: doAno } = useApuracaoPremios({ ano: anoAtual, funcionarios, cfg })

  const [pagina, setPagina] = useState(0)
  const [agora, setAgora] = useState(new Date())

  // Troca de página e recarga dos dados, sem ninguém tocar na TV
  useEffect(() => {
    const t = setInterval(() => setPagina(p => (p + 1) % 3), SEGUNDOS_POR_PAGINA * 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    const t = setInterval(() => { refetch(); setAgora(new Date()) }, MINUTOS_ATE_RECARREGAR * 60 * 1000)
    return () => clearInterval(t)
  }, [refetch])

  const parceiros = useMemo(() => {
    const linhas = funcionarios.filter(f => f.situacao === 'ativo' && isProducao(f)).map(f => {
      const meu = cqRegistros.filter(c => c.func_id === f.id)
      const entregue = meu.reduce((s, c) => s + (c.entregue || 0), 0)
      const revisada = meu.reduce((s, c) => s + (c.revisada || 0), 0)
      const p = calcParceria({ entregue, revisada, modalidade: f.modalidade || 'cp', cfg })
      const ano = doAno.find(l => l.f.id === f.id)?.anual
      return { f, ...p, entregue, anoMilheiros: ano?.milheiros || 0 }
    })
    return linhas.filter(l => l.entregue > 0).sort((a, b) => b.milheiros - a.milheiros)
  }, [funcionarios, cqRegistros, cfg, doAno])

  const totalMilheiros = parceiros.reduce((s, p) => s + p.milheiros, 0)
  const porFaixa = ['Base', 'Intermediária', 'Premium'].map(nome => ({
    nome, quantos: parceiros.filter(p => p.faixaEfetiva.nome === nome).length,
  }))
  const acimaDoPadrao = parceiros.filter(p => p.qualidade != null && p.qualidade >= cfg.qualPremium).length

  const T = { fontFamily: 'Barlow Condensed,sans-serif' }
  const Cabecalho = ({ titulo }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2vh 3vw 1.5vh', borderBottom: '2px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5vw' }}>
        <img src="/logo-grupo-midas.png" alt="" style={{ height: '7vh', objectFit: 'contain' }} />
        <div>
          <div style={{ ...T, fontSize: '4.2vh', fontWeight: 800, color: 'var(--gold-light)', letterSpacing: 2, lineHeight: 1 }}>{titulo}</div>
          <div style={{ fontSize: '1.9vh', color: 'var(--text3)', letterSpacing: 1 }}>
            QUINZENA {fmtData(qz.inicio, 'dd/MM')} A {fmtData(qz.fim, 'dd/MM')}
          </div>
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ ...T, fontSize: '3.4vh', fontWeight: 800, color: 'var(--text)' }}>
          {fmtMilheiros(totalMilheiros)} <span style={{ fontSize: '2vh', color: 'var(--text3)' }}>MILHEIROS NA QUINZENA</span>
        </div>
        <div style={{ fontSize: '1.6vh', color: 'var(--text3)' }}>atualizado {agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
      </div>
    </div>
  )

  const Vazio = () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '70vh', flexDirection: 'column', gap: '2vh' }}>
      <div style={{ fontSize: '10vh' }}>🌾</div>
      <div style={{ ...T, fontSize: '4vh', color: 'var(--text3)' }}>Ainda não há produção conferida nesta quinzena</div>
    </div>
  )

  // ── Página 1: quem está na frente ─────────────────────────────────────────
  const Ranking = () => (
    <div style={{ padding: '1vh 3vw', height: '84vh', display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly' }}>
      {parceiros.slice(0, 8).map((p, i) => {
        const pct = p.proxima ? Math.min(100, p.milheiros / p.proxima.min * 100) : 100
        return (
          <div key={p.f.id} style={{ display: 'flex', alignItems: 'center', gap: '1.5vw', padding: '1.2vh 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ ...T, fontSize: '4.5vh', fontWeight: 800, color: i < 3 ? 'var(--gold-light)' : 'var(--text3)', width: '4vw', textAlign: 'center' }}>
              {i + 1}
            </div>
            <div style={{ width: '6vh', height: '6vh', borderRadius: '50%', background: avatarCor(p.f.id), display: 'flex', alignItems: 'center', justifyContent: 'center', ...T, fontSize: '2.4vh', fontWeight: 800, color: '#0F1420', flexShrink: 0 }}>
              {getIniciais(p.f.nome)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...T, fontSize: '3.4vh', fontWeight: 700, color: 'var(--text)', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {p.f.nome}
              </div>
              <div style={{ height: '1.1vh', background: 'var(--bg3)', borderRadius: 99, marginTop: '.7vh', overflow: 'hidden' }}>
                <div style={{ width: pct + '%', height: '100%', background: 'linear-gradient(90deg,var(--gold-dark),var(--gold-light))' }} />
              </div>
            </div>
            <div style={{ textAlign: 'right', width: '13vw' }}>
              <div style={{ ...T, fontSize: '4vh', fontWeight: 800, color: 'var(--gold-light)', lineHeight: 1 }}>{fmtMilheiros(p.milheiros)}</div>
              <div style={{ fontSize: '1.5vh', color: 'var(--text3)' }}>MILHEIROS</div>
            </div>
            <div style={{ textAlign: 'right', width: '12vw' }}>
              <div style={{ ...T, fontSize: '2.6vh', fontWeight: 800, color: CORES_FAIXA[p.faixaEfetiva.nome] }}>{p.faixaEfetiva.nome}</div>
              <div style={{ fontSize: '1.8vh', color: 'var(--text3)' }}>{fmtMoeda(p.preco)}/mil</div>
            </div>
            <div style={{ textAlign: 'right', width: '8vw' }}>
              <div style={{ ...T, fontSize: '3vh', fontWeight: 800, color: corQualidade(p.qualidade, cfg) }}>
                {p.qualidade == null ? '—' : p.qualidade.toFixed(1) + '%'}
              </div>
              <div style={{ fontSize: '1.5vh', color: 'var(--text3)' }}>QUALIDADE</div>
            </div>
          </div>
        )
      })}
    </div>
  )

  // ── Página 2: quanto falta para subir de faixa ────────────────────────────
  const Faixas = () => (
    <div style={{ padding: '2vh 3vw', height: '84vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: '2vw', marginBottom: '2.5vh' }}>
        {porFaixa.map(f => (
          <div key={f.nome} style={{ flex: 1, background: 'var(--bg2)', border: `2px solid ${CORES_FAIXA[f.nome]}44`, borderRadius: '1.5vh', padding: '2vh' }}>
            <div style={{ ...T, fontSize: '2.4vh', color: CORES_FAIXA[f.nome], letterSpacing: 1 }}>{f.nome.toUpperCase()}</div>
            <div style={{ ...T, fontSize: '6vh', fontWeight: 800, color: 'var(--text)', lineHeight: 1.1 }}>{f.quantos}</div>
            <div style={{ fontSize: '1.8vh', color: 'var(--text3)' }}>{f.quantos === 1 ? 'parceiro' : 'parceiros'}</div>
          </div>
        ))}
        <div style={{ flex: 1, background: 'var(--bg2)', border: '2px solid rgba(40,180,133,.35)', borderRadius: '1.5vh', padding: '2vh' }}>
          <div style={{ ...T, fontSize: '2.4vh', color: 'var(--green)', letterSpacing: 1 }}>QUALIDADE {cfg.qualPremium}%+</div>
          <div style={{ ...T, fontSize: '6vh', fontWeight: 800, color: 'var(--text)', lineHeight: 1.1 }}>{acimaDoPadrao}</div>
          <div style={{ fontSize: '1.8vh', color: 'var(--text3)' }}>de {parceiros.length} com preço integral</div>
        </div>
      </div>
      <div style={{ ...T, fontSize: '2.6vh', color: 'var(--gold-light)', letterSpacing: 1, marginBottom: '1vh' }}>QUANTO FALTA PARA SUBIR DE FAIXA</div>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', flex: 1 }}>
      {parceiros.filter(p => p.proxima).slice(0, 6).map(p => (
        <div key={p.f.id} style={{ display: 'flex', alignItems: 'center', gap: '1.5vw', padding: '1vh 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ ...T, flex: 1, fontSize: '3vh', fontWeight: 700, color: 'var(--text)' }}>{p.f.nome}</div>
          <div style={{ ...T, fontSize: '3.4vh', fontWeight: 800, color: 'var(--gold-light)' }}>
            faltam {fmtMilheiros(p.proxima.faltam)} mil
          </div>
          <div style={{ fontSize: '2.2vh', color: 'var(--text3)', width: '22vw', textAlign: 'right' }}>
            para {p.proxima.nome} · {fmtMoeda(p.proxima.preco)}/milheiro
          </div>
        </div>
      ))}
      </div>
    </div>
  )

  // ── Página 3: corrida do ano ──────────────────────────────────────────────
  const Anual = () => {
    const faixas = getFaixasProdutividade(cfg)
    const meta = faixas[faixas.length - 1]
    return (
      <div style={{ padding: '2vh 3vw', height: '84vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ ...T, fontSize: '2.6vh', color: 'var(--gold-light)', letterSpacing: 1, marginBottom: '1.5vh' }}>
          ACUMULADO DE {anoAtual} — PRÊMIO ANUAL A PARTIR DE {meta.min} MILHEIROS ({fmtMoeda(meta.valor)})
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', flex: 1 }}>
        {[...parceiros].sort((a, b) => b.anoMilheiros - a.anoMilheiros).slice(0, 8).map(p => {
          const alcancada = faixas.find(fx => p.anoMilheiros >= fx.min)
          const proxima = [...faixas].reverse().find(fx => p.anoMilheiros < fx.min)
          const pct = proxima ? Math.min(100, p.anoMilheiros / proxima.min * 100) : 100
          return (
            <div key={p.f.id} style={{ display: 'flex', alignItems: 'center', gap: '1.5vw', padding: '1.1vh 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ ...T, width: '20vw', fontSize: '3vh', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.f.nome}</div>
              <div style={{ flex: 1, height: '1.6vh', background: 'var(--bg3)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ width: pct + '%', height: '100%', background: alcancada ? 'linear-gradient(90deg,var(--green),#5BE0AE)' : 'linear-gradient(90deg,var(--gold-dark),var(--gold-light))' }} />
              </div>
              <div style={{ ...T, width: '12vw', textAlign: 'right', fontSize: '3.2vh', fontWeight: 800, color: 'var(--text)' }}>
                {fmtMilheiros(p.anoMilheiros)}
              </div>
              <div style={{ width: '16vw', textAlign: 'right', fontSize: '2.1vh', color: alcancada ? 'var(--green)' : 'var(--text3)' }}>
                {alcancada ? `garantiu ${fmtMoeda(alcancada.valor)}` : proxima ? `faltam ${fmtMilheiros(proxima.min - p.anoMilheiros)} mil` : ''}
              </div>
            </div>
          )
        })}
        </div>
      </div>
    )
  }

  const paginas = [
    { titulo: 'RANKING DA QUINZENA', el: <Ranking /> },
    { titulo: 'FAIXAS DE PREÇO', el: <Faixas /> },
    { titulo: `CORRIDA DE ${anoAtual}`, el: <Anual /> },
  ]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', backgroundImage: 'radial-gradient(ellipse 70% 50% at 50% -10%, rgba(201,162,39,.10) 0%, transparent 60%)', overflow: 'hidden' }}>
      <Cabecalho titulo={paginas[pagina].titulo} />
      {parceiros.length === 0 ? <Vazio /> : paginas[pagina].el}
      {/* Marcador de página, para quem olha saber que a tela vai virar */}
      <div style={{ position: 'fixed', bottom: '2vh', left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: '1vw' }}>
        {paginas.map((_, i) => (
          <div key={i} style={{ width: i === pagina ? '5vw' : '1.2vw', height: '.9vh', borderRadius: 99, background: i === pagina ? 'var(--gold-light)' : 'var(--border2)', transition: 'width .4s' }} />
        ))}
      </div>
    </div>
  )
}
