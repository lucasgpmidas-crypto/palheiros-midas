-- ═══════════════════════════════════════════════════════════════════
-- Migração 2026-07-20 — Separar revisão (contagem + maços + descarte)
-- de embalagem (passar para displays), feitas por pessoas diferentes
-- Rode no Supabase: Painel → SQL Editor → New query → Run
-- ═══════════════════════════════════════════════════════════════════

-- 1. Quem fez a revisão (contagem/maços/descarte) já existia como "registrado_por"
alter table controle_qualidade
  rename column registrado_por to registrado_por_revisao;

-- 2. Quem passou para os displays — fica em branco até essa etapa ser feita
alter table controle_qualidade
  add column if not exists registrado_por_display text;
