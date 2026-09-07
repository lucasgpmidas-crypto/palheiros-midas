import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'

export const getHoje = () => format(new Date(), 'yyyy-MM-dd')

export const getOntem = () => format(subDays(new Date(), 1), 'yyyy-MM-dd')

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

// Quinzenas de pagamento. Os dias de corte vêm das Configurações (chaves
// quinzena_d1/quinzena_d2): d1 = dia que abre a 1ª quinzena, d2 = dia que abre a 2ª.
// 1ª: d1 até (d2−1) do mesmo mês · 2ª: d2 até (d1−1) do mês seguinte — sem sobreposição.
export const getQuinzena = (num, d1 = 8, d2 = 23) => {
  const hoje = new Date()
  const dia = hoje.getDate()
  const ano = hoje.getFullYear()
  const mes = hoje.getMonth()
  if (num === 1) {
    return {
      inicio: format(new Date(ano, mes, d1), 'yyyy-MM-dd'),
      fim: format(new Date(ano, mes, d2 - 1), 'yyyy-MM-dd'),
    }
  }
  if (dia >= d2) {
    return {
      inicio: format(new Date(ano, mes, d2), 'yyyy-MM-dd'),
      fim: format(new Date(ano, mes + 1, d1 - 1), 'yyyy-MM-dd'),
    }
  }
  return {
    inicio: format(new Date(ano, mes - 1, d2), 'yyyy-MM-dd'),
    fim: format(new Date(ano, mes, d1 - 1), 'yyyy-MM-dd'),
  }
}

// Quinzena que contém a data de hoje
export const getQuinzenaAtual = (d1 = 8, d2 = 23) => {
  const dia = new Date().getDate()
  const num = dia >= d1 && dia < d2 ? 1 : 2
  return { ...getQuinzena(num, d1, d2), num }
}

// As 24 quinzenas de um ano-calendário, com os mesmos dias de corte das
// Configurações — base das apurações anuais de prêmios. Com o corte da operação
// (d1=8, d2=23) o "ano" de apuração vai de 8 de janeiro a 7 de janeiro seguinte:
// os sete primeiros dias do ano caem na última quinzena do ano anterior, que é
// onde eles são pagos. Só um corte em d1=1 faria o ano fechar no calendário.
export const getQuinzenasAno = (ano, d1 = 8, d2 = 23) => {
  const out = []
  for (let m = 0; m < 12; m++) {
    out.push({
      ordem: m * 2 + 1,
      inicio: format(new Date(ano, m, d1), 'yyyy-MM-dd'),
      fim: format(new Date(ano, m, d2 - 1), 'yyyy-MM-dd'),
    })
    out.push({
      ordem: m * 2 + 2,
      inicio: format(new Date(ano, m, d2), 'yyyy-MM-dd'),
      fim: format(new Date(ano, m + 1, d1 - 1), 'yyyy-MM-dd'),
    })
  }
  return out
}

// As n primeiras quinzenas a partir da data de ingresso do parceiro (a quinzena
// que contém a data já conta como a 1ª). Usada na qualificação, que pode
// atravessar a virada do ano — por isso varre o ano anterior e o seguinte.
export const getQuinzenasDesde = (dataIni, n, d1 = 8, d2 = 23) => {
  const ano = Number(String(dataIni).slice(0, 4))
  return [ano - 1, ano, ano + 1]
    .flatMap(a => getQuinzenasAno(a, d1, d2))
    .filter(q => q.fim >= dataIni)
    .slice(0, n)
    .map((q, i) => ({ ...q, ordem: i + 1 }))
}

export const ultimosDias = (n) =>
  Array.from({ length: n }, (_, i) =>
    format(subDays(new Date(), n - 1 - i), 'yyyy-MM-dd')
  )
