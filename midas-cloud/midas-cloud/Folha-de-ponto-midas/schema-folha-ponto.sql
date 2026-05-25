-- ═══════════════════════════════════════════════════════════════
-- FOLHA DE PONTO MIDAS — Schema do Banco de Dados
-- Execute no SQL Editor do Supabase
-- ═══════════════════════════════════════════════════════════════

-- 1. FUNCIONÁRIOS
CREATE TABLE IF NOT EXISTS funcionarios (
  id          BIGSERIAL PRIMARY KEY,
  nome        TEXT NOT NULL,
  usuario     TEXT NOT NULL UNIQUE,
  cargo       TEXT DEFAULT '',
  tipo        TEXT NOT NULL DEFAULT 'funcionario' CHECK (tipo IN ('admin','gestor','funcionario')),
  pin         TEXT,
  ativo       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. REGISTROS DE PONTO
CREATE TABLE IF NOT EXISTS registros_ponto (
  id          BIGSERIAL PRIMARY KEY,
  func_id     BIGINT NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
  data        DATE NOT NULL DEFAULT CURRENT_DATE,
  entrada     TIME,
  intervalo   TIME,
  retorno     TIME,
  saida       TIME,
  -- Horas trabalhadas em minutos (calculado)
  minutos     INTEGER,
  -- Localização
  lat         NUMERIC(10,7),
  lng         NUMERIC(10,7),
  gps_ok      BOOLEAN DEFAULT false,
  wifi_ok     BOOLEAN DEFAULT false,
  -- Selfies (base64 ou URL)
  selfie_entrada    TEXT,
  selfie_intervalo  TEXT,
  selfie_retorno    TEXT,
  selfie_saida      TEXT,
  -- Observação
  obs         TEXT,
  -- Controle
  editado     BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (func_id, data)
);

-- 3. CONFIGURAÇÕES
CREATE TABLE IF NOT EXISTS configuracoes (
  id          BIGSERIAL PRIMARY KEY,
  chave       TEXT NOT NULL UNIQUE,
  valor       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Configurações padrão
INSERT INTO configuracoes (chave, valor) VALUES
  ('gps_obrigatorio',  'true'),
  ('selfie_obrigatoria', 'true'),
  ('wifi_verificar',   'false'),
  ('gps_lat',          ''),
  ('gps_lng',          ''),
  ('gps_raio',         '200'),
  ('wifi_ssid',        ''),
  ('jornada_horas',    '8'),
  ('versao',           '1.0')
ON CONFLICT (chave) DO NOTHING;

-- 4. TRIGGER updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ponto_updated ON registros_ponto;
CREATE TRIGGER trg_ponto_updated
  BEFORE UPDATE ON registros_ponto
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 5. ÍNDICES
CREATE INDEX IF NOT EXISTS idx_ponto_data    ON registros_ponto (data);
CREATE INDEX IF NOT EXISTS idx_ponto_func    ON registros_ponto (func_id);
CREATE INDEX IF NOT EXISTS idx_ponto_func_data ON registros_ponto (func_id, data);

-- 6. ROW LEVEL SECURITY
ALTER TABLE funcionarios      ENABLE ROW LEVEL SECURITY;
ALTER TABLE registros_ponto   ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracoes     ENABLE ROW LEVEL SECURITY;

-- Políticas para usuários autenticados (admins via Supabase Auth)
CREATE POLICY "auth_funcionarios" ON funcionarios   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_ponto"        ON registros_ponto FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_config"       ON configuracoes   FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Políticas para anon (funcionários logam via PIN, não via Supabase Auth)
CREATE POLICY "anon_func_read"    ON funcionarios    FOR SELECT TO anon USING (true);
CREATE POLICY "anon_ponto_all"    ON registros_ponto FOR ALL    TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_config_read"  ON configuracoes   FOR SELECT TO anon USING (true);
CREATE POLICY "anon_config_write" ON configuracoes   FOR ALL    TO anon USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════
-- CRIAR ADMIN: Supabase > Authentication > Users > Add User
-- Email: voce@email.com  |  Senha: sua_senha_forte
-- ═══════════════════════════════════════════════════════════════
-- Schema criado com sucesso!
-- ═══════════════════════════════════════════════════════════════
