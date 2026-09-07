import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export const fmtMoeda = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0)

// Valor de um dia só existe depois que o lote foi conferido. Sem conferência não há
// número a mostrar — mostrar o declarado faria o funcionário contar com dinheiro que
// ainda não foi contado, e a regra do programa paga o entregue.
export const fmtValorDia = (v) =>
  v == null || v === '' ? '⏳ aguardando conferência' : fmtMoeda(v)

export const fmtNum = (n) =>
  new Intl.NumberFormat('pt-BR').format(Math.round(n ?? 0))

export const fmtData = (d, fmt = 'dd/MM/yyyy') => {
  if (!d) return '—'
  return format(new Date(d + 'T12:00'), fmt, { locale: ptBR })
}

export const fmtDataLonga = (d) =>
  fmtData(d, "EEEE, dd 'de' MMMM 'de' yyyy")

export const fmtMilheiros = (m) =>
  (m ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })

export const getIniciais = (nome = '') =>
  nome.split(' ').slice(0, 2).map((x) => x[0] || '').join('').toUpperCase()

const CORES = ['#C9A227', '#3B82F6', '#28B485', '#8B5CF6', '#F59E0B', '#06B6D4']

export const avatarCor = (id) => CORES[(id || 0) % CORES.length]

export const corPct = (p) => {
  if (p >= 100) return 'var(--green)'
  if (p >= 70) return 'var(--gold-light)'
  if (p > 0) return 'var(--amber)'
  return 'var(--red)'
}

export const corQualidade = (q, cfg) =>
  q == null ? 'var(--text3)' : q >= cfg.qualPremium ? 'var(--green)' : q >= cfg.qualMinima ? 'var(--amber)' : 'var(--red)'
