-- Valor a pagar calculado pelo ENTREGUE na revisão (o que chegou na conferência),
-- não pelo declarado. A perda (descarte na revisão) NÃO desconta — ela faz parte
-- do entregue. Só o faltante (declarado que nunca chegou na revisão) não é pago.
-- Enquanto não há revisão, o valor fica provisório (baseado no declarado).
-- Quando a finalização lança/edita/exclui a revisão, o valor do dia é recalculado.
-- IMPORTANTE: rodar antes de criar fechamentos de período (o backfill altera registros antigos).

-- Sincroniza aproveitado + valor de um funcionário/dia a partir da revisão
create or replace function sincronizar_valor_producao(fid bigint, d date) returns void
language plpgsql security definer as $$
declare
  vm numeric := 75;
  tot integer;
begin
  select coalesce(nullif(trim(valor), '')::numeric, 75) into vm from configuracoes where chave = 'valor_mil';
  if vm is null then vm := 75; end if;
  select sum(entregue) into tot from controle_qualidade where func_id = fid and data = d;
  update registros_producao
    set aproveitado = tot,
        valor = round(coalesce(tot, quantidade) / 1000.0 * vm, 2)
    where func_id = fid and data = d;
end $$;

-- Recalcula quando a revisão muda
create or replace function recalcular_apos_revisao() returns trigger
language plpgsql security definer as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform sincronizar_valor_producao(new.func_id, new.data);
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    -- cobre também mudança de funcionário/data no update
    perform sincronizar_valor_producao(old.func_id, old.data);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists recalc_valor_cq on controle_qualidade;
create trigger recalc_valor_cq after insert or update or delete on controle_qualidade
  for each row execute function recalcular_apos_revisao();

-- Protege o valor revisado de ser sobrescrito por edições no próprio registro
-- (ex: admin edita a quantidade declarada depois da revisão)
create or replace function aplicar_revisao_no_registro() returns trigger
language plpgsql as $$
declare
  vm numeric := 75;
  tot integer;
begin
  select sum(entregue) into tot from controle_qualidade where func_id = new.func_id and data = new.data;
  if tot is not null then
    select coalesce(nullif(trim(valor), '')::numeric, 75) into vm from configuracoes where chave = 'valor_mil';
    if vm is null then vm := 75; end if;
    new.aproveitado := tot;
    new.valor := round(tot / 1000.0 * vm, 2);
  end if;
  return new;
end $$;

drop trigger if exists aplica_revisao_registro on registros_producao;
create trigger aplica_revisao_registro before insert or update on registros_producao
  for each row execute function aplicar_revisao_no_registro();

-- Backfill: aplica a regra a todos os dias que já têm revisão lançada
do $$
declare
  r record;
begin
  for r in (select distinct func_id, data from controle_qualidade) loop
    perform sincronizar_valor_producao(r.func_id, r.data);
  end loop;
end $$;
