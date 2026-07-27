-- Migração — o pagamento volta a ser pelo ENTREGUE na conferência
--
-- Decisão do Lucas em 2026-07-27, no ensaio de ponta a ponta: o descarte da revisão
-- NÃO tira dinheiro do parceiro. Ele é pago por tudo o que levou e foi contado na
-- conferência (entregue), inclusive o que foi descartado ali.
--   · quem pune descarte é a trava de qualidade (revisada ÷ entregue), derrubando a faixa
--   · o que continua não sendo pago é o FALTANTE: declarado que nunca chegou na revisão
--
-- Isto reverte a base usada desde 2026-07-24 (que pagava só o aprovado/revisada).
-- O valor oficial da quinzena é calculado no app (calcParceria em src/lib/utils.js);
-- as funções abaixo mantêm apenas a estimativa diária de registros_producao.valor.

create or replace function sincronizar_valor_producao(fid bigint, d date) returns void
language plpgsql security definer as $$
declare
  vm numeric := 85;
  tot integer;
begin
  select coalesce(nullif(trim(valor), '')::numeric, 85) into vm from configuracoes where chave = 'valor_mil';
  if vm is null then vm := 85; end if;
  -- entregue: o que chegou na conferência é o que se paga
  select sum(entregue) into tot from controle_qualidade where func_id = fid and data = d;
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
  select sum(entregue) into tot from controle_qualidade where func_id = new.func_id and data = new.data;
  if tot is not null then
    select coalesce(nullif(trim(valor), '')::numeric, 85) into vm from configuracoes where chave = 'valor_mil';
    if vm is null then vm := 85; end if;
    new.aproveitado := tot;
    new.valor := round(tot / 1000.0 * vm, 2);
  end if;
  return new;
end $$;

-- Reaplica a regra a todos os dias que já têm revisão lançada
do $$
declare
  r record;
begin
  for r in (select distinct func_id, data from controle_qualidade) loop
    perform sincronizar_valor_producao(r.func_id, r.data);
  end loop;
end $$;
