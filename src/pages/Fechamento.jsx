import { useState, useMemo } from 'react'
import { useFechamentos, useAuditoria, useConfig } from '../lib/hooks'
import { useAuth } from '../lib/auth'
import { getHoje, fmtNum, fmtData, getQuinzenaAtual } from '../lib/utils'
import ConfirmModal from '../components/ConfirmModal'
import toast from 'react-hot-toast'

const TABELAS = [
  ['', 'Todas'],
  ['registros_producao', 'Produção'],
  ['controle_qualidade', 'Revisão & Empacote'],
  ['expedicoes', 'Expedições'],
  ['funcionarios', 'Funcionários'],
]
const NOME_TABELA = Object.fromEntries(TABELAS.filter(([v]) => v))
const NOME_ACAO = { insert: ['➕ criou', 'var(--green)'], update: ['✏️ alterou', 'var(--amber)'], delete: ['🗑 excluiu', 'var(--red)'] }
const CAMPOS_IGNORADOS = new Set(['id', 'created_at', 'func_id'])

// Resume um update: só os campos que mudaram, "antes → depois"
function resumoMudanca(ev) {
  if (ev.acao === 'update' && ev.antes && ev.depois) {
    const difs = Object.keys(ev.depois)
      .filter(k => !CAMPOS_IGNORADOS.has(k) && JSON.stringify(ev.antes[k]) !== JSON.stringify(ev.depois[k]))
      .map(k => `${k}: ${ev.antes[k] ?? '—'} → ${ev.depois[k] ?? '—'}`)
    return difs.length ? difs.join(' · ') : '(sem mudança de campos)'
  }
  const d = ev.depois || ev.antes || {}
  const partes = []
  if (d.data) partes.push(fmtData(d.data))
  if (d.nome) partes.push(d.nome)
  if (d.quantidade != null) partes.push(fmtNum(d.quantidade) + ' un.')
  if (d.entregue != null) partes.push('entregue ' + fmtNum(d.entregue))
  if (d.displays != null) partes.push(fmtNum(d.displays) + ' displays')
  return partes.join(' · ') || '—'
}

export default function Fechamento() {
  const hoje = getHoje()
  const { session } = useAuth()
  const { quinzenaD1, quinzenaD2 } = useConfig()
  const { fechamentos, fechadoAte, loading, fechar, reabrir } = useFechamentos()

  const admin = session?.user?.email?.split('@')[0] || 'Admin'
  const qzAtual = getQuinzenaAtual(quinzenaD1, quinzenaD2)

  // Sugestão: fechar até o dia anterior ao início da quinzena atual
  const sugestaoFim = useMemo(() => {
    const d = new Date(qzAtual.inicio + 'T12:00')
    d.setDate(d.getDate() - 1)
    return d.toISOString().split('T')[0]
  }, [qzAtual.inicio])

  const [form, setForm] = useState({ inicio: '', fim: '', obs: '' })
  const [confirmando, setConfirmando] = useState(false)
  const [reabrindo, setReabrindo] = useState(null)

  const [filtroTabela, setFiltroTabela] = useState('')
  const { eventos, loading: loadingAud } = useAuditoria({ tabela: filtroTabela || undefined, limite: 100 })

  const handleFechar = async () => {
    setConfirmando(false)
    const ok = await fechar({ data_inicio: form.inicio, data_fim: form.fim, obs: form.obs || null, fechado_por: admin })
    if (ok) setForm({ inicio: '', fim: '', obs: '' })
  }

  const validar = () => {
    if (!form.inicio || !form.fim) { toast.error('Informe início e fim do período'); return }
    if (form.fim < form.inicio) { toast.error('Fim não pode ser antes do início'); return }
    if (form.fim >= hoje) { toast.error('Só é possível fechar períodos já encerrados (fim antes de hoje)'); return }
    setConfirmando(true)
  }

  const usarSugestao = () => {
    const ultimoFim = fechadoAte
    const inicioSug = ultimoFim
      ? new Date(new Date(ultimoFim + 'T12:00').getTime() + 86400000).toISOString().split('T')[0]
      : ''
    setForm(f => ({ ...f, inicio: inicioSug || f.inicio, fim: sugestaoFim }))
  }

  return (
    <div>
      {/* Status da trava */}
      <div className={`alert ${fechadoAte ? 'a-success' : 'a-warn'}`} style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 17 }}>{fechadoAte ? '🔒' : '🔓'}</div>
        <div>
          <strong>{fechadoAte ? `Folha travada até ${fmtData(fechadoAte)}` : 'Nenhum período fechado ainda'}</strong>
          <span>{fechadoAte
            ? 'Registros de produção e revisão até essa data não podem ser alterados nem excluídos — nem por admins.'
            : 'Depois de pagar uma quinzena, feche o período para proteger os registros contra alterações.'}</span>
        </div>
      </div>

      {/* Fechar período */}
      <div className="card mb16">
        <div className="card-title">🔒 Fechar Período de Folha</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="fg" style={{ margin: 0 }}>
            <label>Início</label>
            <input type="date" value={form.inicio} max={form.fim || hoje} onChange={e => setForm(f => ({ ...f, inicio: e.target.value }))} />
          </div>
          <div className="fg" style={{ margin: 0 }}>
            <label>Fim</label>
            <input type="date" value={form.fim} min={form.inicio} onChange={e => setForm(f => ({ ...f, fim: e.target.value }))} />
          </div>
          <div className="fg" style={{ margin: 0, flex: 1, minWidth: 160 }}>
            <label>Observação</label>
            <input value={form.obs} placeholder="Ex: quinzena paga em 24/07" onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} />
          </div>
          <button className="btn btn-secondary btn-sm" onClick={usarSugestao} title={`Preenche até ${fmtData(sugestaoFim)} (dia anterior à quinzena atual)`}>💡 Sugerir</button>
          <button className="btn btn-primary" onClick={validar} style={{ height: 40 }}>🔒 Fechar</button>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 8 }}>
          ℹ️ A trava vale para a folha (produção e revisão). Fechamentos nunca são apagados — no máximo reabertos, e tudo fica registrado.
        </div>
      </div>

      {/* Histórico de fechamentos */}
      <div className="card mb16">
        <div className="card-title">📋 Fechamentos</div>
        {loading ? <div className="loading"><div className="spin" /></div>
          : fechamentos.length === 0
            ? <div className="empty-state"><div className="es-icon">🔓</div><div className="es-text">Nenhum fechamento registrado</div></div>
            : <div className="table-wrap"><table>
                <thead><tr><th>Período</th><th>Status</th><th>Fechado por</th><th>Reaberto por</th><th>Obs.</th><th>Em</th><th>Ações</th></tr></thead>
                <tbody>{fechamentos.map(f => (
                  <tr key={f.id}>
                    <td><strong style={{ color: 'var(--text)' }}>{fmtData(f.data_inicio)} a {fmtData(f.data_fim)}</strong></td>
                    <td><span className={`badge ${f.status === 'fechado' ? 'b-green' : 'b-amber'}`}>{f.status === 'fechado' ? '🔒 Fechado' : '🔓 Reaberto'}</span></td>
                    <td style={{ color: 'var(--text3)' }}>{f.fechado_por || '—'}</td>
                    <td style={{ color: 'var(--text3)' }}>{f.reaberto_por || '—'}</td>
                    <td style={{ color: 'var(--text3)' }}>{f.obs || '—'}</td>
                    <td style={{ color: 'var(--text3)' }}>{fmtData(f.created_at?.split('T')[0])}</td>
                    <td>{f.status === 'fechado' && (
                      <button className="btn btn-danger btn-xs" onClick={() => setReabrindo(f)}>🔓 Reabrir</button>
                    )}</td>
                  </tr>
                ))}</tbody>
              </table></div>
        }
      </div>

      {/* Auditoria */}
      <div className="card">
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <span>🕵️ Auditoria — últimas 100 ações</span>
          <select value={filtroTabela} onChange={e => setFiltroTabela(e.target.value)} style={{ width: 200 }}>
            {TABELAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        {loadingAud ? <div className="loading"><div className="spin" /></div>
          : eventos.length === 0
            ? <div className="empty-state"><div className="es-icon">🕵️</div><div className="es-text">Nenhum evento registrado ainda (o log começa a partir da ativação da auditoria)</div></div>
            : <div className="table-wrap"><table>
                <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Onde</th><th>Detalhes</th></tr></thead>
                <tbody>{eventos.map(ev => {
                  const [acaoLabel, acaoCor] = NOME_ACAO[ev.acao] || [ev.acao, 'var(--text3)']
                  return (
                    <tr key={ev.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{new Date(ev.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                      <td style={{ color: 'var(--text2)' }}>{ev.usuario || '—'}</td>
                      <td><span style={{ color: acaoCor, fontWeight: 700 }}>{acaoLabel}</span></td>
                      <td style={{ color: 'var(--text3)' }}>{NOME_TABELA[ev.tabela] || ev.tabela}</td>
                      <td style={{ color: 'var(--text3)', fontSize: 12, maxWidth: 420, whiteSpace: 'normal' }}>{resumoMudanca(ev)}</td>
                    </tr>
                  )
                })}</tbody>
              </table></div>
        }
      </div>

      {/* Confirmar fechamento */}
      {confirmando && (
        <ConfirmModal
          title="Fechar período da folha?"
          onConfirm={handleFechar}
          onCancel={() => setConfirmando(false)}
          details={[
            ['Período', `${fmtData(form.inicio)} a ${fmtData(form.fim)}`],
            ['Efeito', 'Produção e revisão dessas datas ficam travadas'],
            ['Reversível', 'Sim, reabrindo o fechamento (fica registrado)'],
          ]}
        />
      )}

      {/* Confirmar reabertura */}
      {reabrindo && (
        <ConfirmModal
          title="Reabrir período fechado?"
          onConfirm={async () => { await reabrir(reabrindo.id, admin); setReabrindo(null) }}
          onCancel={() => setReabrindo(null)}
          details={[
            ['Período', `${fmtData(reabrindo.data_inicio)} a ${fmtData(reabrindo.data_fim)}`],
            ['Efeito', 'Os registros do período voltam a poder ser editados'],
            ['Registro', `A reabertura fica gravada em seu nome (${admin})`],
          ]}
        />
      )}
    </div>
  )
}
