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
      // Orcamento de tamanho e complexidade: tudo "warn" de proposito. Sao
      // numeros para comecar conversa sobre fatiamento, nao portao - cada um
      // sobe para "error" quando a contagem dele chegar a zero.
      complexity: ["warn", 12],
      "max-depth": ["warn", 4],
      "max-statements": ["warn", 20],
      "max-params": ["warn", 4],
      "max-lines-per-function": [
        "warn",
        { max: 150, skipBlankLines: true, skipComments: true },
      ],
      "max-nested-callbacks": ["warn", 3],
      // Teto de 350 linhas. Cinco arquivos ja nasceram acima dele; em vez de
      // rebaixar a regra inteira para "warn", eles estao listados aqui pelo
      // nome com o tamanho medido em 07/09/2026. A regra fica em "error"
      // para todo o resto - arquivo novo ja nasce dentro do teto. Cada linha
      // apagada daqui e uma divida quitada; a lista deve so encolher.
      "quality/max-lines": [
        "error",
        {
          max: 350,
          ignore: [
            "src/lib/utils.js", // 372 linhas
          ],
        },
      ],
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
          modules: ["../lib/supabase", "./supabase"],
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
