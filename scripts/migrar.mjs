// Aplica um arquivo .sql no banco de produção.
//
//   npm run migrar migracao_registro_offline.sql
//   npm run migrar migracao_x.sql -- --conferir     (mostra o SQL e não aplica)
//
// Por que existe: a API REST do Supabase não executa DDL — criar função, dar
// grant, alterar tabela. Até aqui isso era feito à mão, colando o arquivo no SQL
// Editor do painel, com uma armadilha conhecida: o editor roda SÓ O TRECHO
// SELECIONADO quando há texto destacado, e um arquivo colado pela metade deixa o
// banco num estado que ninguém pediu.
//
// O caminho usado aqui é a API de gerenciamento do Supabase, a mesma que o painel
// usa por baixo. A credencial é um token pessoal (sbp_...) lido de
// SUPABASE_ACCESS_TOKEN — nunca do .env, que vive dentro do projeto, e nunca
// escrito em disco por este script. Para revogar:
// https://supabase.com/dashboard/account/tokens
//
// O arquivo inteiro vai dentro de uma transação: ou o banco fica com todas as
// mudanças, ou com nenhuma. Migração aplicada pela metade em sistema que paga
// gente é o pior dos dois mundos.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = fileURLToPath(new URL('..', import.meta.url))

const args = process.argv.slice(2).filter(a => a !== '--')
const conferir = args.includes('--conferir')
const arquivo = args.find(a => a.endsWith('.sql'))

if (!arquivo) {
  console.error('✕ Diga qual arquivo aplicar:  npm run migrar <arquivo.sql>')
  process.exit(1)
}

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
if (!TOKEN && !conferir) {
  console.error('✕ Falta o token de acesso do Supabase no ambiente (SUPABASE_ACCESS_TOKEN).')
  console.error('  Gere em https://supabase.com/dashboard/account/tokens e grave com:')
  console.error("  [Environment]::SetEnvironmentVariable('SUPABASE_ACCESS_TOKEN','sbp_...','User')")
  process.exit(1)
}

// O identificador do projeto sai da própria URL do .env: um projeto só, sem
// chance de aplicar no lugar errado por engano de digitação.
const env = Object.fromEntries(
  readFileSync(join(raiz, '.env'), 'utf8')
    .split('\n')
    .map(l => l.replace(/^﻿/, '').trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)

const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]
const sql = readFileSync(join(raiz, arquivo), 'utf8')

console.log(`\n📄 ${arquivo} · ${sql.split('\n').length} linhas · projeto ${ref}`)

if (conferir) {
  console.log('\n--- SQL que seria aplicado ---\n')
  console.log(sql)
  process.exit(0)
}

const resposta = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: `begin;\n${sql}\ncommit;` }),
})

const corpo = await resposta.text()

if (!resposta.ok) {
  console.error(`\n✕ O banco recusou (HTTP ${resposta.status}). Nada foi aplicado — a transação foi desfeita inteira.\n`)
  console.error(corpo)
  process.exit(1)
}

console.log('\n✓ Aplicado.')
if (corpo && corpo !== '[]') console.log(corpo)
