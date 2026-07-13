# Calcum Smart Finance

Calcum e uma aplicacao pessoal de controle financeiro para uso familiar. O projeto importa extratos OFX e faturas PDF, grava transacoes no Supabase, usa Supabase Auth/RLS para isolamento por organizacao e classifica despesas com um pipeline de memoria, similaridade trigram e IA via Anthropic.

## Stack

- TanStack Start + TanStack Router
- React 19
- Bun + Vite
- Tailwind CSS v4 + shadcn/ui
- Supabase Auth/Postgres/RLS
- Anthropic SDK para extracao de PDF e classificacao assistida

## Configuracao

1. Instale as dependencias:

```bash
bun install
```

2. Crie o arquivo `.env` a partir de `.env.example` e preencha:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
ANTHROPIC_API_KEY=
```

## Desenvolvimento local

```bash
bun run dev
```

## Supabase

As migrations ficam em `supabase/migrations`.

Para aplicar em um projeto Supabase local, tenha Docker/Supabase CLI configurados e rode:

```bash
supabase start
supabase db reset --local
```

Para um projeto remoto/de teste, vincule o projeto pela Supabase CLI e aplique as migrations conforme o fluxo operacional do Supabase.

## Qualidade

Lint:

```bash
bun run lint
```

Testes:

```bash
bun test
```

Typecheck:

```bash
bunx tsc --noEmit
```

Build:

```bash
bun run build
```
