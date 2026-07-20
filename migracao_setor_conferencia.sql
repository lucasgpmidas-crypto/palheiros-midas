-- ═══════════════════════════════════════════════════════════════════
-- Migração 2026-07-14 — Setor de funcionários + Conferência automática
-- Rode este script no Supabase: Painel → SQL Editor → New query → Run
-- ═══════════════════════════════════════════════════════════════════

-- 1. Setor do funcionário: 'producao' (enrolador) ou 'finalizacao' (revisa/empacota)
alter table funcionarios
  add column if not exists setor text not null default 'producao';

-- 2. Rastreio de quem lançou o registro de revisão/empacotamento
alter table controle_qualidade
  add column if not exists registrado_por text;

-- 3. Configurações da conferência automática
insert into configuracoes (chave, valor) values
  ('uni_display', '200'),      -- unidades por display
  ('uni_maco', '20'),          -- unidades por maço
  ('tolerancia_conf', '2')     -- tolerância de divergência (%)
on conflict (chave) do nothing;
