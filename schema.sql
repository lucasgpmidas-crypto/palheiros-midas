-- ═══════════════════════════════════════════════════════════════════════
-- PALHEIROS MIDAS — Schema Completo
-- Execute no SQL Editor do Supabase (app.supabase.com > SQL Editor)
-- ═══════════════════════════════════════════════════════════════════════

-- 1. FUNCIONÁRIOS
CREATE TABLE IF NOT EXISTS funcionarios (
  id          BIGSERIAL PRIMARY KEY,
  nome        TEXT NOT NULL,
  entrada     DATE NOT NULL DEFAULT CURRENT_DATE,
  meta_diaria INTEGER NOT NULL DEFAULT 3000 CHECK (meta_diaria >= 1),
  situacao    TEXT NOT NULL DEFAULT 'ativo' CHECK (situacao IN ('ativo','inativo')),
  pin         TEXT,
  obs         TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. REGISTROS DE PRODUÇÃO
CREATE TABLE IF NOT EXISTS registros_producao (
  id          BIGSERIAL PRIMARY KEY,
  func_id     BIGINT NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
  data        DATE NOT NULL DEFAULT CURRENT_DATE,
  quantidade  INTEGER NOT NULL CHECK (quantidade >= 0),
  aproveitado INTEGER,
  perda       INTEGER GENERATED ALWAYS AS (
                CASE WHEN aproveitado IS NOT NULL THEN quantidade - aproveitado ELSE NULL END
              ) STORED,
  taxa        NUMERIC(5,2) GENERATED ALWAYS AS (
                CASE WHEN aproveitado IS NOT NULL AND quantidade > 0
                THEN ROUND((aproveitado::NUMERIC / quantidade) * 100, 2)
                ELSE NULL END
              ) STORED,
  valor       NUMERIC(10,2),
  obs         TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (func_id, data)
);

-- 3. CONTROLE DE QUALIDADE
CREATE TABLE IF NOT EXISTS controle_qualidade (
  id          BIGSERIAL PRIMARY KEY,
  func_id     BIGINT NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
  data        DATE NOT NULL DEFAULT CURRENT_DATE,
  os          TEXT,
  tipo        TEXT NOT NULL DEFAULT 'Original',
  entregue    INTEGER NOT NULL CHECK (entregue >= 0),
  revisada    INTEGER NOT NULL CHECK (revisada >= 0),
  display     INTEGER DEFAULT 0,
  macos       INTEGER DEFAULT 0,
  perda       INTEGER GENERATED ALWAYS AS (entregue - revisada) STORED,
  taxa        NUMERIC(5,2) GENERATED ALWAYS AS (
                CASE WHEN entregue > 0
                THEN ROUND((revisada::NUMERIC / entregue) * 100, 2)
                ELSE 0 END
              ) STORED,
  obs         TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 4. CONFIGURAÇÕES DO SISTEMA
CREATE TABLE IF NOT EXISTS configuracoes (
  id          BIGSERIAL PRIMARY KEY,
  chave       TEXT NOT NULL UNIQUE,
  valor       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Inserir configurações padrão
INSERT INTO configuracoes (chave, valor) VALUES
  ('valor_mil', '75'),
  ('versao', '1.0')
ON CONFLICT (chave) DO NOTHING;

-- 5. TRIGGER updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reg_updated ON registros_producao;
CREATE TRIGGER trg_reg_updated
  BEFORE UPDATE ON registros_producao
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 6. ÍNDICES
CREATE INDEX IF NOT EXISTS idx_reg_data     ON registros_producao (data);
CREATE INDEX IF NOT EXISTS idx_reg_func     ON registros_producao (func_id);
CREATE INDEX IF NOT EXISTS idx_reg_func_data ON registros_producao (func_id, data);
CREATE INDEX IF NOT EXISTS idx_cq_data      ON controle_qualidade (data);
CREATE INDEX IF NOT EXISTS idx_cq_func      ON controle_qualidade (func_id);

-- 7. ROW LEVEL SECURITY
ALTER TABLE funcionarios        ENABLE ROW LEVEL SECURITY;
ALTER TABLE registros_producao  ENABLE ROW LEVEL SECURITY;
ALTER TABLE controle_qualidade  ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracoes       ENABLE ROW LEVEL SECURITY;

-- Políticas: usuários autenticados têm acesso total
CREATE POLICY "auth_funcionarios"   ON funcionarios        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_registros"      ON registros_producao  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_cq"             ON controle_qualidade  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_config"         ON configuracoes       FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Políticas anon (para login de funcionários via PIN sem Supabase Auth)
CREATE POLICY "anon_funcionarios"   ON funcionarios        FOR SELECT TO anon USING (true);
CREATE POLICY "anon_registros_r"    ON registros_producao  FOR SELECT TO anon USING (true);
CREATE POLICY "anon_registros_w"    ON registros_producao  FOR ALL    TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_cq_r"          ON controle_qualidade  FOR SELECT TO anon USING (true);
CREATE POLICY "anon_cq_w"          ON controle_qualidade  FOR ALL    TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_config"         ON configuracoes       FOR SELECT TO anon USING (true);

-- ═══════════════════════════════════════════════════════════════════════
-- CONTAS DE ADMINISTRADOR
-- Execute DEPOIS de criar as contas em Authentication > Users
-- Substitua os emails pelos seus emails reais
-- ═══════════════════════════════════════════════════════════════════════

-- Exemplo (descomente e ajuste):
-- Os usuários admin são criados em: Supabase > Authentication > Users > Add User
-- Email: voce@email.com  Senha: sua_senha_forte
-- Email: lider@email.com Senha: senha_do_lider

-- ═══════════════════════════════════════════════════════════════════════
-- Schema criado com sucesso!
-- ═══════════════════════════════════════════════════════════════════════
