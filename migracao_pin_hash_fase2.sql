-- PIN guardado como hash (fase 2 de 2) — apaga a coluna de texto puro
--
-- RODAR SÓ DEPOIS de o código novo estar publicado e de alguém ter entrado com
-- PIN, confirmando que o login por hash funciona.
--   · código publicado                                  ✔ 06/08
--   · login por hash confirmado (Caio e lucas)          ✔ 06/08
--
-- NOTA: este arquivo era maior. Ele recriava o login_funcionario para tirar o
-- caminho de compatibilidade com o PIN em texto — mas isso ficou obsoleto no
-- mesmo dia: a migração do token (migracao_escrita_fechada.sql) já substituiu a
-- função por uma que confere só o hash. Recriar aqui a assinatura antiga, sem o
-- token, seria recusado pelo Postgres ("cannot change return type") e quebraria
-- o script no meio. Sobrou só o que ainda falta fazer.

-- ── Antes: ninguém pode depender da coluna que vai sair ──────────────────────
-- Esta consulta lista quem tem PIN só em texto, sem hash — gente que perderia o
-- acesso. Se devolver alguma linha, PARE e defina o PIN dessa pessoa na tela.
-- Conferido em 06/08 pelo app: os 4 com acesso (Caio, Alexandre, Denilson,
-- lucas) têm hash; os outros 8 nunca tiveram PIN.
select id, nome
  from funcionarios
 where pin_hash is null
   and pin is not null
   and btrim(pin) <> '';

-- ── A coluna sai ─────────────────────────────────────────────────────────────
alter table funcionarios drop column if exists pin;

-- ── Conferência ──────────────────────────────────────────────────────────────
-- Esperado: só pin_definido e pin_hash. A coluna `pin` não deve aparecer.
select column_name
  from information_schema.columns
 where table_name = 'funcionarios'
   and column_name in ('pin', 'pin_hash', 'pin_definido')
 order by column_name;

-- Esperado: 4 com hash — os mesmos 4 que entram hoje.
select count(*) as com_acesso from funcionarios where pin_hash is not null;
