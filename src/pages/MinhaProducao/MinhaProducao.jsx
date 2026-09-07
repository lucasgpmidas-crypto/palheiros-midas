import { useMemo, useState, useEffect } from 'react'
import Campo from '../../components/Campo'
import { subDays, format } from 'date-fns'
import { useRegistros, useFuncionarios, useConfig, useCQ, useApuracaoPremios, usePremios, useFilaProducao } from '../../lib/hooks'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { getHoje, fmtMoeda, fmtNum, fmtData, pctMeta, corPct, statusConferencia, calcValor, getQuinzenaAtual, calcParceria, fmtMilheiros } from '../../lib/utils'
import Modal from '../../components/Modal'
import toast from 'react-hot-toast'
import ParceriaQuinzena from './ParceriaQuinzena'
import CabecalhoFuncionario from './CabecalhoFuncionario'
import PremiosPrograma from './PremiosPrograma'
import RankingDoDia, { MEDALS } from './RankingDoDia'
import MinhaEvolucao from './MinhaEvolucao'


export default function MinhaProducao() {
  const { funcSession, isFinalizacao } = useAuth()
  const funcId = funcSession?.id
  const { funcionarios } = useFuncionarios()
  const cfg = useConfig()
  const { valorMil, uniDisplay, uniMaco, tolerancia, quinzenaD1, quinzenaD2 } = cfg
  const hoje = getHoje()
  const ontem = format(subDays(new Date(), 1), 'yyyy-MM-dd')
  const ini30 = format(subDays(new Date(), 30), 'yyyy-MM-dd')

  const { registros: regsHoje, loading: carregandoHoje, registrar, refetch: refetchHoje } = useRegistros({ data: hoje })
  const { registros: meusRegs, loading: carregandoMeus, refetch: refetchMeus } = useRegistros({ funcId, dataInicio: ini30, dataFim: hoje })
  const { cqRegistros: meusCQ, contestar } = useCQ({ funcId, dataInicio: ini30, dataFim: hoje })

  // O que ficou guardado no aparelho por falta de sinal. Quando a fila esvazia,
  // as duas listas precisam recarregar — senão o número entra no banco e a tela
  // continua dizendo que ele não registrou nada hoje.
  const { pendentes, enviando: enviandoFila, enviarAgora } = useFilaProducao(
    funcId,
    async () => { await Promise.all([refetchHoje(), refetchMeus()]) },
  )

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
    const ok = await registrar({ funcId, quantidade: q, data: hoje, obs })
    if (ok) { setQtd(''); setObs(''); await refetchMeus() }
    setSaving(false)
  }
  const rankHoje = [...regsHoje].sort((a, b) => b.quantidade - a.quantidade)
  const minhaPos = rankHoje.findIndex(r => r.func_id === funcId) + 1

  // Quinzena de pagamento atual (o início fica no máximo ~16 dias atrás, coberto pelos 30 dias buscados)
  const qz = getQuinzenaAtual(quinzenaD1, quinzenaD2)
  const regsQz  = meusRegs.filter(r => r.data >= qz.inicio && r.data <= qz.fim)
  const totalQz = regsQz.reduce((s, r) => s + r.quantidade, 0)

  // Programa de Parceria: a quinzena é paga pelo ENTREGUE na conferência (o descarte
  // da revisão não desconta), com faixa de preço e trava de qualidade — mesma conta
  // usada na Folha do admin. O que não é pago é o declarado que nunca chegou.
  const cqQz = meusCQ.filter(c => c.data >= qz.inicio && c.data <= qz.fim)
  const entregueQz = cqQz.reduce((s, c) => s + (c.entregue || 0), 0)
  const revisadaQz = cqQz.reduce((s, c) => s + (c.revisada || 0), 0)
  const modalidade = f?.modalidade || 'cp'
  const parceria = calcParceria({ entregue: entregueQz, revisada: revisadaQz, modalidade, cfg })
  const diasCqQz = new Set(cqQz.map(c => c.data))
  const aguardandoQz = regsQz.filter(r => !diasCqQz.has(r.data)).reduce((s, r) => s + r.quantidade, 0)
  // Rastreio declarado × entregue (só dias já conferidos): o que foi declarado e nunca
  // chegou na conferência — o descarte não entra aqui, porque continua sendo pago
  const declaradoConfQz = regsQz.filter(r => diasCqQz.has(r.data)).reduce((s, r) => s + r.quantidade, 0)
  const difDeclaradoQz = declaradoConfQz - entregueQz
  const diasEntregaQz = new Set(regsQz.map(r => r.data)).size
  const ajudaQz = modalidade === 'cp' ? diasEntregaQz * cfg.ajudaCustoDia : 0
  const totalQzReceber = parceria.valor + ajudaQz

  // Os mesmos indicadores do histórico, recortados na quinzena. Ficam separados de
  // propósito: é isto que zera no corte e que o funcionário confere contra o papel.
  const mediaQz    = regsQz.length ? Math.round(totalQz / regsQz.length) : 0
  const diasMetaQz = f ? regsQz.filter(r => r.quantidade >= f.meta_diaria).length : 0
  const perdaQz    = cqQz.reduce((s, c) => s + (c.perda || 0), 0)

  // Prêmios do programa: qualificação (6 primeiras quinzenas) e acumulado do ano.
  // Só o enrolador precisa disso — o admin e a finalização não carregam a apuração.
  const anoAtual = new Date().getFullYear()
  const { linhas: apuracao } = useApuracaoPremios({ ano: anoAtual, funcionarios, cfg, funcId, enabled: !!funcId && !isFinalizacao })
  const { premios } = usePremios()
  const meuPremio = apuracao[0]
  const meusPremios = premios.filter(p => p.func_id === funcId)

  const total30  = meusRegs.reduce((s, r) => s + r.quantidade, 0)
  // Só entra na soma o que já foi conferido — o resto ainda não é dinheiro
  const valor30  = meusRegs.reduce((s, r) => s + Number(r.valor || 0), 0)
  const diasSemConf = meusRegs.filter(r => r.valor == null).length
  const media30  = meusRegs.length ? Math.round(total30 / meusRegs.length) : 0
  const diasMeta = f ? meusRegs.filter(r => r.quantidade >= f.meta_diaria).length : 0

  // Revisão/embalagem da finalização, por dia — perda e diferença entre o que eu declarei e o que foi empacotado
  const confPorDia = useMemo(() => {
    const map = new Map()
    meusCQ.forEach(c => {
      const cur = map.get(c.data) || { perda: 0, entregue: 0, display: 0, macos: 0, temCQ: false, pendenteEmbalagem: true, contestacao: null, contestacaoStatus: null, loteId: null, revisadoEm: null }
      cur.temCQ = true
      cur.entregue += c.entregue || 0
      cur.perda += c.perda || 0
      cur.display += c.display || 0
      cur.macos += c.macos || 0
      cur.pendenteEmbalagem = cur.pendenteEmbalagem && !c.registrado_por_display
      cur.contestacao = cur.contestacao || c.contestacao || null
      cur.contestacaoStatus = cur.contestacaoStatus || c.contestacao_status || null
      cur.loteId = cur.loteId || c.lote_id || null
      cur.revisadoEm = cur.revisadoEm || c.revisado_em || null
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
    return { temCQ: true, perda: c.perda, empacotado, diferenca, status, contestacao: c.contestacao, contestacaoStatus: c.contestacaoStatus, loteId: c.loteId, revisadoEm: c.revisadoEm }
  }

  const handleContestar = async () => {
    if (!motivoCont.trim()) { toast.error('Explique o motivo da contestação'); return }
    setEnviandoCont(true)
    const ok = await contestar(funcId, contestando.data, motivoCont.trim())
    if (ok) { setContestando(null); setMotivoCont('') }
    setEnviandoCont(false)
  }

  const perda30 = [...confPorDia.values()].reduce((s, c) => s + c.perda, 0)
  const posLabel = minhaPos > 0 ? (MEDALS[minhaPos - 1] || '#' + minhaPos) : '—'

  return (
    <div>
      {/* Boas vindas */}
      <CabecalhoFuncionario f={f} funcId={funcId} meuHoje={meuHoje} minhaPos={minhaPos} posLabel={posLabel} rankHoje={rankHoje} recorde={recorde} recordeHoje={recordeHoje} streak={streak} isFinalizacao={isFinalizacao} />

      {/* Registrar produção de hoje */}
      {!isFinalizacao && (
        <div className="card mb16">
          <div className="card-title">✏️ Registrar Minha Produção — Hoje</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <Campo label="Quantidade (un.)" style={{ margin: 0, width: 170 }}><input type="number" min="0" inputMode="numeric" value={qtd} placeholder={`Ex: ${fmtNum(f?.meta_diaria || 3000)}`} onChange={e => setQtd(e.target.value)} /></Campo>
            <Campo label="Observação" style={{ margin: 0, flex: 1, minWidth: 170 }}><input value={obs} placeholder="Opcional..." onChange={e => setObs(e.target.value)} /></Campo>
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

          {/* Guardado no aparelho ≠ enviado. Quem registrou sem sinal precisa ver
              que o número está seguro, mas ainda não chegou — e poder forçar o
              envio quando reconhecer que a internet voltou. */}
          {pendentes.length > 0 && (
            <div style={{ marginTop: 10, background: 'var(--bg3)', border: '1px solid var(--amber)', borderRadius: 'var(--rs)', padding: '10px 14px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--amber)', marginBottom: 4 }}>
                📥 {pendentes.length === 1 ? 'Registro guardado no aparelho' : `${pendentes.length} registros guardados no aparelho`}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>
                {pendentes.length === 1
                  ? 'Ainda não chegou ao sistema — vai sozinho assim que a internet voltar.'
                  : 'Ainda não chegaram ao sistema — vão sozinhos assim que a internet voltar.'}
              </div>
              {pendentes.map(p => (
                <div key={p.chave} style={{ fontSize: 12.5, color: 'var(--text2)' }}>
                  • <strong>{fmtNum(p.quantidade)} un.</strong> de {p.data === hoje ? 'hoje' : p.data === ontem ? 'ontem' : fmtData(p.data)}
                  <span style={{ color: 'var(--text3)' }}> · guardado às {new Date(p.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
              <button className="btn btn-secondary btn-sm" onClick={enviarAgora} disabled={enviandoFila} style={{ marginTop: 8 }}>
                {enviandoFila ? 'Enviando...' : '↑ Enviar agora'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Esta quinzena — tudo o que está aqui zera sozinho na virada do corte.
          Fica separado do histórico porque é o que vira pagamento: misturar as
          duas janelas fazia a tela mostrar dinheiro da quinzena já paga. */}
      <div className="stat-sec-title">
        Esta quinzena · {fmtData(qz.inicio, 'dd/MM')} a {fmtData(qz.fim, 'dd/MM')}
      </div>
      <div className="stat-grid">
        <div className="stat-card sc-green">
          <div className="stat-label">💵 A Receber</div>
          <div className="stat-value sv-green" style={{ fontSize: 22 }}>{fmtMoeda(totalQzReceber)}</div>
          <div className="stat-sub">{fmtMilheiros(parceria.milheiros)} milheiros conferidos</div>
          <div className="stat-sub" style={{ marginTop: 2 }}>
            {totalQz === 0 ? 'sem produção ainda nesta quinzena'
              : aguardandoQz > 0 ? <>⏳ {fmtNum(aguardandoQz)} un. aguardam conferência</>
              : '✔ tudo conferido'}
          </div>
        </div>
        <div className="stat-card sc-blue">
          <div className="stat-label">Média Diária</div>
          <div className="stat-value sv-blue">{fmtNum(mediaQz)}</div>
          <div className="stat-sub">{regsQz.length === 0 ? 'sem registro ainda' : `un. por dia em ${regsQz.length} ${regsQz.length === 1 ? 'dia' : 'dias'}`}</div>
        </div>
        <div className="stat-card sc-amber">
          <div className="stat-label">Dias na Meta</div>
          <div className="stat-value sv-amber">{diasMetaQz}/{regsQz.length}</div>
          <div className="stat-sub">{regsQz.length === 0 ? 'sem registro ainda' : 'dias registrados na quinzena'}</div>
        </div>
        <div className="stat-card sc-red">
          <div className="stat-label">Perda</div>
          <div className="stat-value sv-red">{fmtNum(perdaQz)}</div>
          <div className="stat-sub">descarte na conferência · não desconta do seu pagamento</div>
        </div>
      </div>

      {/* Histórico — janela móvel de 30 dias, que atravessa o corte de propósito.
          O aviso existe para ninguém confundir este valor com o da quinzena. */}
      <div className="stat-sec-title">
        Histórico · últimos 30 dias
        <span className="stat-sec-note">atravessa quinzenas — não é o que você vai receber</span>
      </div>
      <div className="stat-grid">
        <div className="stat-card sc-green">
          <div className="stat-label">Valor Conferido</div>
          <div className="stat-value sv-green" style={{ fontSize: 20 }}>{fmtMoeda(valor30)}</div>
          <div className="stat-sub">{fmtNum(total30)} un. produzidas{diasSemConf > 0 ? ` · ${diasSemConf} ${diasSemConf === 1 ? 'dia aguarda' : 'dias aguardam'} conferência` : ''}</div>
        </div>
        <div className="stat-card sc-blue">
          <div className="stat-label">Média Diária</div>
          <div className="stat-value sv-blue">{fmtNum(media30)}</div>
          <div className="stat-sub">un. por dia</div>
        </div>
        <div className="stat-card sc-amber">
          <div className="stat-label">Dias na Meta</div>
          <div className="stat-value sv-amber">{diasMeta}/{meusRegs.length}</div>
          <div className="stat-sub">dias registrados em 30 dias</div>
        </div>
        <div className="stat-card sc-red">
          <div className="stat-label">Perda</div>
          <div className="stat-value sv-red">{fmtNum(perda30)}</div>
          <div className="stat-sub">descarte na conferência · não desconta do seu pagamento</div>
        </div>
      </div>

      {/* Programa de Parceria — quinzena com a conta aberta */}
      {!isFinalizacao && <ParceriaQuinzena parceria={parceria} qz={qz} modalidade={modalidade} cfg={cfg} difDeclaradoQz={difDeclaradoQz} declaradoConfQz={declaradoConfQz} entregueQz={entregueQz} diasEntregaQz={diasEntregaQz} ajudaQz={ajudaQz} totalQzReceber={totalQzReceber} aguardandoQz={aguardandoQz} />}

      {/* Prêmios do programa — qualificação e acumulado do ano */}
      {!isFinalizacao && meuPremio && <PremiosPrograma meuPremio={meuPremio} meusPremios={meusPremios} cfg={cfg} anoAtual={anoAtual} />}

      <div className="g2">
        {/* Ranking do dia */}
        <RankingDoDia carregandoHoje={carregandoHoje} rankHoje={rankHoje} funcId={funcId} funcionarios={funcionarios} />

        {/* Minha evolução */}
        <MinhaEvolucao f={f} carregandoMeus={carregandoMeus} meusRegs={meusRegs} confLinha={confLinha} setContestando={setContestando} />
      </div>

      {/* Modal Contestar Revisão */}
      {contestando && (
        <Modal title="⚑ Contestar Conferência" onClose={() => { setContestando(null); setMotivoCont('') }} width={460}>
          <div style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 10 }}>
            Dia {fmtData(contestando.data)} · Perda registrada: <strong style={{ color: 'var(--red)' }}>{fmtNum(contestando.perda || 0)} un.</strong>
          </div>
          <Campo label="Motivo da contestação *"><textarea rows={3} value={motivoCont} placeholder="Ex: entreguei 3.000 unidades contadas, a perda registrada não bate..." onChange={e => setMotivoCont(e.target.value)} /></Campo>
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
