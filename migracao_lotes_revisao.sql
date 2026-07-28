-- Migração — o lote físico passa a existir no sistema
--
-- O sistema só enxergava "dia de produção". A operação trabalha com o MONTE que chega
-- de Barretos: a revisadora conta vários dias do mesmo parceiro de uma vez, o descarte
-- vai numa caixa só, e a embalagem depois pega exatamente aquele mesmo monte.
--
-- O dia continua sendo a unidade de pagamento, conferência e prêmio — nada disso muda.
-- O que passa a ser guardado é a VERDADE OPERACIONAL em volta dele:
--   · lote_id      — quais dias foram contados juntos (mesmo valor nas linhas do lote)
--   · revisado_em  — quando a contagem daquele monte foi fechada
--   · embalado_em  — quando o monte virou display
--
-- Com isso, quando alguém questionar o número de um dia, a tela mostra que ele veio de
-- um lote de N dias contados juntos — em vez de parecer uma contagem individual.

alter table controle_qualidade add column if not exists lote_id text;
alter table controle_qualidade add column if not exists revisado_em date;
alter table controle_qualidade add column if not exists embalado_em date;

create index if not exists idx_cq_lote on controle_qualidade (lote_id);

-- O app do funcionário (anon) lê e grava essas colunas na tela de Revisão & Empacote.
-- Redundante se o grant da tabela já for inteiro — e inofensivo nesse caso.
grant select (lote_id, revisado_em, embalado_em) on controle_qualidade to anon, authenticated;
grant insert (lote_id, revisado_em, embalado_em) on controle_qualidade to anon, authenticated;
grant update (lote_id, revisado_em, embalado_em) on controle_qualidade to anon, authenticated;

comment on column controle_qualidade.lote_id    is 'Agrupa os dias contados juntos no mesmo monte';
comment on column controle_qualidade.revisado_em is 'Data em que a contagem do monte foi fechada';
comment on column controle_qualidade.embalado_em is 'Data em que o monte virou display';

-- Registros antigos ficam com as três colunas nulas: são lançamentos de um dia só,
-- feitos antes de o lote existir. A tela trata nulo como "lançamento avulso".
