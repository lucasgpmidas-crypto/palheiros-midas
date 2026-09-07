export const calcValor = (qty, valorMil) => ((qty || 0) / 1000) * (valorMil || 75)

export const pctMeta = (qty, meta) => (meta > 0 ? Math.round((qty / meta) * 100) : 0)

// Funcionário do setor de produção (enrolador) — registros antigos sem setor contam como produção
export const isProducao = (f) => (f?.setor || 'producao') === 'producao'
