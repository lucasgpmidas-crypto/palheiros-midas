-- Migração — fecha a leitura do PIN pela chave anon
--
-- PROBLEMA (verificado por REST em 2026-07-25): `select=pin` respondia 200 para a
-- chave anon, que vai no bundle público do site. Qualquer pessoa lia o PIN de quem
-- tem PIN cadastrado e entrava no app como aquele funcionário. O login em si já era
-- seguro (RPC `login_funcionario`, security definer, confere o PIN dentro do banco);
-- o vazamento estava na leitura direta da tabela.
--
-- SOLUÇÃO: anon deixa de ter select na TABELA e passa a ter select apenas nas
-- COLUNAS que o app do funcionário realmente usa — `pin` fica de fora. O admin
-- (authenticated) continua lendo tudo. Para a tela Funcionários continuar mostrando
-- quem tem PIN configurado sem expor o valor, entra a coluna gerada `pin_definido`.
--
-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ ORDEM DE EXECUÇÃO — os dois passos NÃO podem ser rodados juntos:            │
-- │   1) PASSO A (abaixo) — aditivo, não quebra nada, roda com o app no ar      │
-- │   2) deploy do código novo (select de colunas explícitas + badge)           │
-- │   3) PASSO B — só depois que o deploy estiver no ar                          │
-- │ Rodar o PASSO B antes do deploy derruba o app do funcionário, porque o      │
-- │ `select('*')` da versão antiga pede a coluna pin e leva 401 na resposta.    │
-- └─────────────────────────────────────────────────────────────────────────────┘


-- ══ PASSO A — rodar AGORA (antes do deploy) ═══════════════════════════════════
-- Coluna derivada: diz se há PIN, nunca qual é. Mantém o badge "PIN configurado"
-- da tela Funcionários funcionando sem trafegar o PIN nem para o admin.
alter table funcionarios
  add column if not exists pin_definido boolean
  generated always as (nullif(btrim(pin::text), '') is not null) stored;

grant select (pin_definido) on funcionarios to anon, authenticated;


-- ══ PASSO B — rodar DEPOIS que o deploy estiver no ar ═════════════════════════
-- Troca o select de tabela inteira por select por coluna. A lista abaixo é
-- exatamente o que o app do funcionário lê; `pin` ficou de fora de propósito.
-- Ao adicionar colunas novas em funcionarios no futuro, lembrar de incluí-las
-- aqui, senão elas ficam invisíveis para o app do funcionário.
--
-- revoke select on funcionarios from anon;
--
-- grant select (
--   id, nome, entrada, meta_diaria, situacao, obs, created_at,
--   setor, modalidade, parceria_desde, padrinho_id, pin_definido
-- ) on funcionarios to anon;
