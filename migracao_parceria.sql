-- Migração — Programa de Parceria de Produção v3 (ciclo quinzenal)
--
-- O preço do milheiro deixa de ser fixo (valor_mil) e passa a ser apurado por
-- QUINZENA: o volume CONFERIDO (entregue na revisão) define a faixa de preço,
-- que vale retroativamente para toda a quinzena. A qualidade da quinzena
-- (revisada ÷ entregue) pode travar o preço numa faixa inferior.
-- O cálculo é feito no app (calcParceria em src/lib/utils.js) a partir destas
-- configurações — os triggers de valor_revisado continuam valendo apenas como
-- estimativa provisória diária.
--
-- Recomendação ao implantar: ajustar valor_mil para o preço da faixa Base (85)
-- em Configurações, para a estimativa diária bater com o piso do programa, e
-- mudar a quinzena para o corte do programa (quinzena_d1 = 1, quinzena_d2 = 16).

-- 1) Modalidade do parceiro: CP (Centro de Produção Barretos) ou Externo (casa)
alter table funcionarios add column if not exists modalidade text not null default 'cp';
alter table funcionarios drop constraint if exists funcionarios_modalidade_check;
alter table funcionarios add constraint funcionarios_modalidade_check check (modalidade in ('cp', 'externo'));

-- O PIN é protegido por grants de coluna feitos no painel do Supabase; se o
-- select do anon for por coluna, a coluna nova precisa entrar no grant para o
-- app do funcionário enxergar a modalidade. Redundante (e inofensivo) se o
-- grant atual for da tabela inteira.
grant select (modalidade) on funcionarios to anon, authenticated;
grant update (modalidade) on funcionarios to authenticated;
grant insert (modalidade) on funcionarios to authenticated;

-- 2) Estimativa diária provisória (triggers de migracao_valor_revisado.sql) passa
-- a acompanhar o APROVADO na revisão (revisada), não mais o entregue: cigarro
-- reprovado não é pago e declarado que nunca chegou também não. O valor oficial
-- da quinzena continua sendo o da faixa, calculado no app (calcParceria).
create or replace function sincronizar_valor_producao(fid bigint, d date) returns void
language plpgsql security definer as $$
declare
  vm numeric := 85;
  tot integer;
begin
  select coalesce(nullif(trim(valor), '')::numeric, 85) into vm from configuracoes where chave = 'valor_mil';
  if vm is null then vm := 85; end if;
  select sum(revisada) into tot from controle_qualidade where func_id = fid and data = d;
  update registros_producao
    set aproveitado = tot,
        valor = round(coalesce(tot, quantidade) / 1000.0 * vm, 2)
    where func_id = fid and data = d;
end $$;

create or replace function aplicar_revisao_no_registro() returns trigger
language plpgsql as $$
declare
  vm numeric := 85;
  tot integer;
begin
  select sum(revisada) into tot from controle_qualidade where func_id = new.func_id and data = new.data;
  if tot is not null then
    select coalesce(nullif(trim(valor), '')::numeric, 85) into vm from configuracoes where chave = 'valor_mil';
    if vm is null then vm := 85; end if;
    new.aproveitado := tot;
    new.valor := round(tot / 1000.0 * vm, 2);
  end if;
  return new;
end $$;

-- Backfill: reaplica a regra nova a todos os dias que já têm revisão
do $$
declare
  r record;
begin
  for r in (select distinct func_id, data from controle_qualidade) loop
    perform sincronizar_valor_producao(r.func_id, r.data);
  end loop;
end $$;

-- 3) Parâmetros do programa (editáveis na tela Configurações)
-- Faixas em MILHEIROS por quinzena: Base até (min_inter − 1), Intermediária de
-- min_inter a (min_prem − 1), Premium a partir de min_prem.
insert into configuracoes (chave, valor) values
  ('faixa_min_inter', '11'),
  ('faixa_min_prem',  '18'),
  ('faixa_cp_base',   '85'),
  ('faixa_cp_inter',  '90'),
  ('faixa_cp_prem',   '95'),
  ('faixa_ext_base',  '85'),
  ('faixa_ext_inter', '88'),
  ('faixa_ext_prem',  '90'),
  ('qual_premium',    '97'),
  ('qual_minima',     '94'),
  ('ajuda_custo_dia', '10')
on conflict (chave) do nothing;
