# Calcum Smart Finance

Calcum e uma aplicacao pessoal de controle financeiro para uso familiar. O projeto importa extratos OFX e faturas PDF, permite lancamentos manuais e por voz/texto, grava transacoes no Supabase, usa Supabase Auth/RLS para isolamento por organizacao e classifica despesas com um pipeline de memoria, similaridade trigram e IA via Anthropic.

## Stack

- TanStack Start + TanStack Router
- React 19
- Bun + Vite
- Tailwind CSS v4 + shadcn/ui
- Supabase Auth/Postgres/RLS
- Anthropic SDK para extracao de PDF e classificacao assistida
- OpenAI apenas para transcricao de audio do registro por voz

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
OPENAI_API_KEY=
OPENAI_TRANSCRIPTION_MODEL=
```

`OPENAI_API_KEY` e usada exclusivamente para transformar audio gravado em texto no registro por voz. O texto transcrito continua sendo interpretado e classificado pelo pipeline existente via Anthropic. `OPENAI_TRANSCRIPTION_MODEL` e opcional; quando ausente, o app usa `gpt-4o-mini-transcribe`.

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

## Fluxos principais

- `/`: lancamentos do dia a dia, registro manual, texto ditado/gravacao de voz e lista de transacoes.
- `/conciliacao`: importacao OFX/PDF, itens de extrato e conciliacao contra lancamentos manuais.
- `/dashboard`: resumo do mes, despesas por categoria, comparacao com o mes anterior e pendencias de revisao.
- `/reports`: despesas por categoria, por conta/cartao, maiores despesas, recorrencias e comparacao mensal.
- `/settings`: gestao de categorias e contas/cartoes.

Os totais e relatorios sao calculados por SQL/RPC no Supabase. A IA via Anthropic e usada apenas para extracao/interpretação de texto/PDF e sugestao/classificacao de categoria. A OpenAI e usada somente para transcrever audio em texto antes desse pipeline.

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
