-- ═══════════════════════════════════════════════════════════════════════════
-- REGISTRO DE PRODUÇÃO QUE SOBREVIVE À FALTA DE SINAL
-- ═══════════════════════════════════════════════════════════════════════════
-- No galpão o sinal cai. Hoje, quando isso acontece, o parceiro vê o erro em
-- vermelho e o número se perde: ele precisa lembrar de refazer.
--
-- O app passa a guardar o registro no próprio aparelho e reenviar sozinho
-- quando a conexão voltar. Isso obriga uma mudança aqui: a função gravava
-- `current_date`, ou seja, o dia em que a REQUISIÇÃO chega ao banco. Quem
-- registrasse às 18h sem sinal e só pegasse internet no dia seguinte teria a
-- produção lançada no dia errado — e, como a gravação é um upsert por
-- (funcionário, dia), ela ainda apagaria por cima do dia seguinte. A fila não
-- perderia o número; lançaria no lugar errado, que é pior.
--
-- Então a data passa a vir do aparelho, e é o servidor que a confere:
--   · sem data (app antigo, registro normal) → continua sendo hoje
--   · data no futuro                          → recusada
--   · data mais velha que 7 dias              → recusada
--   · quinzena já fechada                     → recusada pelo gatilho de sempre
--
-- A janela de 7 dias é a decisão do Lucas (21/08/2026): cobre a semana inteira
-- sem sinal. Quem segura o retroativo além disso é o fechamento da folha.
--
-- ORDEM: rodar este arquivo ANTES de publicar o código. A nova função tem
-- default na data, então o app que está no ar hoje — que manda três parâmetros —
-- continua funcionando entre o SQL e o deploy.

-- Uma função com um parâmetro a mais é OUTRA função: o `create or replace` não
-- substitui a antiga, e as duas convivendo deixam a chamada ambígua para o
-- PostgREST. Por isso a de três parâmetros sai antes.
drop function if exists registrar_producao(text, int, text);

create or replace function registrar_producao(
  p_token text,
  p_quantidade int,
  p_obs text default null,
  p_data date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  f funcionarios;
  v_data date;
  v_janela int := 7;   -- dias que a fila pode ter ficado presa no aparelho
begin
  f := sessao_funcionario(p_token);

  if p_quantidade is null or p_quantidade < 0 then
    raise exception 'quantidade inválida' using errcode = 'P0001';
  end if;

  v_data := coalesce(p_data, current_date);

  -- Continua valendo o essencial: é sempre quem está logado, e nunca um dia que
  -- ainda não chegou. O que mudou é só poder alcançar os dias recém-passados.
  if v_data > current_date then
    raise exception 'data_futura' using errcode = 'P0001';
  end if;

  if v_data < current_date - v_janela then
    raise exception 'data_antiga:%', v_janela using errcode = 'P0001';
  end if;

  insert into registros_producao (func_id, data, quantidade, obs, valor)
  values (f.id, v_data, p_quantidade, nullif(btrim(coalesce(p_obs, '')), ''), null)
  on conflict (func_id, data) do update
    set quantidade = excluded.quantidade,
        obs = excluded.obs,
        valor = null;
end $$;

grant execute on function registrar_producao(text, int, text, date) to anon, authenticated;
