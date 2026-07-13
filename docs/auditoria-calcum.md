# Auditoria tecnica do repositorio Calcum

Data da auditoria: 2026-07-13  
Repositorio auditado: `/Users/newcorp/Calcum/calcum-smart-finance`  
Escopo: diagnostico tecnico do estado atual. Nao foram feitas correcoes ou refatores.

## 1. Stack e dependencias

### Framework principal

- O projeto ainda usa TanStack Start / TanStack Router.
- Versoes declaradas em `package.json`:
  - `@tanstack/react-start`: `^1.168.26`
  - `@tanstack/react-router`: `^1.170.16`
  - `@tanstack/react-query`: `^5.101.1`
  - `@tanstack/router-plugin`: `^1.168.18`
- O build usa Vite:
  - `vite`: `^8.0.16`
  - `@lovable.dev/vite-tanstack-config`: `^2.6.2`
- O arquivo `vite.config.ts` importa `defineConfig` de `@lovable.dev/vite-tanstack-config`, que encapsula TanStack Start, React, Tailwind, Nitro, alias `@`, injecao de env `VITE_*` e plugins do Lovable.

### Gerenciador de pacotes e runtime

- Ha `bun.lock` e `bunfig.toml`; o gerenciador pratico do projeto e Bun.
- Versao local encontrada:
  - Node: `v24.15.0`
  - Bun: `1.3.13`
- Nao ha `engines`, `packageManager`, `.nvmrc`, `.node-version` ou equivalente declarando versao exigida de Node/Bun. A exigencia de runtime nao esta formalizada.

### Dependencias relevantes

UI e design:

- React `^19.2.0`, React DOM `^19.2.0`
- Tailwind CSS `^4.2.1`
- `@tailwindcss/vite` `^4.2.1`
- `tw-animate-css` `^1.3.4`
- shadcn/ui configurado via `components.json`, estilo `new-york`, `baseColor: slate`, icones `lucide`.
- Radix UI instalado para praticamente toda a familia de componentes shadcn.
- `lucide-react` `^0.575.0`
- `class-variance-authority`, `clsx`, `tailwind-merge`
- `sonner`, `vaul`, `cmdk`, `embla-carousel-react`, `react-day-picker`, `react-resizable-panels`, `input-otp`

Formularios e validacao:

- `react-hook-form` `^7.71.2`
- `@hookform/resolvers` `^5.2.2`
- `zod` `^3.24.2`

Dados e backend:

- `@supabase/supabase-js` `^2.108.2`
- `@tanstack/react-query` instalado e configurado no root, mas sem uso relevante de queries na UI atual.

Graficos:

- `recharts` `^2.15.4`; existe wrapper shadcn em `src/components/ui/chart.tsx`, mas nao ha tela real usando graficos Recharts.

PDF e IA:

- `pdfjs-dist` `^6.1.200`
- `@anthropic-ai/sdk` `^0.106.0`

Build e qualidade:

- TypeScript `^5.8.3`
- ESLint `^9.32.0`
- Prettier `^3.7.3`
- Nitro `3.0.260603-beta`

### Dependencias possivelmente nao usadas

Analise feita por referencias em `src`, configuracoes e arquivos de UI:

- `@hookform/resolvers`: instalado, sem referencia em codigo.
- `zod`: instalado, sem referencia em codigo.
- `date-fns`: instalado, sem referencia em codigo.
- `vite-tsconfig-paths`: instalado, mas o build informa que Vite ja suporta `resolve.tsconfigPaths` nativamente; alem disso, a config Lovable ja encapsula plugins.
- `@tanstack/router-plugin`: sem referencia direta; pode ser usado indiretamente pela config Lovable.
- `@tailwindcss/vite`: sem referencia direta; pode ser usado indiretamente pela config Lovable.
- Muitos componentes shadcn/Radix existem em `src/components/ui`, mas a aplicacao real usa quase so `Select` na rota `/`; o restante e biblioteca scaffoldada, nao funcionalidade de produto.

### Dependencias desatualizadas

Foi executado `npm outdated --json` com acesso ao registry em 2026-07-13. Ha varias atualizacoes disponiveis. Exemplos relevantes:

- `@anthropic-ai/sdk`: instalado `0.106.0`, latest `0.111.0`
- `@supabase/supabase-js`: instalado `2.108.2`, latest `2.110.3`
- `@tanstack/react-start`: instalado `1.168.26`, latest `1.168.27`
- `@tanstack/react-router`: instalado `1.170.16`, latest `1.170.17`
- `@lovable.dev/vite-tanstack-config`: instalado `2.6.2`, latest `2.7.2`
- `react` / `react-dom`: instalado `19.2.5`, latest `19.2.7`
- `tailwindcss` / `@tailwindcss/vite`: instalado `4.2.4`, latest `4.3.2`
- `vite`: instalado `8.0.16`, latest `8.1.4`
- `nitro`: instalado `3.0.260603-beta`, latest `3.0.260610-beta`
- `recharts`: instalado `2.15.4`, latest `3.9.2`
- `zod`: instalado `3.25.76`, latest `4.4.3`
- `typescript`: instalado `5.9.3`, latest `7.0.2`

Observacao: as versoes instaladas em `node_modules` nao coincidem exatamente com todas as versoes minimas/ranges em `package.json`, por causa da resolucao do lockfile.

### Deploy

- O build usa Nitro com preset Cloudflare Module.
- `vite.config.ts` comenta que a config Lovable usa Nitro com Cloudflare como target padrao.
- `bun run build` passou.
- O build gerou:
  - `.output/nitro.json`
  - `.output/server/wrangler.json`
  - `.wrangler/deploy/config.json`
- `.output/nitro.json` indica:
  - preset `cloudflare-module`
  - Nitro `3.0.260603-beta`
  - comandos de preview/deploy via Wrangler
- `.output/server/wrangler.json` indica worker `szenha-calcum-smart-finance`, `compatibility_date: 2026-06-25`, `nodejs_compat`.
- Nao foi feito deploy real nesta auditoria. O build local esta funcional; a funcionalidade de deploy depende de credenciais/ambiente Cloudflare externos.

## 2. Backend e persistencia

### Supabase

- Existe client Supabase em `src/lib/supabase/client.ts`.
- Variaveis esperadas:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- Existe `.env` local com essas variaveis e tambem `ANTHROPIC_API_KEY`.
- Nao existe `.env.example`.
- Nao existe `supabase/config.toml`; ha apenas `supabase/migrations`.

### Autenticacao

- A autenticacao usa Supabase Auth.
- `/login` usa:
  - `supabase.auth.signInWithPassword`
  - `supabase.auth.signUp`
- `/` protege a rota com `supabase.auth.getUser()` em `beforeLoad`.
- `getOrCreateOrganization()` chama RPC `ensure_user_organization`.
- Migrations criam trigger em `auth.users` (`handle_new_user`) para criar organizacao automaticamente no signup.
- O fluxo parece implementado no codigo, mas nao foi validado contra um Supabase remoto nesta auditoria.

### Migrations SQL existentes

Arquivos:

- `20240101000000_initial_schema.sql`
- `20240101000001_dev_disable_rls.sql`
- `20240101000002_reenable_rls.sql`
- `20240101000003_server_side_org.sql`
- `20240101000004_pdf_import_schema.sql`
- `20240101000005_installment_plans.sql`
- `20240101000006_classification_pipeline.sql`

### Tabelas e relacionamentos

`organizations`

- `id uuid primary key default uuid_generate_v4()`
- `name text not null`
- `owner_id uuid not null references auth.users(id) on delete restrict`
- `created_at timestamptz not null default now()`

`organization_members`

- `id uuid primary key`
- `organization_id uuid not null references organizations(id) on delete cascade`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `role member_role not null default 'visualizador'`
- `invited_by uuid references auth.users(id)`
- `created_at timestamptz not null default now()`
- unique `(organization_id, user_id)`

`categories`

- `id uuid primary key`
- `organization_id uuid not null references organizations(id) on delete cascade`
- `name text not null`
- `type category_type not null`
- `color text`
- `icon text`
- `parent_id uuid references categories(id) on delete set null`
- `created_by uuid references auth.users(id)`
- `created_at timestamptz not null default now()`

`statement_imports`

- Base:
  - `id uuid primary key`
  - `organization_id uuid not null references organizations(id) on delete cascade`
  - `filename text not null`
  - `account_id text not null`
  - `account_kind account_kind not null`
  - `bank_id text`
  - `currency text not null default 'BRL'`
  - `period_start timestamptz`
  - `period_end timestamptz`
  - `transaction_count integer not null default 0`
  - `status import_status not null default 'pending'`
  - `error_message text`
  - `imported_by uuid references auth.users(id)`
  - `created_at timestamptz not null default now()`
- PDF migration adiciona:
  - `source import_source not null default 'ofx_file'`
  - `declared_total numeric(15,2)`
  - `extracted_total numeric(15,2)`
  - `requires_review boolean not null default false`
- Parcelamentos adicionam:
  - `declared_future_installments numeric(15,2)`
  - `calculated_future_installments numeric(15,2)`

`transactions`

- Base:
  - `id uuid primary key`
  - `organization_id uuid not null references organizations(id) on delete cascade`
  - `statement_import_id uuid references statement_imports(id) on delete set null`
  - `category_id uuid references categories(id) on delete set null`
  - `amount numeric(15,2) not null`
  - `description text not null default ''`
  - `memo text`
  - `posted_at timestamptz not null`
  - `fit_id text not null`
  - `type text not null`
  - `account_id text not null`
  - `account_kind account_kind not null`
  - `bank_id text`
  - `currency text not null default 'BRL'`
  - `check_number text`
  - `created_by uuid references auth.users(id)`
  - `created_at timestamptz not null default now()`
  - unique `(organization_id, account_id, fit_id)`
- PDF migration adiciona:
  - `extraction_confidence numeric(4,3)`
  - `extraction_source_excerpt text`
- Parcelamentos adicionam:
  - `installment_plan_id uuid references installment_plans(id) on delete set null`
  - `installment_number integer`
- Classificacao adiciona:
  - `classification_method text check in ('memoria_exata', 'regra_similaridade', 'ia', 'manual')`
  - `classification_confidence numeric(4,3) check between 0 and 1`
  - `needs_review boolean not null default false`

`classification_memory`

- `id uuid primary key`
- `organization_id uuid not null references organizations(id) on delete cascade`
- `pattern text not null`
- `category_id uuid not null references categories(id) on delete cascade`
- `confidence numeric(4,3) not null default 1.0 check between 0 and 1`
- `match_count integer not null default 1`
- `last_matched_at timestamptz not null default now()`
- `created_at timestamptz not null default now()`
- unique `(organization_id, pattern)`

`installment_plans`

- `id uuid primary key default gen_random_uuid()`
- `organization_id uuid references organizations(id) on delete cascade`
- `account_id text not null`
- `description_normalized text not null`
- `total_installments integer not null`
- `installment_amount numeric(15,2) not null`
- `first_seen_statement_import_id uuid references statement_imports(id) on delete set null`
- `current_installment_paid integer not null default 0`
- `status text not null default 'ativo' check in ('ativo', 'concluido', 'cancelado')`
- `confirmed_by uuid references auth.users(id)`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

### Enums, funcoes, indices e RPCs

Enums:

- `member_role`: `admin`, `colaborador`, `visualizador`
- `category_type`: `income`, `expense`, `transfer`
- `account_kind`: `checking`, `credit_card`, `investment`
- `import_status`: `pending`, `processing`, `completed`, `failed`

Inconsistencia importante:

- A migration `20240101000004_pdf_import_schema.sql` usa `import_source`, mas a criacao do enum esta comentada e o comentario diz que ele ja existe com valores `ofx_manual`, `pdf_manual`, `open_finance`.
- A mesma migration define default `'ofx_file'`, que nao aparece nos valores comentados.
- O codigo insere `source: "ofx_manual"` e `source: "pdf_manual"`.
- Em um banco novo rodando apenas estas migrations, essa migration tende a falhar se `import_source` nao existir previamente. Se existir com os valores comentados, o default `'ofx_file'` tambem tende a falhar.

Funcoes/RPCs:

- `is_org_member(org_id uuid)`
- `is_org_contributor(org_id uuid)`
- `is_org_admin(org_id uuid)`
- `add_owner_as_admin()`
- `handle_new_user()`
- `ensure_user_organization()`
- `find_classification(p_org_id uuid, p_pattern text, p_min_similarity float default 0.6)`

Indices:

- `idx_transactions_org_posted`
- `idx_transactions_import`
- `idx_transactions_category`
- `idx_installment_plans_org_account`
- `idx_classification_memory_pattern_trgm`

### RLS

RLS e habilitado no schema inicial para:

- `organizations`
- `organization_members`
- `categories`
- `statement_imports`
- `transactions`
- `classification_memory`

RLS e habilitado tambem em:

- `installment_plans`

Politicas:

- `organizations`: `org_select`, `org_insert`, `org_update`, `org_delete`
- `organization_members`: `members_select`, `members_insert`, `members_update`, `members_delete`
- `categories`: `categories_select`, `categories_insert`, `categories_update`, `categories_delete`
- `statement_imports`: `imports_select`, `imports_insert`, `imports_update`, `imports_delete`
- `transactions`: `transactions_select`, `transactions_insert`, `transactions_update`, `transactions_delete`
- `classification_memory`: `memory_select`, `memory_insert`, `memory_update`, `memory_delete`
- `installment_plans`: `plans_select`, `plans_insert`, `plans_update`, `plans_delete`

Observacao:

- Existe migration `20240101000001_dev_disable_rls.sql` que desabilita RLS e cria organizacao fixa de teste.
- Existe migration `20240101000002_reenable_rls.sql` que remove essa organizacao e reabilita RLS.
- Como ambas existem sequencialmente no repo, o estado final esperado, se todas rodarem em ordem, e RLS reabilitado. Isso nao foi validado em banco real.

## 3. Parser de OFX

### Estado dos arquivos

`src/lib/ofx/` existe e contem:

- `index.ts`
- `parser.ts`
- `types.ts`

O parser esta integro no sentido de existir, compilar no typecheck e ser usado pela UI.

### Suporte declarado/implementado

Pela leitura de `parser.ts` e `types.ts`, o parser suporta:

- OFX 1.x SGML, com header `OFXHEADER:100` e tags folha sem fechamento.
- OFX 2.x XML, detectado por `<?xml ...?>` ou header `OFXHEADER=200`.
- Encodings:
  - `windows-1252`
  - `iso-8859-1`
  - `utf-8`
  - `ascii`
  - aliases como `1252`, `cp1252`, `8859-1`, `iso8859-1`, `usascii`, `unicode`
- Datas OFX:
  - `YYYYMMDD`
  - `YYYYMMDDHHMMSS`
  - fracoes `.XXX`
  - fuso `[+/-N:TZ]`
- Valores com virgula ou ponto decimal.
- Multiplos extratos no mesmo arquivo.
- Tipos de extrato:
  - conta corrente: `STMTRS`
  - cartao de credito: `CCSTMTRS`
  - investimento: `INVSTMTRS`
- Filtros defensivos:
  - linhas informativas de saldo de bancos brasileiros
  - `FITID` sintetico deterministico quando ausente
  - fallback de data para periodo do extrato quando `DTPOSTED` esta ausente/invalido.

### Testes do parser

- Nao existem arquivos `.test.*`, `.spec.*`, `_test_` ou `_spec_` no repositorio.
- `bun test` retornou: `No tests found!`
- Portanto, nao ha suite automatizada do parser neste estado do repo.

### Integracao com UI

O parser nao e mais uma biblioteca isolada:

- `src/routes/index.tsx` importa `parseOfx` e `OfxParseError`.
- A tela `/` possui fluxo de upload OFX.
- O fluxo parseia o arquivo, cria registros em `statement_imports`, faz `upsert` em `transactions`, recarrega a lista e chama a classificacao automatica.

### PDF de fatura de cartao

Ha suporte parcial/funcional em codigo para PDF de fatura:

- `src/lib/pdf/extract-text.ts` extrai texto com `pdfjs-dist`.
- `src/lib/ai/extract-transactions.ts` usa Anthropic para extrair transacoes estruturadas a partir do texto.
- `src/routes/index.tsx` tem fluxo de upload PDF, total declarado, revisao das transacoes, confirmacao e gravacao no Supabase.
- Ha suporte parcial a parcelamentos via padrao `PARC XX/YY` e tabela `installment_plans`.

Limites/risco:

- Nao ha OCR de imagem; o suporte depende do texto extraivel pelo `pdfjs-dist`.
- Ha logs `DEBUG — remove before production`.
- A migration de PDF tem inconsistencia no enum `import_source`, descrita na secao de backend.

## 4. Telas e UI

### Rotas existentes

Rotas geradas em `src/routeTree.gen.ts`:

- `/`
- `/landing`
- `/login`

### Classificacao por rota

`/landing`

- Classificacao: UI construida, mas sem dados reais.
- E uma landing page com mockups, copy de produto, secoes de beneficios, insights e seguranca.
- Usa majoritariamente estilos inline e dados ficticios.
- Nao se conecta ao backend.

`/login`

- Classificacao: funcional e conectada a dados reais.
- Usa Supabase Auth para login e cadastro por email/senha.
- Chama `getOrCreateOrganization()` apos login/signup quando ha sessao.
- UI construida com estilos inline, nao com componentes shadcn.

`/`

- Classificacao: funcional e conectada a dados reais, com ressalvas.
- Exige usuario autenticado.
- Funcionalidades encontradas:
  - upload OFX
  - upload PDF
  - extracao de PDF por IA
  - revisao de transacoes de PDF
  - deteccao/revisao de parcelamentos
  - gravacao em `statement_imports`, `transactions`, `installment_plans`
  - listagem de transacoes
  - filtro por conta
  - totais basicos de entradas, saidas, saldo e totais de cartao
  - classificacao automatica por memoria, similaridade e IA
  - ajuste manual de categoria
- Ressalvas:
  - A UI e uma tela grande monolitica em `src/routes/index.tsx`, com estilos inline.
  - Nao ha dashboard real separado.
  - Nao ha relatorios completos.
  - A funcionalidade depende de migrations corretas no Supabase; ha inconsistencia no enum de PDF.

### shadcn/ui

shadcn/ui esta instalado/configurado:

- `components.json` presente.
- Pasta `src/components/ui` contem muitos componentes.

Componentes efetivamente usados em telas de produto:

- `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` em `src/routes/index.tsx`.

Outros componentes existem, mas nao sao usados por telas reais do produto. Alguns componentes usam uns aos outros internamente.

### Telas de transacao, dashboard e relatorio

- Registro manual de transacao: nao existe.
- Importacao de transacoes: existe em `/`, via OFX e PDF.
- Listagem de transacoes: existe em `/`.
- Dashboard: nao existe como tela real; ha mockup visual na landing e totais simples na rota `/`.
- Relatorios: nao existem como telas reais.

## 5. Integracao com IA

Existe integracao com Anthropic.

Arquivos:

- `src/lib/ai/extract-transactions.ts`
- `src/lib/classification/ai.ts`

Variavel esperada:

- `ANTHROPIC_API_KEY`

Modelo configurado:

- `claude-sonnet-4-6`

Funcionalidades implementadas:

- Extracao estruturada de fatura PDF:
  - recebe texto bruto de PDF
  - divide em lotes
  - chama Anthropic por server function
  - espera JSON com `transactions`, `partial_total`, `declared_future_installments`
  - extrai data, descricao, valor, confianca, trecho-fonte e parcelamento
- Classificacao automatica de categoria:
  - camada 1: memoria exata em `classification_memory`
  - camada 2: similaridade trigram via RPC `find_classification`
  - camada 3: IA via Anthropic
- Aprendizado com correcao manual:
  - `learnFromConfirmation()` atualiza a transacao e faz upsert em `classification_memory`.

Nao encontrado:

- Transcricao de audio.
- Registro por voz.
- OpenAI.
- Prompts externos/versionados fora do codigo.

## 6. Qualidade tecnica geral

### Lint

Comando executado:

```bash
bun run lint
```

Resultado: falhou.

Resumo:

- 458 erros
- 7 warnings
- 458 erros fixaveis automaticamente

Principais causas:

- Quase todos os erros sao `prettier/prettier`.
- Warnings de Fast Refresh em componentes shadcn que exportam variantes/helpers.
- Um warning de hook em `src/routes/index.tsx`: dependencia ausente `navigate` no `useEffect`.

Arquivos com problemas:

- `src/lib/ai/extract-transactions.ts`: 11 erros Prettier
- `src/lib/classification/ai.ts`: 4 erros Prettier
- `src/lib/classification/pipeline.ts`: 27 erros Prettier
- `src/lib/ofx/parser.ts`: 6 erros Prettier
- `src/lib/ofx/types.ts`: 1 erro Prettier
- `src/routes/index.tsx`: 145 erros Prettier, 1 warning `react-hooks/exhaustive-deps`
- `src/routes/landing.tsx`: 173 erros Prettier
- `src/routes/login.tsx`: 91 erros Prettier
- `src/components/ui/badge.tsx`, `button.tsx`, `form.tsx`, `navigation-menu.tsx`, `sidebar.tsx`, `toggle.tsx`: warnings `react-refresh/only-export-components`

### Typecheck

Comando executado:

```bash
bunx tsc --noEmit
```

Resultado: passou sem erros.

### Testes

Comando executado:

```bash
bun test
```

Resultado: falhou por ausencia de testes.

Mensagem:

- `No tests found!`

Nao ha suite automatizada completa no repositorio.

### Build

Comando executado:

```bash
bun run build
```

Resultado: passou.

Warnings relevantes:

- Vite informa que `vite-tsconfig-paths` pode ser removido e substituido por `resolve.tsconfigPaths: true`.
- Alguns chunks passam de 500 kB apos minificacao.
- O bundle inclui artefatos grandes:
  - `pdf.worker.min` aproximadamente 1.25 MB
  - chunk de `extract-text` aproximadamente 424 kB
  - chunk principal `index` aproximadamente 547 kB

### Variaveis de ambiente

- Existe `.env`.
- Nao existe `.env.example`.
- Variaveis usadas no codigo:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `ANTHROPIC_API_KEY`
- Como nao ha `.env.example`, nao ha documentacao versionada das variaveis necessarias.

### README e documentacao

- Nao ha `README.md` na raiz.
- Nao havia pasta `docs/` antes desta auditoria.
- Existe `src/routes/README.md`, que documenta convencoes de rotas do TanStack Start.
- Essa documentacao de rotas esta alinhada com a estrutura geral, mas e generica; nao documenta o produto Calcum, Supabase, IA, migrations, deploy ou fluxos de importacao.

### Estado do Git

Ha muitas mudancas nao commitadas no workspace:

- `.gitignore`
- `bun.lock`
- `package.json`
- `src/lib/ofx/parser.ts`
- `src/lib/ofx/types.ts`
- `src/routeTree.gen.ts`
- `src/routes/index.tsx`
- novas pastas/arquivos como `public/`, `src/lib/ai/`, `src/lib/classification/`, `src/lib/pdf/`, `src/lib/supabase/`, `src/routes/landing.tsx`, `src/routes/login.tsx`, `supabase/`.

Historico recente de commits:

- `e3f8737` - 2026-06-28 - Implementou parser OFX isolado
- `2b51aa4` - 2026-06-28 - Changes
- `044e8e2` - 2026-06-28 - Changes
- `cb75921` - 2025-01-01 - template: tanstack_start_ts_current-40f3c252c0da

Nao ha 15 a 20 commits disponiveis; o historico local contem apenas 4 commits.

## 7. Divergencias com o plano de produto

O prompt menciona que um plano de produto detalhado seria colado junto com a solicitacao, mas esse plano nao foi incluido no contexto recebido nesta auditoria. Portanto, nao e possivel comparar item a item contra esse plano especifico sem presumir conteudo.

Comparacao baseada apenas nos itens citados no prompt:

### Ja existe e pode ser reaproveitado

- Stack TanStack Start/TanStack Router.
- Parser OFX maduro e conectado a fluxo real.
- Supabase client.
- Auth por Supabase email/senha.
- Schema SQL multi-tenant com organizacoes, membros, categorias, imports, transacoes e memoria de classificacao.
- RLS e politicas por organizacao.
- Importacao OFX para `statement_imports` e `transactions`.
- Listagem basica de transacoes.
- Classificacao automatica em tres camadas.
- Extracao de texto de PDF e extracao estruturada via IA.
- Tabela e fluxo basico de parcelamentos.

### Existe parcialmente e precisa de ajuste

- Persistencia Supabase: existe, mas migrations tem inconsistencia no enum `import_source`.
- Deploy Cloudflare/Nitro: build funciona, mas deploy real nao foi validado.
- shadcn/ui: instalado, mas quase nao usado nas telas reais.
- Dashboard: ha apenas mockup na landing e totais simples na tela principal.
- Relatorios: nao existem como modulo; apenas listagem/totais.
- PDF de fatura: existe, mas depende de texto extraivel, tem logs debug e depende de schema corrigido.
- Testes: inexistentes, inclusive para o parser.
- Documentacao: praticamente inexistente para o produto.
- Variaveis de ambiente: usadas, mas nao documentadas em `.env.example`.

### Nao existe e precisaria ser construido do zero

- Registro manual de transacao.
- Registro por voz.
- Transcricao de audio.
- Fluxo de microfone/gravacao.
- Telas dedicadas de dashboard financeiro real.
- Telas dedicadas de relatorios.
- Gestao completa de categorias.
- Gestao de contas.
- Metas financeiras reais.
- Open Finance.
- Exportacao/exclusao de dados do usuario.
- Documentacao operacional de Supabase/deploy.

### Contradicoes ou decisoes tecnicas existentes

- O codigo usa `source: "ofx_manual"` e `source: "pdf_manual"`, mas a migration de PDF usa um enum `import_source` nao criado no repo e default `'ofx_file'`, criando contradicao de schema.
- A aplicacao ja tomou decisao por Anthropic (`claude-sonnet-4-6`) para PDF/classificacao; nao ha OpenAI.
- A estrutura segue TanStack file routes em `src/routes`, nao `src/pages` ou App Router.
- A tela principal concentra muitos fluxos em um unico arquivo (`src/routes/index.tsx`), em vez de telas/componentes separados.
- A UI real usa estilos inline extensivamente, apesar de Tailwind/shadcn estarem instalados.

## Conclusao

O estado atual mudou bastante em relacao ao diagnostico anterior: agora ha tela real em `/`, Supabase Auth, persistencia via Supabase, migrations, importacao OFX conectada, importacao PDF com IA, classificacao automatica e listagem de transacoes. O repositorio ainda tem riscos claros: migrations potencialmente quebradas para PDF, ausencia total de testes, lint falhando por formatacao, ausencia de `.env.example`, historico curto e muitas mudancas ainda nao commitadas.

Relatorio salvo em `docs/auditoria-calcum.md`.
