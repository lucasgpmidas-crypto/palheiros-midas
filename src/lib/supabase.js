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
  // Único caminho de login: o PIN é conferido dentro do banco (RPC security definer)
  // e nunca trafega para o navegador. O fallback que lia a coluna `pin` direto da
  // tabela foi removido junto com migracao_pin_protegido.sql — a chave anon não tem
  // mais select nessa coluna, então ele só produziria erro e era o próprio vazamento.
  const { data, error } = await supabase.rpc('login_funcionario', { p_func_id: funcId, p_pin: String(pin) })
  if (error) return { ok: false, msg: 'Erro ao validar PIN. Tente novamente.' }

  const f = Array.isArray(data) ? data[0] : data
  if (!f) return { ok: false, msg: 'PIN incorreto ou acesso não liberado' }
  return { ok: true, funcionario: { id: f.id, nome: f.nome, setor: f.setor || 'producao' } }
}

export async function logout() {
  await supabase.auth.signOut()
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}
