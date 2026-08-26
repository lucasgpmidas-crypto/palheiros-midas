import { useState, useMemo } from 'react'
import Campo from '../components/Campo'
import { useFuncionarios, useConfig, usePremios, useApuracaoPremios } from '../lib/hooks'
import { useAuth } from '../lib/auth'
import { fmtMoeda, fmtData, fmtMilheiros, corQualidade, calcDestaqueAno, getHoje, getIniciais, avatarCor } from '../lib/utils'
import ConfirmModal from '../components/ConfirmModal'

const TIPOS = {
  qualificacao:  ['🎓', 'Qualificação'],
  padrinho:      ['🤝', 'Padrinho'],
  produtividade: ['📈', 'Produtividade'],
  fidelidade:    ['💛', 'Fidelidade'],
  qualidade:     ['✨', 'Qualidade Anual'],
  destaque:      ['🏆', 'Destaque do Ano'],
}

const pctFmt = (q) => q == null ? '—' : q.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'

// Chip de uma das 6 quinzenas da qualificação
function ChipQuinzena({ item, cfg }) {
  const cor = item.status === 'cumprida' ? 'var(--green)' : item.status === 'falhou' ? 'var(--red)' : 'var(--text3)'
  const icone = item.status === 'cumprida' ? '✔' : item.status === 'falhou' ? '✕' : '⏳'
  return (
    <div title={`${fmtData(item.inicio)} a ${fmtData(item.fim)} — exigido: ${item.etapa.vol} mil e ${item.etapa.qual}% de qualidade`}
      style={{ background: 'var(--bg3)', border: `1px solid ${cor}33`, borderRadius: 'var(--rs)', padding: '6px 9px', minWidth: 92 }}>
      <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: .5 }}>
        {item.ordem}ª quinzena
      </div>
      <div style={{ color: cor, fontWeight: 800, fontSize: 13 }}>
        {icone} {fmtMilheiros(item.milheiros)} mil
      </div>
      <div style={{ fontSize: 11, color: item.qualidade == null ? 'var(--text3)' : corQualidade(item.qualidade, cfg) }}>
        {pctFmt(item.qualidade)}
      </div>
    </div>
  )
}

export default function Premios() {
  const { session } = useAuth()
  const cfg = useConfig()
  const { funcionarios, loading: loadingFunc } = useFuncionarios()
  const { premios, loading: loadingPremios, conceder, atualizar, excluir } = usePremios()

  const anoAtual = new Date().getFullYear()
  const [ano, setAno] = useState(anoAtual)
  const [verTodos, setVerTodos] = useState(false)
  const [concedendo, setConcedendo] = useState(null)
  const [excluindo, setExcluindo] = useState(null)

  const { linhas, loading } = useApuracaoPremios({ ano, funcionarios, cfg })
  const admin = session?.user?.email?.split('@')[0] || 'Admin'

  const destaque = useMemo(() => calcDestaqueAno(linhas, cfg), [linhas, cfg])
  const nomePorId = useMemo(() => Object.fromEntries(funcionarios.map(f => [f.id, f.nome])), [funcionarios])

  // Um prêmio já concedido não é recalculado — vale o valor registrado na concessão
  const concedido = (funcId, tipo, referencia) =>
    premios.find(p => p.func_id === funcId && p.tipo === tipo && p.referencia === referencia)

  const registrar = async () => {
    const c = concedendo
    setConcedendo(null)
    await conceder({
      func_id: c.funcId, tipo: c.tipo, referencia: c.referencia,
      valor: c.valor, obs: c.obs || null, registrado_por: admin,
    })
  }

  const pagar = (p) => atualizar(p.id, { status: 'pago', data_pagamento: getHoje() })

  // Qualificação: quem ainda está nas 6 primeiras quinzenas, ou fechou e tem prêmio a conceder
  const emQualificacao = linhas.filter(l => {
    if (!l.qualif.itens.length) return false
    if (verTodos) return true
    if (l.qualif.emAndamento || l.qualif.aprovado) return true
    return !!concedido(l.f.id, 'qualificacao', l.qualif.referencia)
  })

  const linhasAno = linhas.filter(l => l.anual.milheiros > 0).sort((a, b) => b.anual.milheiros - a.anual.milheiros)
  const provisao = linhasAno.reduce((s, l) =>
    s + (l.anual.produtividade.valor) + (l.anual.fidelidade.elegivel ? l.anual.fidelidade.valor : 0) + (l.anual.qualidade.elegivel ? l.anual.qualidade.valor : 0), 0)
  const totalPago = premios.filter(p => p.status === 'pago').reduce((s, p) => s + Number(p.valor || 0), 0)
  const totalPendente = premios.filter(p => p.status === 'pendente').reduce((s, p) => s + Number(p.valor || 0), 0)

  const btnConceder = (funcId, tipo, referencia, valor, obs, label) => {
    const já = concedido(funcId, tipo, referencia)
    if (já) return <span className={`badge ${já.status === 'pago' ? 'b-green' : 'b-gold'}`}>{já.status === 'pago' ? '✓ Pago' : '🏅 Concedido'}</span>
    return (
      <button className="btn btn-primary btn-xs" onClick={() => setConcedendo({ funcId, tipo, referencia, valor, obs, nome: nomePorId[funcId] })}>
        {label || `Conceder ${fmtMoeda(valor)}`}
      </button>
    )
  }

  return (
    <div>
      <div className="card mb16">
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <Campo label="Ano de apuração" style={{ margin: 0 }}><select value={ano} onChange={e => setAno(Number(e.target.value))} style={{ width: 130 }}>
              {[anoAtual + 1, anoAtual, anoAtual - 1, anoAtual - 2].map(a => <option key={a} value={a}>{a}</option>)}
            </select></Campo>
          <div>
            <div style={{ fontSize: 10.5, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>Provisão de prêmios anuais</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--gold-light)', fontFamily: 'Barlow Condensed,sans-serif' }}>{fmtMoeda(provisao)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10.5, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>Concedido, a pagar</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--amber)', fontFamily: 'Barlow Condensed,sans-serif' }}>{fmtMoeda(totalPendente)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10.5, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1 }}>Já pago</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--green)', fontFamily: 'Barlow Condensed,sans-serif' }}>{fmtMoeda(totalPago)}</div>
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 10 }}>
          ℹ️ A apuração usa o <strong>entregue na conferência</strong> — a mesma base do pagamento. A provisão é uma estimativa que muda até o fim do ano;
          o valor só congela quando o prêmio é concedido.
        </div>
      </div>

      {/* ── Qualificação de novos parceiros ───────────────────────────────── */}
      <div className="card mb16">
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <span>🎓 Qualificação de Parceiro — 6 primeiras quinzenas</span>
          <label style={{ fontSize: 12, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
            <input type="checkbox" checked={verTodos} onChange={e => setVerTodos(e.target.checked)} style={{ width: 'auto', margin: 0 }} />
            mostrar quem não qualificou
          </label>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 14 }}>
          Exigência crescente: {cfg.qualifVol1} mil e {cfg.qualifQual1}% nas 2 primeiras · {cfg.qualifVol2} mil e {cfg.qualifQual2}% na 3ª e 4ª ·
          {' '}{cfg.qualifVol3} mil e {cfg.qualifQual3}% na 5ª e 6ª. Precisa cumprir <strong>todas as seis</strong> —
          o prêmio de {fmtMoeda(cfg.premioQualificacao)} sai no fechamento da 6ª quinzena, e o padrinho leva {fmtMoeda(cfg.premioPadrinho)}.
        </div>

        {loading || loadingFunc ? <div className="loading"><div className="spin" /></div>
          : emQualificacao.length === 0
            ? <div className="empty-state"><div className="es-icon">🎓</div><div className="es-text">Nenhum parceiro em qualificação. Defina o "início na parceria" no cadastro do funcionário para acompanhar as 6 primeiras quinzenas.</div></div>
            : <div style={{ display: 'grid', gap: 14 }}>
                {emQualificacao.map(({ f, qualif }) => {
                  const padrinhoId = f.padrinho_id
                  const refPad = padrinhoId ? `${qualif.referencia}/af${f.id}` : null
                  return (
                    <div key={f.id} style={{ background: 'var(--bg3)', borderRadius: 'var(--rs)', padding: 14 }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                        <div style={{ width: 34, height: 34, borderRadius: '50%', background: avatarCor(f.id), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#0F1420' }}>
                          {getIniciais(f.nome)}
                        </div>
                        <div style={{ flex: 1, minWidth: 160 }}>
                          <strong style={{ color: 'var(--text)' }}>{f.nome}</strong>
                          <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                            No programa desde {fmtData(f.parceria_desde)}
                            {padrinhoId && <> · padrinho: <strong style={{ color: 'var(--text2)' }}>{nomePorId[padrinhoId] || '—'}</strong></>}
                          </div>
                        </div>
                        <span className={`badge ${qualif.aprovado ? 'b-green' : qualif.falhou ? 'b-red' : 'b-gold'}`}>
                          {qualif.aprovado ? '✓ Qualificado' : qualif.falhou ? '✕ Não qualificou' : `⏳ ${qualif.cumpridas}/6 cumpridas`}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                        {qualif.itens.map(item => <ChipQuinzena key={item.ordem} item={item} cfg={cfg} />)}
                      </div>

                      {qualif.aprovado && (
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>Prêmio de qualificação:</span>
                          {btnConceder(f.id, 'qualificacao', qualif.referencia, cfg.premioQualificacao, `Qualificação concluída em ${fmtData(qualif.referencia)}`)}
                          {padrinhoId && (
                            <>
                              <span style={{ fontSize: 12.5, color: 'var(--text2)', marginLeft: 8 }}>Padrinho ({nomePorId[padrinhoId]}):</span>
                              {btnConceder(padrinhoId, 'padrinho', refPad, cfg.premioPadrinho, `Padrinho de ${f.nome}`)}
                            </>
                          )}
                        </div>
                      )}
                      {qualif.falhou && (
                        <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                          Não atingiu volume ou qualidade em ao menos uma quinzena — o prêmio de qualificação não é devido.
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
        }
      </div>

      {/* ── Prêmios anuais ─────────────────────────────────────────────────── */}
      <div className="card mb16">
        <div className="card-title">🏆 Prêmios Anuais — {ano}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 14 }}>
          Produtividade a partir de {cfg.premioProdV1} mil ({fmtMoeda(cfg.premioProdP1)}), {cfg.premioProdV2} mil ({fmtMoeda(cfg.premioProdP2)}) e {cfg.premioProdV3} mil ({fmtMoeda(cfg.premioProdP3)}) ·
          Fidelidade: {cfg.premioFidMin}+ mil no ano, vale o faturamento do ano ÷ 24 × 2 ·
          Qualidade: {fmtMoeda(cfg.premioQualAnual)} para quem ficou acima de {cfg.qualPremium}% em todas as quinzenas com {cfg.premioQualMin}+ mil.
        </div>

        {loading ? <div className="loading"><div className="spin" /></div>
          : linhasAno.length === 0
            ? <div className="empty-state"><div className="es-icon">🏆</div><div className="es-text">Nenhuma produção conferida em {ano}</div></div>
            : <div className="table-wrap"><table>
                <thead><tr>
                  <th>Parceiro</th><th>Volume no ano</th><th>Qualidade média</th><th>Quinzenas</th><th>Faturamento</th>
                  <th>📈 Produtividade</th><th>💛 Fidelidade</th><th>✨ Qualidade</th><th>🏆 Destaque</th>
                </tr></thead>
                <tbody>
                  {linhasAno.map(({ f, anual }) => {
                    const éDestaque = destaque?.f.id === f.id
                    return (
                      <tr key={f.id}>
                        <td>
                          <strong style={{ color: 'var(--text)' }}>{f.nome}</strong>
                          <div style={{ fontSize: 10.5, color: 'var(--text3)' }}>{(f.modalidade || 'cp') === 'externo' ? '🏠 Externo' : '🏭 CP Barretos'}</div>
                        </td>
                        <td><strong style={{ color: 'var(--gold-light)' }}>{fmtMilheiros(anual.milheiros)} mil</strong></td>
                        <td style={{ color: corQualidade(anual.qualidadeMedia, cfg), fontWeight: 700 }}>{pctFmt(anual.qualidadeMedia)}</td>
                        <td style={{ color: 'var(--text3)' }}>
                          {anual.quinzenasComEntrega}/24
                          {anual.quinzenasSemEntrega > 0 && <div style={{ fontSize: 10.5, color: 'var(--amber)' }}>{anual.quinzenasSemEntrega} sem entrega</div>}
                        </td>
                        <td style={{ color: 'var(--text2)' }}>{fmtMoeda(anual.faturamento)}</td>
                        <td>{anual.produtividade.elegivel
                          ? <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <span style={{ color: 'var(--green)', fontWeight: 700 }}>{fmtMoeda(anual.produtividade.valor)}</span>
                              {btnConceder(f.id, 'produtividade', String(ano), anual.produtividade.valor, `${fmtMilheiros(anual.milheiros)} milheiros em ${ano}`, 'Conceder')}
                            </div>
                          : <span style={{ color: 'var(--text3)' }}>faltam {fmtMilheiros(cfg.premioProdV1 - anual.milheiros)} mil</span>}
                        </td>
                        <td>{anual.fidelidade.elegivel
                          ? <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <span style={{ color: 'var(--green)', fontWeight: 700 }} title="Faturamento do ano ÷ 24 × 2">{fmtMoeda(anual.fidelidade.valor)}</span>
                              {!anual.fidelidade.continuo && <span style={{ fontSize: 10.5, color: 'var(--amber)' }}>⚠ fornecimento com falhas</span>}
                              {btnConceder(f.id, 'fidelidade', String(ano), anual.fidelidade.valor, `Fidelidade ${ano} — média quinzenal × 2`, 'Conceder')}
                            </div>
                          : <span style={{ color: 'var(--text3)' }}>volume abaixo de {cfg.premioFidMin} mil</span>}
                        </td>
                        <td>{anual.qualidade.elegivel
                          ? <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <span style={{ color: 'var(--green)', fontWeight: 700 }}>{fmtMoeda(anual.qualidade.valor)}</span>
                              {btnConceder(f.id, 'qualidade', String(ano), anual.qualidade.valor, `Qualidade acima de ${cfg.qualPremium}% em todas as quinzenas de ${ano}`, 'Conceder')}
                            </div>
                          : <span style={{ color: 'var(--text3)' }}>{!anual.qualidade.volumeOk ? `abaixo de ${cfg.premioQualMin} mil` : 'quinzena abaixo do padrão'}</span>}
                        </td>
                        <td>{éDestaque
                          ? <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <span style={{ color: 'var(--gold-light)', fontWeight: 800 }}>🏆 Destaque</span>
                              {btnConceder(f.id, 'destaque', String(ano), 0, `Parceiro Destaque de ${ano} (prêmio físico)`, 'Registrar')}
                            </div>
                          : <span style={{ color: 'var(--text3)' }}>—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table></div>
        }
      </div>

      {/* ── Concedidos ─────────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-title">📋 Prêmios Concedidos</div>
        {loadingPremios ? <div className="loading"><div className="spin" /></div>
          : premios.length === 0
            ? <div className="empty-state"><div className="es-icon">🏅</div><div className="es-text">Nenhum prêmio concedido ainda</div></div>
            : <div className="table-wrap"><table>
                <thead><tr><th>Parceiro</th><th>Prêmio</th><th>Referência</th><th>Valor</th><th>Status</th><th>Obs.</th><th>Ações</th></tr></thead>
                <tbody>{premios.map(p => {
                  const [icone, label] = TIPOS[p.tipo] || ['🏅', p.tipo]
                  return (
                    <tr key={p.id}>
                      <td><strong style={{ color: 'var(--text)' }}>{p.funcionarios?.nome || nomePorId[p.func_id] || '—'}</strong></td>
                      <td>{icone} {label}</td>
                      <td style={{ color: 'var(--text3)' }}>{p.referencia}</td>
                      <td><strong style={{ color: 'var(--green)' }}>{Number(p.valor) > 0 ? fmtMoeda(p.valor) : 'prêmio físico'}</strong></td>
                      <td>
                        <span className={`badge ${p.status === 'pago' ? 'b-green' : 'b-amber'}`}>{p.status === 'pago' ? '✓ Pago' : '⏳ A pagar'}</span>
                        {p.data_pagamento && <div style={{ fontSize: 10.5, color: 'var(--text3)' }}>{fmtData(p.data_pagamento)}</div>}
                      </td>
                      <td style={{ color: 'var(--text3)', fontSize: 12, maxWidth: 260, whiteSpace: 'normal' }}>{p.obs || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {p.status !== 'pago' && <button className="btn btn-primary btn-xs" onClick={() => pagar(p)}>✓ Marcar pago</button>}
                          <button className="btn btn-danger btn-xs" onClick={() => setExcluindo(p)}>🗑</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}</tbody>
              </table></div>
        }
      </div>

      {concedendo && (
        <ConfirmModal
          title="Conceder prêmio?"
          onConfirm={registrar}
          onCancel={() => setConcedendo(null)}
          details={[
            ['Parceiro', concedendo.nome || '—'],
            ['Prêmio', (TIPOS[concedendo.tipo] || ['', concedendo.tipo])[1]],
            ['Valor', concedendo.valor > 0 ? fmtMoeda(concedendo.valor) : 'prêmio físico (sem valor em R$)'],
            ['Efeito', 'O valor congela na concessão e entra na lista de prêmios a pagar'],
          ]}
        />
      )}

      {excluindo && (
        <ConfirmModal
          title="Remover prêmio concedido?"
          onConfirm={async () => { await excluir(excluindo.id); setExcluindo(null) }}
          onCancel={() => setExcluindo(null)}
          details={[
            ['Parceiro', excluindo.funcionarios?.nome || '—'],
            ['Prêmio', (TIPOS[excluindo.tipo] || ['', excluindo.tipo])[1]],
            ['Atenção', 'Use só para corrigir uma concessão errada — a remoção fica na auditoria'],
          ]}
        />
      )}
    </div>
  )
}
