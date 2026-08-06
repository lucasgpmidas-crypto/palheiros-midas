-- PIN guardado como hash (fase 2 de 2) — apaga o texto puro
--
-- RODAR SÓ DEPOIS de o código novo estar publicado e de alguém ter entrado com
-- PIN pelo menos uma vez, confirmando que o login por hash funciona.
--
-- Enquanto a fase 1 estiver sozinha, o login ainda aceita o PIN em texto puro dos
-- cadastros antigos. Este arquivo tira essa tolerância e a coluna junto.

-- Ninguém pode ter ficado para trás: se isto devolver alguma linha, PARE — esse
-- funcionário perderia o acesso. Redefina o PIN dele na tela antes de continuar.
select id, nome
  from funcionarios
 where pin_hash is null
   and pin is not null
   and btrim(pin) <> '';

-- ── Remove a coluna de texto puro ────────────────────────────────────────────
alter table funcionarios drop column if exists pin;

-- ── Login sem o caminho de compatibilidade ───────────────────────────────────
create or replace function login_funcionario(p_func_id bigint, p_pin text)
returns table (id bigint, nome text, setor text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_max int;
  v_min int;
  v_bloqueio timestamptz;
  v_erros int;
  v_seg int;
  r record;
begin
  select nullif(trim(valor), '')::int into v_max from configuracoes where chave = 'login_max_tentativas';
  if v_max is null or v_max < 1 then v_max := 5; end if;
  select nullif(trim(valor), '')::int into v_min from configuracoes where chave = 'login_bloqueio_min';
  if v_min is null or v_min < 1 then v_min := 15; end if;

  if not exists (select 1 from funcionarios f where f.id = p_func_id) then
    return;
  end if;

  select t.bloqueado_ate into v_bloqueio from login_tentativas t where t.func_id = p_func_id;
  if v_bloqueio is not null and v_bloqueio > now() then
    v_seg := ceil(extract(epoch from (v_bloqueio - now())));
    raise exception 'bloqueado:%', v_seg using errcode = 'P0001';
  end if;

  select f.id, f.nome, coalesce(f.setor, 'producao') as setor into r
    from funcionarios f
   where f.id = p_func_id
     and f.situacao = 'ativo'
     and f.pin_hash is not null
     and f.pin_hash = crypt(p_pin, f.pin_hash);

  if found then
    delete from login_tentativas t where t.func_id = p_func_id;
    id := r.id; nome := r.nome; setor := r.setor;
    return next;
    return;
  end if;

  insert into login_tentativas as lt (func_id, erros, ultima_tentativa)
    values (p_func_id, 1, now())
  on conflict (func_id) do update
    set erros = lt.erros + 1,
        ultima_tentativa = now(),
        bloqueado_ate = case when lt.erros + 1 >= v_max
                             then now() + make_interval(mins => v_min)
                             else null end
  returning lt.erros, lt.bloqueado_ate into v_erros, v_bloqueio;

  if v_bloqueio is not null and v_bloqueio > now() then
    v_seg := ceil(extract(epoch from (v_bloqueio - now())));
    raise exception 'bloqueado:%', v_seg using errcode = 'P0001';
  end if;

  return;
end $$;

grant execute on function login_funcionario(bigint, text) to anon, authenticated;

-- Conferência: a coluna pin não deve mais existir.
select column_name from information_schema.columns
 where table_name = 'funcionarios' and column_name in ('pin', 'pin_hash', 'pin_definido')
 order by column_name;
