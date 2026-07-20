import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export const calcValor = (qty, valorMil) => ((qty || 0) / 1000) * (valorMil || 75)

export const fmtMoeda = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0)

export const fmtNum = (n) =>
  new Intl.NumberFormat('pt-BR').format(Math.round(n ?? 0))

export const getHoje = () => format(new Date(), 'yyyy-MM-dd')
export const getOntem = () => format(subDays(new Date(), 1), 'yyyy-MM-dd')

export const fmtData = (d, fmt = 'dd/MM/yyyy') => {
  if (!d) return '—'
  return format(new Date(d + 'T12:00'), fmt, { locale: ptBR })
}

export const fmtDataLonga = (d) =>
  fmtData(d, "EEEE, dd 'de' MMMM 'de' yyyy")

export const getIniciais = (nome = '') =>
  nome.split(' ').slice(0, 2).map((x) => x[0] || '').join('').toUpperCase()

const CORES = ['#C9A227', '#3B82F6', '#28B485', '#8B5CF6', '#F59E0B', '#06B6D4']
export const avatarCor = (id) => CORES[(id || 0) % CORES.length]

export const pctMeta = (qty, meta) => (meta > 0 ? Math.round((qty / meta) * 100) : 0)

// Funcionário do setor de produção (enrolador) — registros antigos sem setor contam como produção
export const isProducao = (f) => (f?.setor || 'producao') === 'producao'

// Sugere empacotamento: quantas displays/maços cabem e o que sobra avulso
export const sugerirEmpacote = (qtd, uniDisplay, uniMaco) => {
  const displays = Math.floor((qtd || 0) / uniDisplay)
  const resto = (qtd || 0) % uniDisplay
  const macos = Math.floor(resto / uniMaco)
  const avulso = resto % uniMaco
  return { displays, macos, avulso }
}

export const corPct = (p) => {
  if (p >= 100) return 'var(--green)'
  if (p >= 70) return 'var(--gold-light)'
  if (p > 0) return 'var(--amber)'
  return 'var(--red)'
}

export const getSemana = (dateStr) => {
  const d = new Date(dateStr + 'T12:00')
  return {
    inicio: format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    fim: format(endOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
  }
}

export const getMes = (mesStr) => {
  const d = new Date(mesStr + '-15')
  return {
    inicio: format(startOfMonth(d), 'yyyy-MM-dd'),
    fim: format(endOfMonth(d), 'yyyy-MM-dd'),
  }
}

// Retorna o período da quinzena (1ª: 9-24 do mês atual; 2ª: 25 ao 10 do próximo)
// A 2ª quinzena detecta automaticamente: se hoje >= 25, pega a corrente; senão, a anterior
export const getQuinzena = (num) => {
  const hoje = new Date()
  const dia = hoje.getDate()
  const ano = hoje.getFullYear()
  const mes = hoje.getMonth()
  if (num === 1) {
    return {
      inicio: format(new Date(ano, mes, 9), 'yyyy-MM-dd'),
      fim: format(new Date(ano, mes, 24), 'yyyy-MM-dd'),
    }
  }
  if (dia >= 25) {
    return {
      inicio: format(new Date(ano, mes, 25), 'yyyy-MM-dd'),
      fim: format(new Date(ano, mes + 1, 10), 'yyyy-MM-dd'),
    }
  }
  return {
    inicio: format(new Date(ano, mes - 1, 25), 'yyyy-MM-dd'),
    fim: format(new Date(ano, mes, 10), 'yyyy-MM-dd'),
  }
}

export const ultimosDias = (n) =>
  Array.from({ length: n }, (_, i) =>
    format(subDays(new Date(), n - 1 - i), 'yyyy-MM-dd')
  )

export const exportCSV = (rows, filename) => {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export const exportXLSX = (sheets, filename) => {
  import('xlsx').then((XLSX) => {
    const wb = XLSX.utils.book_new()
    sheets.forEach(({ name, rows }) => {
      const ws = XLSX.utils.aoa_to_sheet(rows)
      XLSX.utils.book_append_sheet(wb, ws, name)
    })
    XLSX.writeFile(wb, filename)
  })
}
