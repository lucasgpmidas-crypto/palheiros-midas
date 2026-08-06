// Cópia de segurança do banco, fora do Supabase.
//
//   npm run backup
//
// Grava uma pasta por dia em OneDrive\Backups Palheiros Midas\AAAA-MM-DD, com um
// arquivo .json por tabela e um resumo.txt com a contagem de linhas. Como fica no
// OneDrive, sobe para a nuvem sozinho.
//
// Usa a chave do .env. Com a chave pública (anon) o backup cobre tudo o que o app
// lê — que é o histórico inteiro de produção, conferência, estoque, folha e
// prêmios. Para levar junto a auditoria, que só o admin enxerga, defina
// SUPABASE_SERVICE_KEY no ambiente ou no .env; sem ela o script avisa e segue.
//
// O PIN nunca entra no backup, em nenhum dos dois modos.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

// fileURLToPath e não .pathname: o caminho tem espaço ("Projetos Midas") e viria
// como %20, quebrando a leitura do .env.
const raiz = fileURLToPath(new URL('..', import.meta.url))

// ── Configuração ──────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(join(raiz, '.env'), 'utf8')
    .split('\n')
    .map(l => l.replace(/^﻿/, '').trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)

const URL_BASE = env.VITE_SUPABASE_URL
const CHAVE = process.env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_KEY || env.VITE_SUPABASE_ANON_KEY
const COMPLETO = CHAVE !== env.VITE_SUPABASE_ANON_KEY

if (!URL_BASE || !CHAVE) {
  console.error('✕ Faltou VITE_SUPABASE_URL ou a chave no .env.')
  process.exit(1)
}

// Colunas listadas onde há coluna sensível na tabela: o PIN fica de fora sempre.
const TABELAS = [
  { nome: 'funcionarios', colunas: 'id,nome,entrada,meta_diaria,situacao,obs,setor,modalidade,parceria_desde,padrinho_id,created_at' },
  { nome: 'registros_producao' },
  { nome: 'controle_qualidade' },
  { nome: 'expedicoes' },
  { nome: 'fechamentos' },
  { nome: 'premios' },
  { nome: 'configuracoes' },
  { nome: 'auditoria', somenteCompleto: true },
]

const PAGINA = 1000

// A API devolve no máximo mil linhas por chamada e não avisa quando corta —
// buscar por páginas até vir uma incompleta é o que garante o backup inteiro.
async function baixarTabela({ nome, colunas }) {
  const linhas = []
  for (let p = 0; ; p++) {
    const alvo = `${URL_BASE}/rest/v1/${nome}?select=${colunas || '*'}&order=id`
    const r = await fetch(alvo, {
      headers: {
        apikey: CHAVE,
        Authorization: `Bearer ${CHAVE}`,
        Range: `${p * PAGINA}-${p * PAGINA + PAGINA - 1}`,
      },
    })
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`)
    const lote = await r.json()
    linhas.push(...lote)
    if (lote.length < PAGINA) return linhas
  }
}

// ── Execução ──────────────────────────────────────────────────────────────────
const hoje = new Date().toISOString().slice(0, 10)
const base = existsSync(join(homedir(), 'OneDrive'))
  ? join(homedir(), 'OneDrive', 'Backups Palheiros Midas')
  : join(raiz, 'backups')
const destino = join(base, hoje)
mkdirSync(destino, { recursive: true })

console.log(`Backup ${hoje} → ${destino}`)
console.log(COMPLETO ? 'chave de serviço: backup completo' : 'chave pública: sem a tabela de auditoria')
console.log('')

const resumo = []
let falhas = 0

for (const t of TABELAS) {
  if (t.somenteCompleto && !COMPLETO) {
    console.log(`  ○ ${t.nome.padEnd(20)} pulada (precisa da chave de serviço)`)
    resumo.push(`${t.nome}: pulada`)
    continue
  }
  try {
    const linhas = await baixarTabela(t)
    writeFileSync(join(destino, `${t.nome}.json`), JSON.stringify(linhas, null, 2), 'utf8')
    console.log(`  ✓ ${t.nome.padEnd(20)} ${String(linhas.length).padStart(6)} linhas`)
    resumo.push(`${t.nome}: ${linhas.length} linhas`)
  } catch (e) {
    falhas++
    console.error(`  ✕ ${t.nome.padEnd(20)} ${e.message}`)
    resumo.push(`${t.nome}: FALHOU — ${e.message}`)
  }
}

writeFileSync(
  join(destino, 'resumo.txt'),
  [`Backup Palheiros Midas — ${new Date().toLocaleString('pt-BR')}`,
   `Origem: ${URL_BASE}`,
   `Modo: ${COMPLETO ? 'completo (chave de serviço)' : 'chave pública'}`,
   '', ...resumo, '',
   'O PIN dos funcionários não é exportado.'].join('\n'),
  'utf8'
)

console.log('')
console.log(falhas ? `Terminou com ${falhas} tabela(s) com falha.` : 'Backup concluído.')
process.exit(falhas ? 1 : 0)
