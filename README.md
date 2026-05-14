# 🌾 Palheiros Midas Cloud

Sistema de gestão de produção acessível de qualquer lugar.

---

## 🚀 COMO COLOCAR NO AR (Passo a Passo)

### PASSO 1 — Criar conta no GitHub
1. Acesse **github.com** e crie uma conta gratuita
2. Clique em **New repository**
3. Nome: `palheiros-midas`
4. Deixe como **Public** e clique **Create repository**
5. Faça upload de todos os arquivos desta pasta

---

### PASSO 2 — Configurar o Supabase (banco de dados)
1. Acesse **supabase.com** e crie uma conta gratuita
2. Clique em **New project**
   - Nome: `palheiros-midas`
   - Senha: crie uma senha forte (guarde!)
   - Região: **South America (São Paulo)**
3. Aguarde o projeto criar (~1 minuto)

#### Criar as tabelas:
4. No menu lateral, clique em **SQL Editor**
5. Clique em **New query**
6. Cole todo o conteúdo do arquivo `schema.sql`
7. Clique em **Run** (▶️)
8. Deve aparecer "Success"

#### Criar os usuários administradores:
9. No menu lateral, clique em **Authentication → Users**
10. Clique em **Add user → Create new user**
11. Adicione seu email e senha (acesso de Orlândia)
12. Repita para o líder de Barretos

#### Pegar as credenciais:
13. Vá em **Project Settings → API**
14. Copie:
    - **Project URL** (ex: https://abcdef.supabase.co)
    - **anon public** key (começa com eyJ...)

---

### PASSO 3 — Deploy na Vercel (hospedagem gratuita)
1. Acesse **vercel.com** e crie conta (pode usar o login do GitHub)
2. Clique em **Add New Project**
3. Importe o repositório `palheiros-midas` do GitHub
4. Em **Environment Variables**, adicione:
   ```
   VITE_SUPABASE_URL     = https://SEU_PROJETO.supabase.co
   VITE_SUPABASE_ANON_KEY = eyJhbGci...SUA_CHAVE
   ```
5. Clique em **Deploy**
6. Aguarde ~2 minutos

#### Resultado:
Você receberá um link como: **palheiros-midas.vercel.app**

---

### PASSO 4 — Primeiro acesso
1. Acesse o link gerado pela Vercel
2. Clique em **👤 ADMINISTRADOR**
3. Entre com email e senha que criou no Supabase
4. Configure o valor por mil em **⚙️ Configurações**
5. Cadastre os funcionários em **👥 Funcionários** (com PIN)
6. Pronto! Compartilhe o link com o líder de Barretos

---

## 📱 Como os funcionários acessam

Qualquer dispositivo com navegador (celular, tablet, computador):
1. Acessam o mesmo link (ex: palheiros-midas.vercel.app)
2. Clicam em **👥 FUNCIONÁRIO**
3. Selecionam o nome e digitam o PIN

---

## 🔧 Configuração local (desenvolvimento)

```bash
# Instalar dependências
npm install

# Criar arquivo .env
cp .env.example .env
# Preencher com as credenciais do Supabase

# Rodar localmente
npm run dev
# Acessa em http://localhost:5173
```

---

## 📁 Estrutura

```
midas-cloud/
├── src/
│   ├── lib/
│   │   ├── supabase.js    # Conexão Supabase
│   │   ├── auth.jsx       # Login/logout
│   │   ├── hooks.js       # Operações de dados
│   │   └── utils.js       # Cálculos e formatação
│   ├── pages/             # Todas as telas
│   ├── components/        # Layout, sidebar
│   └── styles/            # CSS global
├── schema.sql             # Banco de dados
├── vercel.json            # Config Vercel
└── .env.example           # Variáveis de ambiente
```

---

## ✅ O que está incluído

| Funcionalidade | Status |
|---|---|
| Login admin (email/senha) | ✅ |
| Login funcionário (PIN) | ✅ |
| Dois admins simultâneos | ✅ |
| Dashboard em tempo real | ✅ |
| Registro de produção | ✅ |
| Controle de qualidade | ✅ |
| Histórico individual | ✅ |
| Histórico da equipe | ✅ |
| Relatórios + CSV | ✅ |
| Alertas de produtividade | ✅ |
| Funcionários com PIN | ✅ |
| Acesso de qualquer lugar | ✅ |
| Dados em tempo real | ✅ |
| Gratuito | ✅ |

---

*Palheiros Midas © 2025*
