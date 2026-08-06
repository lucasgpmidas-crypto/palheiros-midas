-- PASSO FINAL — fecha a porta e arruma o resto
--
-- Rodar só depois de:
--   · migracao_pin_hash.sql aplicada                                    ✔ 06/08
--   · migracao_escrita_fechada.sql aplicada até o "PARE AQUI"           ✔ 06/08
--   · código publicado                                                  ✔ 06/08
--   · teste com PIN de verdade: registro, revisão e embalagem gravando  ✔ 06/08 (26/26)
--
-- Este arquivo reúne o que sobrou: o revoke que tira a escrita da chave pública,
-- a tranca das tabelas internas, os cortes da quinzena e a limpeza de resíduos.
-- Pode rodar inteiro, de uma vez.
--
-- Reverter, se algo der errado: as linhas de `grant` no fim deste arquivo,
-- comentadas, devolvem o estado anterior.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) A CHAVE PÚBLICA PERDE A ESCRITA
-- ═══════════════════════════════════════════════════════════════════════════
-- Produção e conferência: o funcionário grava pelas funções com token, o admin
-- grava autenticado. Ninguém mais escreve com a chave que vai no site.
drop policy if exists "anon_registros_w" on registros_producao;
drop policy if exists "anon_cq_w" on controle_qualidade;
revoke insert, update, delete on registros_producao from anon;
revoke insert, update, delete on controle_qualidade from anon;

-- Estoque e fechamento de folha: telas exclusivas do admin. As regras antigas
-- foram criadas sem dizer a quem se aplicam, e regra sem destinatário vale para
-- todos — inclusive para quem só tem a chave do site.
drop policy if exists "expedicoes_select" on expedicoes;
drop policy if exists "expedicoes_insert" on expedicoes;
drop policy if exists "expedicoes_update" on expedicoes;
drop policy if exists "expedicoes_delete" on expedicoes;
drop policy if exists "expedicoes_leitura" on expedicoes;
drop policy if exists "expedicoes_escrita" on expedicoes;
create policy "expedicoes_leitura" on expedicoes for select using (true);
create policy "expedicoes_escrita" on expedicoes for all to authenticated using (true) with check (true);
revoke insert, update, delete on expedicoes from anon;

drop policy if exists "fechamentos_select" on fechamentos;
drop policy if exists "fechamentos_insert" on fechamentos;
drop policy if exists "fechamentos_update" on fechamentos;
drop policy if exists "fechamentos_leitura" on fechamentos;
drop policy if exists "fechamentos_escrita" on fechamentos;
create policy "fechamentos_leitura" on fechamentos for select using (true);
create policy "fechamentos_escrita" on fechamentos for all to authenticated using (true) with check (true);
revoke insert, update, delete on fechamentos from anon;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) TABELAS INTERNAS TRANCADAS
-- ═══════════════════════════════════════════════════════════════════════════
-- Sessões e tentativas de login já estão protegidas por RLS sem policy, mas isso
-- responde "lista vazia" pela API — indistinguível de tabela sem linhas, ou seja,
-- impossível de verificar. Com o revoke a resposta vira 401, que é prova.
-- As funções seguem enxergando tudo, porque rodam como dono.
revoke all on sessoes_funcionario from anon, authenticated;
revoke all on login_tentativas    from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) CORTES DA QUINZENA
-- ═══════════════════════════════════════════════════════════════════════════
-- Nunca foram gravados, então valia o padrão do código — que estava em 9, um dia
-- adiantado. O corte praticado é 8 a 23 e 24 a 7 do mês seguinte.
insert into configuracoes (chave, valor) values
  ('quinzena_d1', '8'),
  ('quinzena_d2', '24')
on conflict (chave) do update set valor = excluded.valor, updated_at = now();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) RESÍDUOS
-- ═══════════════════════════════════════════════════════════════════════════
-- presidio_data: lista de nomes e lançamentos da aba removida em julho, ainda
-- legível por qualquer um com a chave do site. Conteúdo já salvo em
-- backup_presidio_data.json, na raiz do projeto.
-- versao: escrita uma vez pelo schema inicial, nenhuma tela lê.
delete from configuracoes where chave in ('presidio_data', 'versao');

-- ═══════════════════════════════════════════════════════════════════════════
-- CONFERÊNCIA
-- ═══════════════════════════════════════════════════════════════════════════
-- a) O que a chave pública ainda alcança — esperado: só SELECT em cada tabela,
--    e nenhuma linha para sessoes_funcionario nem login_tentativas.
select table_name, string_agg(privilege_type, ', ' order by privilege_type) as pode
  from information_schema.role_table_grants
 where grantee = 'anon'
   and table_name in ('registros_producao','controle_qualidade','expedicoes',
                      'fechamentos','funcionarios','premios','configuracoes',
                      'sessoes_funcionario','login_tentativas')
 group by table_name
 order by table_name;

-- b) Os cortes da quinzena — esperado: 8 e 24.
select chave, valor from configuracoes
 where chave in ('quinzena_d1','quinzena_d2') order by chave;

-- c) Os resíduos — esperado: nenhuma linha.
select chave from configuracoes where chave in ('presidio_data','versao');


-- ═══════════════════════════════════════════════════════════════════════════
-- COMO VOLTAR ATRÁS (só se o app do funcionário parar de gravar)
-- ═══════════════════════════════════════════════════════════════════════════
-- grant insert, update, delete on registros_producao to anon;
-- grant insert, update, delete on controle_qualidade to anon;
-- create policy "anon_registros_w" on registros_producao for all to anon using (true) with check (true);
-- create policy "anon_cq_w" on controle_qualidade for all to anon using (true) with check (true);
