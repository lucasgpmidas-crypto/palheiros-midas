// Barril. src/lib/utils.js era um arquivo so com 35 helpers de sete
// conceitos diferentes; virou um modulo por conceito. Quem importa de
// '../lib/utils' continua importando igual.

export { fmtMoeda, fmtValorDia, fmtNum, fmtData, fmtDataLonga, fmtMilheiros, getIniciais, avatarCor, corPct, corQualidade } from './formato'
export { getHoje, getOntem, getSemana, getMes, getQuinzena, getQuinzenaAtual, getQuinzenasAno, getQuinzenasDesde, ultimosDias } from './datas'
export { calcValor, pctMeta, isProducao } from './producao'
export { sugerirEmpacote, ratearRevisado, ratearInteiro, statusConferencia } from './conferencia'
export { getFaixasParceria, calcParceria, resumoPeriodo } from './parceria'
export { getEtapasQualif, calcQualificacao, getFaixasProdutividade, calcPremiosAnuais, calcDestaqueAno } from './premios'
export { exportCSV, exportXLSX } from './exportar'
