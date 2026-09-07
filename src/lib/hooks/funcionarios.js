import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import toast from 'react-hot-toast'

// ── Funcionários ──────────────────────────────────────────────────────────────
export function useFuncionarios() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    // Colunas explícitas de propósito: o PIN não pode trafegar para o navegador, e a
    // chave anon não tem mais select nele (migracao_pin_protegido.sql). Um `select('*')`
    // aqui pediria a coluna pin e levaria 401, derrubando o app do funcionário.
    // `pin_definido` é derivada no banco: diz se há PIN, nunca qual é.
    // Coluna nova em funcionarios? Incluir aqui E no grant da migração.
    const { data: rows } = await supabase
      .from('funcionarios')
      .select('id, nome, entrada, meta_diaria, situacao, obs, created_at, setor, modalidade, parceria_desde, padrinho_id, pin_definido')
      .order('nome')
    setData(rows || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const salvar = async (payload, id = null) => {
    // O PIN nunca vai junto com o resto: a tabela guarda só o hash, e quem calcula
    // o hash é o banco (RPC definir_pin). Aqui ele é separado do payload e enviado
    // depois, para o cadastro em si não carregar o número em nenhum momento.
    const { pin, ...row } = payload
    let funcId = id

    if (id) {
      const { error } = await supabase.from('funcionarios').update(row).eq('id', id)
      if (error) { toast.error('Erro ao atualizar'); return false }
    } else {
      const { data: novo, error } = await supabase.from('funcionarios').insert(row).select('id').single()
      if (error) { toast.error('Erro ao cadastrar'); return false }
      funcId = novo?.id
    }

    if (pin) {
      const { error } = await supabase.rpc('definir_pin', { p_func_id: funcId, p_pin: String(pin) })
      if (error) {
        // O cadastro já foi gravado; só o PIN falhou — dizer exatamente isso evita
        // que se pense que o funcionário não foi salvo.
        toast.error('Cadastro salvo, mas o PIN não foi definido: ' + (error.message || 'erro desconhecido'))
        await fetch()
        return false
      }
    }

    toast.success(id ? 'Funcionário atualizado!' : 'Funcionário cadastrado!')
    await fetch()
    return true
  }

  return { funcionarios: data, loading, refetch: fetch, salvar }
}
