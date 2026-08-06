-- Tranca explícita na tabela de sessões (complemento de migracao_escrita_fechada)
--
-- A tabela já está protegida: RLS ligada e nenhuma policy, o que faz qualquer
-- leitura de fora devolver vazio. O problema é que "vazio" é indistinguível de
-- "tabela sem linhas" — pela API, `select * from sessoes_funcionario` responde
-- 200 [] tanto protegida quanto desprotegida, e isso não dá para verificar.
--
-- Com o revoke abaixo a resposta vira 401: aí a proteção é demonstrável, e não
-- depende de ninguém lembrar de nunca criar uma policy nessa tabela.
-- As funções de gravação continuam enxergando tudo, porque rodam como dono
-- (security definer).
--
-- Vale o mesmo para login_tentativas, criada em julho com a mesma ideia.

revoke all on sessoes_funcionario from anon, authenticated;
revoke all on login_tentativas    from anon, authenticated;

-- Conferência: as duas devem sumir da lista de quem a chave pública alcança.
select table_name, privilege_type
  from information_schema.role_table_grants
 where grantee = 'anon'
   and table_name in ('sessoes_funcionario', 'login_tentativas');
-- Esperado: nenhuma linha.
