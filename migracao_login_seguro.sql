-- ═══════════════════════════════════════════════════════════════════
-- Migração — Login seguro por PIN
-- Rode no Supabase: Painel → SQL Editor → New query → Run
--
-- Hoje o navegador baixa o PIN do funcionário para comparar localmente,
-- o que permite que alguém mal-intencionado descubra os PINs de todos.
-- Esta função valida o PIN DENTRO do banco e devolve só id/nome/setor.
-- O sistema usa a função automaticamente assim que ela existir.
-- ═══════════════════════════════════════════════════════════════════

create or replace function login_funcionario(p_func_id bigint, p_pin text)
returns table (id bigint, nome text, setor text)
language sql
security definer
set search_path = public
as $$
  select f.id::bigint, f.nome::text, coalesce(f.setor, 'producao')::text
  from funcionarios f
  where f.id = p_func_id
    and f.situacao = 'ativo'
    and f.pin is not null
    and f.pin::text = p_pin
$$;

grant execute on function login_funcionario(bigint, text) to anon, authenticated;
