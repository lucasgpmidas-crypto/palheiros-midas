-- Migração — trava o login por PIN depois de N erros seguidos
--
-- O PIN tem 4 dígitos: 10.000 combinações. Sem limite de tentativas, um script
-- acerta qualquer PIN em minutos — e em 2026-07-27 descobrimos que pelo menos um
-- PIN em uso era a sequência 1-2-3-4, ou seja, o primeiro chute.
--
-- A contagem fica DENTRO do banco, na RPC security definer: não dá para burlar
-- pelo navegador, porque quem conta não é o app.
--
-- Erro de PIN continua devolvendo ZERO LINHAS (o app entende como "PIN incorreto").
-- Bloqueio devolve uma EXCEÇÃO com a mensagem 'bloqueado:<segundos restantes>',
-- que o app traduz para o funcionário. Versões antigas do app, que não conhecem
-- essa mensagem, apenas mostram erro genérico — ninguém entra indevidamente.

-- 1) Onde as tentativas são contadas
-- Sem policy nenhuma de propósito: nem anon nem authenticated tocam nesta tabela.
-- Só a função abaixo escreve nela, e ela roda como dona (security definer).
create table if not exists login_tentativas (
  func_id bigint primary key references funcionarios(id) on delete cascade,
  erros integer not null default 0,
  bloqueado_ate timestamptz,
  ultima_tentativa timestamptz not null default now()
);

alter table login_tentativas enable row level security;

comment on table login_tentativas is 'Tentativas de login por PIN — escrita apenas pela RPC login_funcionario';

-- 2) Parâmetros (editáveis em Configurações)
insert into configuracoes (chave, valor) values
  ('login_max_tentativas', '5'),
  ('login_bloqueio_min',   '15')
on conflict (chave) do nothing;

-- 3) A RPC de login, agora com trava
create or replace function login_funcionario(p_func_id bigint, p_pin text)
returns table (id bigint, nome text, setor text)
language plpgsql
security definer
set search_path = public
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

  -- PIN correto: limpa o histórico e devolve o funcionário
  select f.id, f.nome, coalesce(f.setor, 'producao') as setor into r
  from funcionarios f
  where f.id = p_func_id and f.situacao = 'ativo' and f.pin is not null and f.pin::text = p_pin;

  if found then
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

-- Para destravar alguém na mão (funcionário esqueceu o PIN e travou):
--   delete from login_tentativas where func_id = <id>;
