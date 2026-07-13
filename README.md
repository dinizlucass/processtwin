# ProcessTwin

Gêmeo digital corporativo — mapeamento, modelagem e governança de processos, com um copiloto de IA para acelerar a documentação.

MVP com 3 telas + repositório de processos:

- **Visão Executiva** (`/dashboard`) — KPIs, maturidade por departamento e ações pendentes, calculados a partir dos processos reais (regra de revisão por criticidade da governança B3: alta = 365 dias, média = 548 dias, baixa = 730 dias).
- **Mapeamento via IA** (`/mapeamento`) — copiloto de entrevista guiada que usa a API da OpenAI (tool calling) pra extrair os atributos do processo e criar o registro no repositório.
- **Modelagem Manual** (`/modelagem/[id]`) — canvas BPM (React Flow) com tarefa/decisão/início/fim, ícone de manual/semiautomática/automatizada por tarefa, e painel de propriedades.
- **Repositório de Processos** (`/processos`) — lista todos os processos, com criação rápida de um novo.

## Stack

Next.js 16 (App Router) + TypeScript + Tailwind v4, React Flow (`@xyflow/react`), Supabase (Postgres, sem auth ainda — acesso via service role no backend), OpenAI (`gpt-4o-mini` por padrão).

## Rodando localmente

```bash
cd web
npm install
cp .env.local.example .env.local   # preenche as chaves, veja abaixo
npm run dev
```

## Variáveis de ambiente (`web/.env.local`)

| Variável | Onde pegar |
|---|---|
| `OPENAI_API_KEY` | platform.openai.com → API keys |
| `OPENAI_MODEL` | opcional, default `gpt-4o-mini` |
| `SUPABASE_URL` | Supabase → Project Settings → Data API (só a URL base, sem `/rest/v1`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → `service_role` (secreta) |

Schema do banco: `web/supabase/schema.sql` (rodar uma vez no SQL Editor do projeto Supabase — cria as tabelas e semeia processos de exemplo).

## Deploy (Vercel)

O app fica em `web/`, não na raiz do repo — em **Project Settings → General → Root Directory**, configura `web`. Depois adiciona as 4 variáveis de ambiente acima em **Project Settings → Environment Variables**.

## Estrutura do repositório

- `web/` — o app Next.js (o código de verdade)
- `project/` — bundle de handoff do Claude Design (mockups originais em `.dc.html`), mantido só como referência
- `.claude/launch.json` — config do Claude Code pra rodar o dev server
