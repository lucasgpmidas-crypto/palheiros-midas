// Barril. `src/lib/hooks.js` era um arquivo so de 673 linhas com dez hooks
// independentes dentro; virou um modulo por conceito de dominio. As telas
// continuam importando de '../lib/hooks' exatamente como antes — nenhum dos
// 19 pontos de importacao mudou.
export { useFuncionarios } from './funcionarios'
export { useRegistros } from './registros'
export { useFilaProducao } from './fila-producao'
export { useCQ } from './cq'
export { useFechamentos, useAuditoria } from './fechamentos'
export { useExpedicoes } from './expedicoes'
export { usePremios, useApuracaoPremios } from './premios'
export { useConfig } from './config'
