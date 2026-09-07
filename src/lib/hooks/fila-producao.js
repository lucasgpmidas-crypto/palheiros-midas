import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabase'
import { getFuncToken } from '../auth'
import { enviarFila, itensDe, EVENTO as EVENTO_FILA } from '../fila'
import toast from 'react-hot-toast'

// ── O que ficou guardado no aparelho ──────────────────────────────────────────
// Acompanha a fila de registros de quem está logado e tenta esvaziá-la sozinha:
// ao abrir a tela e toda vez que o aparelho anuncia que voltou a ter conexão.
// O `online` do navegador mente com frequência (rede aberta que não navega), por
// isso a falha volta para a fila em vez de virar erro na cara do parceiro.
export function useFilaProducao(funcId, aoEnviar) {
  const [itens, setItens] = useState([])
  const [enviando, setEnviando] = useState(false)
  // Guardado em ref de propósito: a tela costuma passar uma função nova a cada
  // render, e ela nas dependências do efeito abaixo viraria reenvio em loop.
  const callback = useRef(aoEnviar)
  callback.current = aoEnviar

  const recarregar = useCallback(() => {
    setItens(funcId ? itensDe(funcId) : [])
  }, [funcId])

  const sincronizar = useCallback(async ({ avisar = false } = {}) => {
    const token = getFuncToken()
    if (!funcId || !itensDe(funcId).length) return
    setEnviando(true)
    const r = await enviarFila({ funcId, token, enviar: (params) => supabase.rpc('registrar_producao', params) })
    setEnviando(false)
    recarregar()

    if (r.enviados) {
      toast.success(r.enviados === 1 ? '✓ Registro guardado foi enviado!' : `✓ ${r.enviados} registros guardados foram enviados!`)
      await callback.current?.()
    }
    // Recusa do banco é definitiva: o item saiu da fila e a pessoa precisa saber,
    // senão some sem deixar rastro e ela segue achando que registrou.
    for (const x of r.recusados) toast.error(`O registro de ${x.data.split('-').reverse().join('/')} não foi aceito: ${x.motivo}`, { duration: 8000 })
    if (avisar && !r.enviados && !r.recusados.length) {
      toast.error(r.parouPor === 'sessao' ? 'Entre com seu PIN para enviar o que está guardado.' : 'Ainda sem internet. O registro continua guardado.')
    }
  }, [funcId, recarregar])

  useEffect(() => {
    recarregar()
    sincronizar()
    const aoVoltar = () => sincronizar()
    window.addEventListener(EVENTO_FILA, recarregar)
    window.addEventListener('online', aoVoltar)
    return () => {
      window.removeEventListener(EVENTO_FILA, recarregar)
      window.removeEventListener('online', aoVoltar)
    }
  }, [recarregar, sincronizar])

  return { pendentes: itens, enviando, enviarAgora: () => sincronizar({ avisar: true }) }
}
