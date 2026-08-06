-- PIN guardado como hash (fase 1 de 2)
--
-- Até aqui o PIN estava em texto puro na coluna `pin` e o login comparava
-- `f.pin::text = p_pin`. Esconder a coluna da chave pública (migracao_pin_protegido)
-- fechou a porta da API, mas quem lê o banco por qualquer outro caminho — backup,
-- painel do Supabase, chave de serviço — continuava lendo os 12 PINs.
--
-- Depois desta migração o banco guarda só o hash (bcrypt, via pgcrypto) e ninguém
-- mais consegue ler o número, nem o administrador.
--
-- ORDEM OBRIGATÓRIA:
--   1º  rodar este arquivo
--   2º  publicar o código novo (o cadastro passa a chamar a RPC definir_pin)
--   3º  rodar migracao_pin_hash_fase2.sql, que apaga a coluna de texto puro
--
-- Entre o passo 1 e o 2 o login funciona nos dois formatos: se o hash não bater,
-- ele ainda aceita o texto puro antigo e converte na hora. É essa tolerância que
-- o passo 3 remove.
--
-- Rode o arquivo INTEIRO, sem selecionar trecho: o SQL Editor do Supabase executa
-- apenas o que estiver destacado.

-- ── 1) Extensão de criptografia ──────────────────────────────────────────────
create extension if not exists pgcrypto;

-- ── 2) Coluna do hash + conversão dos PINs existentes ────────────────────────
alter table funcionarios add column if not exists pin_hash text;

update funcionarios
   set pin_hash = crypt(pin, gen_salt('bf'))
 where pin is not null
   and btrim(pin) <> ''
   and pin_hash is null;

-- ── 3) "Tem PIN?" passa a olhar o hash ───────────────────────────────────────
-- Coluna gerada, então não dá para alterar: derruba e recria. O grant é POR COLUNA
-- (migracao_pin_protegido) e não sobrevive ao drop — sem o grant de volta, o app do
-- funcionário leva 401 e não abre.
alter table funcionarios drop column if exists pin_definido;
alter table funcionarios add column pin_definido boolean
  generated always as (pin_hash is not null) stored;

grant select (pin_definido) on funcionarios to anon, authenticated;

-- ── 4) Login conferindo o hash ───────────────────────────────────────────────
-- Igual à versão anterior (trava de 5 tentativas, bloqueio de 15 min), mudando só
-- a comparação do PIN. search_path inclui extensions porque é lá que o Supabase
-- instala o pgcrypto.
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
  v_ok boolean := false;
begin
  select nullif(trim(valor), '')::int into v_max from configuracoes where chave = 'login_max_tentativas';
  if v_max is null or v_max < 1 then v_max := 5; end if;
  select nullif(trim(valor), '')::int into v_min from configuracoes where chave = 'login_bloqueio_min';
  if v_min is null or v_min < 1 then v_min := 15; end if;

  -- Funcionário inexistente: não conta tentativa (evitaria varrer ids) e não entra
  if not exists (select 1 from funcionarios f where f.id = p_func_id) then
    return;
  end if;

  -- Já está de castigo?
  select t.bloqueado_ate into v_bloqueio from login_tentativas t where t.func_id = p_func_id;
  if v_bloqueio is not null and v_bloqueio > now() then
    v_seg := ceil(extract(epoch from (v_bloqueio - now())));
    raise exception 'bloqueado:%', v_seg using errcode = 'P0001';
  end if;

  select f.id, f.nome, coalesce(f.setor, 'producao') as setor, f.pin, f.pin_hash into r
    from funcionarios f
   where f.id = p_func_id and f.situacao = 'ativo';

  if found then
    if r.pin_hash is not null then
      v_ok := (r.pin_hash = crypt(p_pin, r.pin_hash));
    elsif r.pin is not null and btrim(r.pin) <> '' and r.pin = p_pin then
      -- Cadastro salvo pelo código antigo durante a transição: aceita uma vez
      -- e já converte, para o PIN não ficar em texto puro.
      v_ok := true;
      update funcionarios set pin_hash = crypt(p_pin, gen_salt('bf')) where funcionarios.id = p_func_id;
    end if;
  end if;

  if v_ok then
    delete from login_tentativas t where t.func_id = p_func_id;
    id := r.id; nome := r.nome; setor := r.setor;
    return next;
    return;
  end if;

  -- PIN errado: soma a tentativa e bloqueia ao atingir o limite
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

  return;  -- zero linhas = PIN incorreto
end $$;

grant execute on function login_funcionario(bigint, text) to anon, authenticated;

-- ── 5) Definir o PIN sem que ele passe pela tabela ───────────────────────────
-- Só o administrador (sessão autenticada) executa. A chave pública NÃO recebe
-- permissão: quem tem só ela não define PIN de ninguém.
-- As mesmas recusas da tela valem aqui, porque validação que mora só no navegador
-- não é validação.
create or replace function definir_pin(p_func_id bigint, p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.role() is distinct from 'authenticated' then
    raise exception 'apenas o administrador define PIN' using errcode = '42501';
  end if;

  if p_pin !~ '^\d{4}$' then
    raise exception 'o PIN precisa ter 4 dígitos' using errcode = 'P0001';
  end if;

  if p_pin ~ '^(\d)\1{3}$'
     or position(p_pin in '01234567890') > 0
     or position(p_pin in '09876543210') > 0 then
    raise exception 'PIN fácil demais: evite repetições e sequências' using errcode = 'P0001';
  end if;

  update funcionarios
     set pin_hash = crypt(p_pin, gen_salt('bf')),
         pin = null
   where id = p_func_id;

  if not found then
    raise exception 'funcionário não encontrado' using errcode = 'P0001';
  end if;

  -- Trocou o PIN? Então o castigo de tentativas erradas não faz mais sentido.
  delete from login_tentativas where func_id = p_func_id;
end $$;

revoke execute on function definir_pin(bigint, text) from public, anon;
grant execute on function definir_pin(bigint, text) to authenticated;

-- ── Conferência ──────────────────────────────────────────────────────────────
-- Deve mostrar 12 com hash e 0 ainda em texto puro (ou o que faltar converter).
select count(*) filter (where pin_hash is not null) as com_hash,
       count(*) filter (where pin is not null and btrim(pin) <> '') as ainda_em_texto
  from funcionarios;
