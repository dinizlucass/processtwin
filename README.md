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
| `OPENAI_MAPPING_MODEL` | extração, entrevista com transcrição, geração e revisão; default `gpt-5.4-mini` |
| `SUPABASE_URL` | Supabase → Project Settings → Data API (só a URL base, sem `/rest/v1`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → `service_role` (secreta) |

Schema do banco: `web/supabase/schema.sql` (rodar uma vez no SQL Editor do projeto Supabase — cria as tabelas e semeia processos de exemplo).

## Deploy (Vercel)

O app fica em `web/`, não na raiz do repo — em **Project Settings → General → Root Directory**, configura `web`. Depois adiciona as 4 variáveis de ambiente acima em **Project Settings → Environment Variables**.

## Estrutura do repositório

- `web/` — o app Next.js (o código de verdade)
- `project/` — bundle de handoff do Claude Design (mockups originais em `.dc.html`), mantido só como referência
- `.claude/launch.json` — config do Claude Code pra rodar o dev server

## Melhorias do modelador e validação

- Inserção por clique ou arraste, encaixe na grade e organização automática com opção de desfazer a organização.
- Validação de início/fim, caminhos sem saída, elementos inalcançáveis e condições de decisões.
- Grafo com conexões manuais direcionadas, descrição da entrega, busca por código/nome e visão de conexões diretas.
- Painéis contextuais; preferências de recolhimento preservadas no navegador.

Antes de usar o novo salvamento, execute `web/supabase/migrations/005_atomic_flow_save.sql` no SQL Editor do Supabase. A função salva nós, raias, conexões e versão em uma única transação e rejeita alterações com versão desatualizada. Sem a migração, o endpoint retorna 409 sem apagar o fluxo existente. Não há fallback para o salvamento destrutivo anterior.

Verificações locais: `cd web`, `npm run lint`, `npm test` e `npm run build`.

Limites atuais: o projeto ainda não possui autenticação/autorização nas APIs; não deve ser exposto publicamente como está. A validação visual é estrutural e não certifica conformidade BPMN. O aviso de alterações não salvas protege recarregamento/fechamento da aba; a navegação interna ainda exige salvar antes de sair.


## Commit atômico e testes E2E (06/09/2026)

Aplicar também `web/supabase/migrations/006_atomic_mapping_commit.sql`. A migração 006 e a 005 foram confirmadas no Supabase nesta revisão. O commit de IA agora salva processo, responsável, pasta, fluxo editado, sistemas, recomendações e vínculo com a conversa em uma transação. A API exige `requestId` UUID: repetir chave e conteúdo retorna o mesmo processo; mudar o conteúdo com a mesma chave retorna 409. O editor envia o fluxo final nessa mesma chamada.

`npm test` executa testes locais, incluindo PostgreSQL em memória com PGlite, sem serviços externos. Para repetir o E2E real em PowerShell: `$env:E2E_LIVE='1'` e `npm run test:e2e` a partir de `web/`, com a aplicação rodando em localhost:3000. Esse teste faz chamadas reais de IA e cria um processo identificado por `E2E-`; resultados e IDs ficam em `web/.e2e/`. Se `voice-sample.wav` existir nessa pasta, também testa a transcrição de áudio. Não executa limpeza automática de dados existentes.

Resultados, limites e processos de exemplo: `REVISAO.md`.

## Fidelidade da transcrição (12/09/2026)

A extração preserva a transcrição integral e cria um inventário separado de regras, exceções, controles e retornos com trechos conferidos na fonte. Os dados explícitos podem marcar fases como cobertas, sem reconfirmação. Perguntas sobre caminhos ausentes têm prioridade sobre metadados opcionais. Conversas antigas sem texto original continuam compatíveis, mas precisam de novo upload para recuperar detalhes que o resumo antigo perdeu.

A geração usa a fonte original, faz uma revisão independente do conteúdo e verifica a estrutura. Se houver problemas, tenta corrigir o mapa uma vez. A seção **Conferência da transcrição** mostra associações propostas pela IA, lacunas e problemas restantes; não é uma certificação de negócio/BPMN. Alterações manuais posteriores precisam de nova conferência. As pendências também são gravadas como recomendações; o documento e seu inventário ficam no JSON da conversa, sem migração adicional.

O modelo de mapeamento é separado do chat curto por `OPENAI_MAPPING_MODEL`. O padrão é `gpt-5.4-mini`, com raciocínio médio na extração, geração e revisão. A geração usa Responses com saída JSON estruturada; a entrevista mantém tool calling sem raciocínio no Chat Completions. A extração realiza duas chamadas em paralelo; a geração realiza duas chamadas ou quatro quando precisa de correção. Isso aumenta custo e latência em relação ao fluxo anterior. É possível selecionar outro modelo compatível pela variável, mas repetir os testes de fidelidade é necessário. Veja a comparação medida e as limitações em [AVALIACAO_IA.md](AVALIACAO_IA.md).

Teste real com um documento local, sem criar processos no banco: em `web/`, execute `$env:E2E_LIVE='1'` e `node scripts/e2e-transcript.mjs 'C:\caminho\transcricao.txt'`. Os resultados ficam em `.e2e/`, fora do Git. O teste verifica preservação da fonte, rastreabilidade e estrutura; o conteúdo do processo exige avaliação adicional.
