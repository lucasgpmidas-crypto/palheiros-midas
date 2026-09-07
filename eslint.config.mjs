// Camada rapida de lint. Projeto JavaScript puro (React + Vite), sem
// TypeScript: por isso nao existe aqui o typescript-eslint nem o segundo
// arquivo eslint.typed.config.mjs do template.
//
// O bloco import-x do template original foi removido: este projeto nao tem
// aliases de caminho nem uma camada de servidor/repositorio para separar. A
// unica fronteira real de arquitetura hoje - a tela nao fala direto com o
// Supabase - esta em quality/no-direct-data-access, mais abaixo.
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import react from "eslint-plugin-react";

import quality from "./eslint-rules/index.cjs";

export default defineConfig([
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      // Sem o parser do TypeScript, quem entende JSX e o espree - mas so
      // com esta flag ligada. Sem ela, todo arquivo .jsx morre em erro de
      // parse antes de qualquer regra rodar.
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  js.configs.recommended,

  {
    // O app roda no navegador do galpao (PWA).
    files: ["src/**/*.{js,jsx}"],
    languageOptions: { globals: globals.browser },
  },
  {
    // Ferramentas de linha de comando e configuracao rodam no Node.
    files: ["scripts/**/*.{js,mjs}", "vite.config.js", "eslint.config.mjs"],
    languageOptions: { globals: globals.node },
  },

  {
    files: ["src/**/*.{js,jsx}"],
    plugins: { quality, react },
    rules: {
      // Nao e o preset do React - e uma regra so. Sem ela o ESLint puro nao
      // conta um componente usado dentro do JSX como usado, e cada `import
      // Campo` legitimo vira "defined but never used". Eram ~90 falsos.
      "react/jsx-uses-vars": "error",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-var": "error",
      "prefer-const": "error",
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // ORCAMENTO DE TAMANHO E COMPLEXIDADE - DIVIDA RASTREADA
      //
      // Medido em 07/09/2026, depois da queima de avisos. O projeto inteiro
      // tem 65 avisos em 29 arquivos; DESTES, 58 em 26 arquivos sao deste
      // bloco de tamanho/complexidade. Os outros 7 sao das duas regras
      // quality mais abaixo. Baseline por regra, para a contagem so cair:
      //   complexity ............. 24
      //   max-lines-per-function . 15
      //   max-statements ......... 15
      //   max-nested-callbacks ....3
      //   max-params ..............1
      //   max-depth ...............0  (ja esta zerada)
      //
      // Ficam em "warn" por decisao explicita, nao por esquecimento: zerar
      // isso significa fatiar praticamente toda tela do app (12 componentes
      // tem entre 160 e 263 linhas de corpo), e boa parte do numero e JSX -
      // max-lines-per-function conta a arvore de JSX, entao uma tela sem
      // complexidade nenhuma estoura o limite so por ser grande.
      //
      // Cada regra sobe para "error" quando a contagem dela chegar a zero.
      // Nenhuma delas tem eslint-disable em lugar nenhum do projeto, e nao
      // deve ganhar: a divida fica visivel aqui, contada.
      //
      // Quem faz a contagem so poder cair e o `--max-warnings 65` no script
      // de lint do package.json: passou de 65, o comando falha. Ao baixar a
      // divida, baixe o numero la junto - senao ele vira folga silenciosa.
      complexity: ["warn", 12],
      "max-depth": ["warn", 4],
      "max-statements": ["warn", 20],
      "max-params": ["warn", 4],
      "max-lines-per-function": [
        "warn",
        { max: 150, skipBlankLines: true, skipComments: true },
      ],
      "max-nested-callbacks": ["warn", 3],
      // Teto de 350 linhas. Nasceu com cinco devedores listados numa lista de
      // excecao; os cinco foram quebrados e a lista chegou a zero em
      // 07/09/2026, entao ela saiu daqui. A regra agora vale para todo
      // arquivo, sem excecao - e e para continuar assim: quem estourar o
      // teto quebra o arquivo, nao acrescenta uma linha de excecao aqui.
      "quality/max-lines": ["error", { max: 350 }],
      // Baseline: 2 violacoes (src/components/ErroTela.jsx,
      // src/lib/supabase.js). O projeto ainda nao tem adaptador de log, entao
      // nao existe bloco "off" apontando para um - quando existir, ele entra
      // DEPOIS deste bloco, nunca antes. Sobe para "error" quando chegar a 0.
      "quality/no-direct-console": [
        "warn",
        { logger: "um adaptador de log do projeto" },
      ],
      // Baseline: 5 violacoes. A tela importando `supabase` direto e o que
      // impede de trocar o acesso a dados sem abrir toda pagina. Sobe para
      // "error" quando chegar a 0.
      "quality/no-direct-data-access": [
        "warn",
        {
          // Os tres niveis existem porque telas em subpasta (MinhaProducao/,
          // ControleCQ/, Relatorios/) alcancam o mesmo modulo por um caminho
          // mais longo. Faltando o ../../ a regra fica cega justamente para
          // os arquivos movidos - foi o que aconteceu entre 07/09 e a queima.
          modules: ["../lib/supabase", "../../lib/supabase", "./supabase"],
          bindings: ["supabase"],
          layers: ["/src/pages/", "/src/components/"],
          extensions: [".jsx"],
        },
      ],
    },
  },

  {
    // Mesmo teto para os testes, em "warn". Depois do bloco de "error" pelo
    // mesmo motivo de ordem: para um arquivo que casa com os dois, o flat
    // config aplica o ultimo por ultimo.
    files: [
      "**/*.test.{js,jsx}",
      "**/{__tests__,__mocks__,fixtures,mocks}/**/*.{js,jsx}",
    ],
    plugins: { quality },
    rules: {
      "quality/max-lines": ["warn", { max: 350, includeTests: true }],
      // Estas tres disparam em describe/it aninhado e em preparo longo sem
      // apontar problema de verdade.
      "max-statements": "off",
      "max-lines-per-function": "off",
      "max-nested-callbacks": "off",
    },
  },

  {
    files: ["eslint-rules/**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { module: "readonly", require: "readonly" },
    },
  },

  globalIgnores([
    ".claude/**",
    ".vercel/**",
    "node_modules/**",
    "dist/**",
    "dev-dist/**",
    "build/**",
    "coverage/**",
    "public/**",
    "package-lock.json",
  ]),
]);
