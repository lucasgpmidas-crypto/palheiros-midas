-- Contestação de revisão
-- Permite que o enrolador conteste a revisão/perda lançada pela finalização.
-- O admin vê a contestação no Controle de Qualidade e pode marcá-la como resolvida.

alter table controle_qualidade
  add column if not exists contestacao text,
  add column if not exists contestada_em timestamptz,
  add column if not exists contestacao_status text
    check (contestacao_status in ('aberta', 'resolvida'));

comment on column controle_qualidade.contestacao is 'Motivo informado pelo enrolador ao contestar a revisão';
comment on column controle_qualidade.contestada_em is 'Quando a contestação foi aberta';
comment on column controle_qualidade.contestacao_status is 'aberta = aguardando resposta do admin; resolvida = tratada';
