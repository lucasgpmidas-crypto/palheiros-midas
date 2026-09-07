import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import toast from 'react-hot-toast'

// ── Config ────────────────────────────────────────────────────────────────────
const CFG_KEYS = {
  valor_mil: 'valorMil', uni_display: 'uniDisplay', uni_maco: 'uniMaco', tolerancia_conf: 'tolerancia',
  quinzena_d1: 'quinzenaD1', quinzena_d2: 'quinzenaD2', dias_sem_revisao: 'diasSemRevisao', estoque_minimo: 'estoqueMinimo',
  // Programa de Parceria: faixas de preço por volume quinzenal + trava de qualidade + ajuda de custo CP
  faixa_min_inter: 'faixaMinInter', faixa_min_prem: 'faixaMinPrem',
  faixa_cp_base: 'faixaCpBase', faixa_cp_inter: 'faixaCpInter', faixa_cp_prem: 'faixaCpPrem',
  faixa_ext_base: 'faixaExtBase', faixa_ext_inter: 'faixaExtInter', faixa_ext_prem: 'faixaExtPrem',
  qual_premium: 'qualPremium', qual_minima: 'qualMinima', ajuda_custo_dia: 'ajudaCustoDia',
  // Prêmios: qualificação (6 quinzenas em 3 etapas), padrinho e prêmios anuais
  qualif_vol1: 'qualifVol1', qualif_qual1: 'qualifQual1',
  qualif_vol2: 'qualifVol2', qualif_qual2: 'qualifQual2',
  qualif_vol3: 'qualifVol3', qualif_qual3: 'qualifQual3',
  premio_qualificacao: 'premioQualificacao', premio_padrinho: 'premioPadrinho',
  premio_prod_v1: 'premioProdV1', premio_prod_p1: 'premioProdP1',
  premio_prod_v2: 'premioProdV2', premio_prod_p2: 'premioProdP2',
  premio_prod_v3: 'premioProdV3', premio_prod_p3: 'premioProdP3',
  premio_fid_min: 'premioFidMin',
  premio_qual_anual: 'premioQualAnual', premio_qual_min: 'premioQualMin',
}

export function useConfig() {
  const [cfg, setCfg] = useState({
    valorMil: 75, uniDisplay: 200, uniMaco: 20, tolerancia: 2, quinzenaD1: 8, quinzenaD2: 23, diasSemRevisao: 2, estoqueMinimo: 0,
    faixaMinInter: 11, faixaMinPrem: 18,
    faixaCpBase: 85, faixaCpInter: 90, faixaCpPrem: 95,
    faixaExtBase: 85, faixaExtInter: 88, faixaExtPrem: 90,
    qualPremium: 97, qualMinima: 94, ajudaCustoDia: 10,
    qualifVol1: 7, qualifQual1: 94, qualifVol2: 10, qualifQual2: 96, qualifVol3: 12, qualifQual3: 97,
    premioQualificacao: 300, premioPadrinho: 150,
    premioProdV1: 250, premioProdP1: 500, premioProdV2: 400, premioProdP2: 1000, premioProdV3: 550, premioProdP3: 1500,
    premioFidMin: 250, premioQualAnual: 500, premioQualMin: 200,
  })

  // Os valores acima são só o ponto de partida até o banco responder. Quem manda é
  // a tabela `configuracoes`: preço do milheiro, faixas, corte da quinzena. Se a
  // busca falhar e ninguém avisar, a tela segue exibindo dinheiro calculado com
  // número de fábrica — certinha por fora e errada por dentro. Daí este status:
  // 'carregando' → 'ok' | 'erro', com o aviso aparecendo no Layout.
  const [status, setStatus] = useState('carregando')

  useEffect(() => {
    let cancelado = false
    supabase.from('configuracoes').select('chave, valor').in('chave', Object.keys(CFG_KEYS))
      .then(({ data, error }) => {
        if (cancelado) return
        if (error || !data) { setStatus('erro'); return }
        setCfg(c => {
          const next = { ...c }
          data.forEach(({ chave, valor }) => {
            const v = Number(valor)
            if (CFG_KEYS[chave] && !isNaN(v)) next[CFG_KEYS[chave]] = v
          })
          return next
        })
        setStatus('ok')
      })
    return () => { cancelado = true }
  }, [])

  const salvarConfig = async (chave, valor) => {
    const { error } = await supabase.from('configuracoes')
      .upsert({ chave, valor: String(valor) }, { onConflict: 'chave' })
    if (error) { toast.error('Não foi possível salvar: ' + error.message); return false }
    setCfg(c => ({ ...c, [CFG_KEYS[chave]]: Number(valor) }))
    return true
  }

  const salvarValorMil = async (v) => {
    if (await salvarConfig('valor_mil', v)) toast.success('Valor atualizado!')
  }

  return { ...cfg, cfgStatus: status, salvarValorMil, salvarConfig }
}
