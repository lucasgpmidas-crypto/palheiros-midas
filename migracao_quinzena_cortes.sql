-- Cortes da quinzena de pagamento (chaves que nunca chegaram a ser gravadas)
--
-- Sem estas duas linhas o app usa o padrão escrito no código, e o padrão estava
-- em 9 — um dia adiantado em relação ao que a operação pratica. O corte real,
-- confirmado pelo Lucas em 2026-08-06:
--   1ª quinzena: dia 8 até o dia 23 do mesmo mês
--   2ª quinzena: dia 24 até o dia 7 do mês seguinte
--
-- Efeito de estar errado: a Folha somava a quinzena atual até 08/08 em vez de
-- 07/08, jogando o dia 8 para o período errado — e com ele o volume que define
-- a faixa de preço do parceiro naquela quinzena.
--
-- Quem lê estas chaves: getQuinzena/getQuinzenaAtual (Folha, card da quinzena na
-- MinhaProducao), getQuinzenasAno (prêmios anuais e Indicadores) e
-- getQuinzenasDesde (as 6 quinzenas da qualificação).
--
-- O mesmo pode ser feito pela tela: Configurações › Quinzena de pagamento.

insert into configuracoes (chave, valor) values
  ('quinzena_d1', '8'),
  ('quinzena_d2', '24')
on conflict (chave) do update set valor = excluded.valor, updated_at = now();

-- Conferência
select chave, valor from configuracoes
where chave in ('quinzena_d1', 'quinzena_d2')
order by chave;
