import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('⚠️ Supabase não configurado. Copie .env.example para .env e preencha.')
}

export const supabase = createClient(url || '', key || '')

// ── Helpers ──────────────────────────────────────────────────────────────────

export const VALOR_MIL_DEFAULT = 75

export async function getConfig(chave) {
  const { data } = await supabase.from('configuracoes').select('valor').eq('chave', chave).single()
  return data?.valor ?? null
}

export async function setConfig(chave, valor) {
  await supabase.from('configuracoes').upsert({ chave, valor: String(valor) }, { onConflict: 'chave' })
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

export async function loginAdmin(email, senha) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha })
  if (error) return { ok: false, msg: 'Email ou senha inválidos' }
  return { ok: true, user: data.user }
}

export async function loginFuncionario(funcId, pin) {
  // Validação segura: o PIN é conferido dentro do banco, sem trafegar para o navegador
  const { data, error } = await supabase.rpc('login_funcionario', { p_func_id: funcId, p_pin: String(pin) })
  if (!error) {
    const f = Array.isArray(data) ? data[0] : data
    if (!f) return { ok: false, msg: 'PIN incorreto ou acesso não liberado' }
    return { ok: true, funcionario: { id: f.id, nome: f.nome, setor: f.setor || 'producao' } }
  }

  // Só cai no método antigo (inseguro) se a função realmente não existir no banco ainda
  // (migracao_login_seguro.sql não rodada). Qualquer outro erro (rede, permissão, etc.)
  // deve falhar aqui, e não reabrir o vazamento de PIN que essa migração corrige.
  const rpcAusente = error.code === 'PGRST202' || /function .*login_funcionario.* does not exist/i.test(error.message || '')
  if (!rpcAusente) return { ok: false, msg: 'Erro ao validar PIN. Tente novamente.' }

  const { data: d, error: e } = await supabase
    .from('funcionarios')
    .select('id, nome, pin, situacao, setor')
    .eq('id', funcId)
    .single()

  if (e || !d) return { ok: false, msg: 'Funcionário não encontrado' }
  if (d.situacao !== 'ativo') return { ok: false, msg: 'Acesso não liberado' }
  if (!d.pin) return { ok: false, msg: 'PIN não configurado. Fale com o administrador.' }
  if (String(d.pin) !== String(pin)) return { ok: false, msg: 'PIN incorreto' }
  return { ok: true, funcionario: { id: d.id, nome: d.nome, setor: d.setor || 'producao' } }
}

export async function logout() {
  await supabase.auth.signOut()
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}
