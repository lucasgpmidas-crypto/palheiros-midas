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
  // Busca o funcionário pelo ID e valida o PIN
  const { data, error } = await supabase
    .from('funcionarios')
    .select('id, nome, pin, situacao')
    .eq('id', funcId)
    .single()

  if (error || !data) return { ok: false, msg: 'Funcionário não encontrado' }
  if (!data.pin) return { ok: false, msg: 'PIN não configurado. Fale com o administrador.' }
  if (String(data.pin) !== String(pin)) return { ok: false, msg: 'PIN incorreto' }
  return { ok: true, funcionario: data }
}

export async function logout() {
  await supabase.auth.signOut()
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}
