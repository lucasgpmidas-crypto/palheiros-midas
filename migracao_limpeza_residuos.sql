-- Resíduos na tabela configuracoes
--
-- 1) presidio_data: guarda a lista de enroladores e os lançamentos da aba
--    "Créditos MIDAS / Presídio", removida do app em 2026-07-20. A tela não
--    existe mais, mas o dado continua aqui — e configuracoes é legível por
--    qualquer um com a chave pública do site.
--    O conteúdo foi salvo antes em backup_presidio_data.json, na raiz do projeto.
--
-- 2) versao: escrita uma única vez pelo schema.sql inicial. Nenhuma tela lê.

-- Confira o que vai sair antes de apagar:
select chave, length(valor) as tamanho from configuracoes
where chave in ('presidio_data', 'versao');

delete from configuracoes where chave in ('presidio_data', 'versao');
