-- Fecha a escrita da chave pública (anon) em produção, conferência, expedição e
-- fechamento — e dá identidade real à sessão do funcionário.
--
-- O PROBLEMA
-- A chave anon vai dentro do JavaScript que qualquer um baixa ao abrir o site: ela
-- não é segredo. O que deveria proteger as tabelas são as regras do banco, mas as
-- herdadas do schema.sql liberam tudo (`for all to anon using (true)`). Verificado
-- por REST em 2026-08-06: insert de anon chegava até a validação de chave
-- estrangeira em registros_producao e controle_qualidade, e até o check em
-- expedicoes e fechamentos. Ou seja, dava para alterar produção, conferência,
-- estoque e folha de fora do sistema.
--
-- Além disso, "quem está logado" era só um JSON no navegador: trocá-lo fazia o app
-- tratar a pessoa como outra, ou como setor de finalização, sem PIN.
--
-- A SOLUÇÃO
-- O admin entra pelo Supabase Auth e continua escrevendo direto nas tabelas.
-- O funcionário passa a escrever SÓ por estas funções, que descobrem quem ele é
-- pelo token devolvido no login — nunca pelo que o navegador afirma ser.
--
-- ORDEM OBRIGATÓRIA (inverter derruba o app do funcionário):
--   1º  rodar migracao_pin_hash.sql, se ainda não rodou
--   2º  rodar ESTE arquivo até a linha marcada "PARE AQUI"
--   3º  publicar o código novo
--   4º  conferir que um funcionário consegue entrar, registrar produção e lançar
--       revisão; só então rodar o último bloco (os revokes)
--
-- Rode o arquivo INTEIRO de cada vez, sem selecionar trecho: o SQL Editor do
-- Supabase executa apenas o que estiver destacado.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) SESSÃO DO FUNCIONÁRIO
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists sessoes_funcionario (
  token      uuid primary key default gen_random_uuid(),
  func_id    bigint not null references funcionarios(id) on delete cascade,
  criada_em  timestamptz not null default now(),
  vista_em   timestamptz not null default now()
);

create index if not exists idx_sessoes_func on sessoes_funcionario (func_id);

alter table sessoes_funcionario enable row level security;
-- Sem policy nenhuma, de propósito: nem anon nem authenticated leem esta tabela.
-- Só as funções abaixo, que rodam como dono (security definer), a enxergam.

comment on table sessoes_funcionario is
  'Sessões abertas por PIN. O token identifica o funcionário nas RPCs de escrita.';

-- Quanto tempo uma sessão parada continua valendo
create or replace function sessao_validade_dias() returns int
language sql immutable as $$ select 30 $$;

-- Traduz token → funcionário. Toda escrita do funcionário passa por aqui, e é o
-- que impede alguém de se passar por outro: o id vem do banco, não do pedido.
create or replace function sessao_funcionario(p_token text)
returns funcionarios
language plpgsql
security definer
set search_path = public
as $$
declare
  f funcionarios;
  v_id bigint;
begin
  if p_token is null or p_token = '' then
    raise exception 'sessao_invalida' using errcode = 'P0001';
  end if;

  select s.func_id into v_id
    from sessoes_funcionario s
   where s.token = p_token::uuid
     and s.vista_em > now() - make_interval(days => sessao_validade_dias());

  if v_id is null then
    raise exception 'sessao_invalida' using errcode = 'P0001';
  end if;

  select * into f from funcionarios where id = v_id and situacao = 'ativo';
  if not found then
    raise exception 'sessao_invalida' using errcode = 'P0001';
  end if;

  update sessoes_funcionario set vista_em = now() where token = p_token::uuid;
  return f;
exception
  when invalid_text_representation then     -- token que não é uuid
    raise exception 'sessao_invalida' using errcode = 'P0001';
end $$;

revoke execute on function sessao_funcionario(text) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) LOGIN DEVOLVENDO O TOKEN
-- ═══════════════════════════════════════════════════════════════════════════
-- A assinatura de retorno muda (ganha a coluna token), então precisa cair antes.
drop function if exists login_funcionario(bigint, text);

create function login_funcionario(p_func_id bigint, p_pin text)
returns table (id bigint, nome text, setor text, token uuid)
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
  v_token uuid;
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
    -- Uma sessão por login. As antigas do mesmo funcionário saem: se ele trocou de
    -- aparelho ou o PIN vazou, o acesso anterior morre no próximo login.
    delete from sessoes_funcionario where func_id = r.id;
    insert into sessoes_funcionario (func_id) values (r.id) returning sessoes_funcionario.token into v_token;

    id := r.id; nome := r.nome; setor := r.setor; token := v_token;
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

  return;  -- zero linhas = PIN incorreto
end $$;

grant execute on function login_funcionario(bigint, text) to anon, authenticated;

-- Encerrar a sessão ao sair
create or replace function encerrar_sessao(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from sessoes_funcionario where token = p_token::uuid;
exception
  when invalid_text_representation then return;
end $$;

grant execute on function encerrar_sessao(text) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) O QUE O ENROLADOR ESCREVE
-- ═══════════════════════════════════════════════════════════════════════════
-- Registrar a própria produção do dia. Sem parâmetro de funcionário e sem
-- parâmetro de data: é sempre quem está logado, sempre hoje. Assim ninguém
-- registra por outro nem volta no tempo para mexer em quinzena já paga.
-- O valor vai nulo: quem preenche é o gatilho, quando a conferência entra.
create or replace function registrar_producao(p_token text, p_quantidade int, p_obs text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  f funcionarios;
begin
  f := sessao_funcionario(p_token);

  if p_quantidade is null or p_quantidade < 0 then
    raise exception 'quantidade inválida' using errcode = 'P0001';
  end if;

  insert into registros_producao (func_id, data, quantidade, obs, valor)
  values (f.id, current_date, p_quantidade, nullif(btrim(coalesce(p_obs, '')), ''), null)
  on conflict (func_id, data) do update
    set quantidade = excluded.quantidade,
        obs = excluded.obs,
        valor = null;
end $$;

grant execute on function registrar_producao(text, int, text) to anon, authenticated;

-- Contestar a conferência de um dia seu
create or replace function contestar_revisao(p_token text, p_data date, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  f funcionarios;
begin
  f := sessao_funcionario(p_token);

  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'explique o motivo da contestação' using errcode = 'P0001';
  end if;

  update controle_qualidade
     set contestacao = p_motivo,
         contestada_em = now(),
         contestacao_status = 'aberta'
   where func_id = f.id          -- só os seus próprios dias
     and data = p_data;
end $$;

grant execute on function contestar_revisao(text, date, text) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) O QUE A REVISÃO & EMPACOTE ESCREVE
-- ═══════════════════════════════════════════════════════════════════════════
-- Aqui o func_id de cada linha é o do PARCEIRO revisado, não o de quem está
-- lançando — são pessoas diferentes por definição. O token serve para autorizar
-- (precisa ser do setor de finalização) e para assinar quem contou.
create or replace function registrar_revisao(p_token text, p_itens jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  f funcionarios;
  item jsonb;
  n int := 0;
begin
  f := sessao_funcionario(p_token);

  if coalesce(f.setor, 'producao') <> 'finalizacao' then
    raise exception 'apenas a finalização lança revisão' using errcode = '42501';
  end if;

  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'nenhum dia para lançar' using errcode = 'P0001';
  end if;

  for item in select * from jsonb_array_elements(p_itens) loop
    if (item->>'revisada')::int > (item->>'entregue')::int then
      raise exception 'revisada não pode ser maior que entregue' using errcode = 'P0001';
    end if;
    if (item->>'data')::date > current_date then
      raise exception 'data não pode ser futura' using errcode = 'P0001';
    end if;

    insert into controle_qualidade
      (func_id, data, os, tipo, entregue, revisada, display, macos, obs,
       registrado_por_revisao, lote_id, revisado_em)
    values
      ((item->>'func_id')::bigint,
       (item->>'data')::date,
       nullif(item->>'os', ''),
       coalesce(nullif(item->>'tipo', ''), 'Original'),
       (item->>'entregue')::int,
       (item->>'revisada')::int,
       null, null,
       nullif(item->>'obs', ''),
       f.nome,
       nullif(item->>'lote_id', ''),
       coalesce((item->>'revisado_em')::date, current_date));
    n := n + 1;
  end loop;

  return n;
end $$;

grant execute on function registrar_revisao(text, jsonb) to anon, authenticated;

-- Etapa da embalagem: quantos displays e maços saíram de cada revisão já lançada
create or replace function registrar_embalagem(p_token text, p_itens jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  f funcionarios;
  item jsonb;
  n int := 0;
begin
  f := sessao_funcionario(p_token);

  if coalesce(f.setor, 'producao') <> 'finalizacao' then
    raise exception 'apenas a finalização lança embalagem' using errcode = '42501';
  end if;

  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'nenhum item para embalar' using errcode = 'P0001';
  end if;

  for item in select * from jsonb_array_elements(p_itens) loop
    update controle_qualidade
       set display = (item->>'display')::int,
           macos = (item->>'macos')::int,
           registrado_por_display = f.nome,
           embalado_em = coalesce((item->>'embalado_em')::date, current_date)
     where id = (item->>'id')::bigint;
    n := n + 1;
  end loop;

  return n;
end $$;

grant execute on function registrar_embalagem(text, jsonb) to anon, authenticated;

-- Corrigir um lançamento de revisão (número digitado errado)
create or replace function editar_revisao(
  p_token text, p_id bigint, p_data date, p_os text, p_tipo text,
  p_entregue int, p_revisada int, p_display int, p_macos int, p_obs text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  f funcionarios;
begin
  f := sessao_funcionario(p_token);

  if coalesce(f.setor, 'producao') <> 'finalizacao' then
    raise exception 'apenas a finalização corrige revisão' using errcode = '42501';
  end if;
  if p_revisada > p_entregue then
    raise exception 'revisada não pode ser maior que entregue' using errcode = 'P0001';
  end if;

  update controle_qualidade
     set data = p_data,
         os = nullif(p_os, ''),
         tipo = coalesce(nullif(p_tipo, ''), tipo),
         entregue = p_entregue,
         revisada = p_revisada,
         display = p_display,
         macos = p_macos,
         obs = nullif(p_obs, '')
   where id = p_id;
end $$;

grant execute on function editar_revisao(text, bigint, date, text, text, int, int, int, int, text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARE AQUI. Publique o código novo e confirme, com um funcionário de verdade:
--   · entrar com PIN
--   · registrar produção na Minha Produção
--   · lançar uma revisão e uma embalagem na tela Revisão & Empacote
-- Só depois disso rode o bloco abaixo.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- 5) FECHAR A PORTA  →  foi para migracao_passo_final.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- O bloco que revoga a escrita da chave pública saiu daqui em 06/08/2026 para
-- não ficar no meio de um arquivo já aplicado, onde correria o risco de rodar
-- cedo demais. Ele agora vive em `migracao_passo_final.sql`, junto com o resto
-- do fechamento (tranca das sessões, cortes da quinzena e limpeza).
