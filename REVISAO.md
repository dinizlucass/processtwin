# Revisão e testes do ProcessTwin — 06/09/2026

## Resultado

**MVP funcional para homologação controlada.** Os fluxos testados de entrevista, geração, revisão, criação, edição, reabertura e conexão entre processos funcionaram com as APIs reais da OpenAI e o Supabase configurado. Isso não é certificação BPMN, validação de todas as regras de negócio nem liberação para produção pública.

## Correções desta etapa

- Commit de IA em uma única transação PostgreSQL: responsável, pasta, processo, nós, raias, arestas, sistemas, recomendações e conversa.
- Idempotência persistente com chave UUID e comparação do conteúdo: retries retornam o mesmo processo; reutilização com conteúdo diferente é rejeitada. Três requisições concorrentes foram testadas no Supabase.
- Editor envia suas posições e propriedades no primeiro commit; removida a segunda gravação em `/api/flow` que podia deixar dados incompletos.
- Conversas são salvas em sequência e aguardadas antes do commit. Autosave atrasado não reabre nem desassocia uma conversa concluída.
- Validação comum antes da persistência de fluxos. Diagnóstico detecta ciclos sem saída, elementos inalcançáveis, extremos inexistentes, direções inválidas de início/fim e condições repetidas; aceita gateways de convergência.
- Transcrição respeita o formato MIME do áudio e limita tamanho. Extração textual usa o modelo configurado e não registra a transcrição integral nos logs.
- Instruções da IA reforçadas para preservar área/criticidade e não inventar cargos, decisões ou automações. O teste de fidelidade após o ajuste passou.
- Voz: tratamento de callbacks de sessões antigas e erros de inicialização; envio por texto continua disponível sem Web Speech. O seletor que não alterava de fato o microfone virou lista informativa: a captura ao vivo usa o padrão do navegador.

## Evidência de execução

### Verificações locais

- ESLint: sem erros/avisos.
- `npm test`: **18 testes aprovados**, incluindo PostgreSQL real em memória (PGlite), rollback de falha tardia, retry, conflito, preservação de propriedades e versão.
- Build de produção e TypeScript: aprovados.
- As migrações 005 e 006 foram aplicadas pelo usuário e sua disponibilidade foi confirmada no Supabase.

### Fluxo real via APIs

Execução `33e6b063-5949-49b8-b774-65b1fe58cbc3`: **12 etapas aprovadas**.

| Etapa | Resultado observado |
| --- | --- |
| Disponibilidade das migrações 005 e 006 | Confirmada por chamada das funções |
| Extração textual | 7 fases preenchidas; aproximadamente 8,6 s |
| Entrevista | OpenAI real, sem fallback; aproximadamente 4,6 s |
| Geração de pré-mapeamento | Retornou nós e arestas; aproximadamente 7,0 s |
| Conversa | Salva e lida com conteúdo preservado |
| 3 commits simultâneos | 1 processo, 2 respostas de replay |
| Chave reutilizada com alterações | HTTP 409, sem duplicação |
| Reabertura | Nós, raias, conexões e conversa preservados |
| Edição e versão antiga | Alteração salva; tentativa desatualizada rejeitada |
| Falha proposital no fim da transação | Nenhum processo, responsável, pasta ou registro de idempotência residual |
| Áudio WAV sintético | Transcrição real correta; aproximadamente 2,7 s |

Duração das chamadas inclui latência local e rede; é uma amostra, não um benchmark de carga. O teste adicional de fidelidade confirmou área, criticidade baixa, executor, tarefas manuais, uma única decisão e caminhos completos. Outro teste confirmou que autosave atrasado retorna 409 e não altera a conversa concluída.

### Interface e grafo

Pela interface: iniciar entrevista → enviar cenário sintético → gerar rascunho → abrir editor → editar nome, descrição e SLA de uma tarefa → salvar → abrir modelador. Os três campos reapareceram intactos em versão 1, comprovando o primeiro commit com o fluxo editado.

Uma conexão dirigida entre os dois processos E2E foi gravada pela API, consultada no banco e verificada visualmente no painel do grafo, com a entrega “E2E: pedido validado para concessão de acesso”.

Processos de exemplo mantidos para inspeção (somente dados sintéticos):

- `E2E-33e6b063 Aprovação de acesso`: `f7b0c296-c18c-46db-a0a1-584fe4240fa5`.
- `E2E-UI-0609 Validação de Pedido`: `8ccd6d94-64f8-4b39-a10d-180e4da87692`.

Relatórios brutos locais: `web/.e2e/33e6b063-5949-49b8-b774-65b1fe58cbc3.json` e `web/.e2e/fidelity.json`. Scripts reproduzíveis: `web/scripts/e2e-live.mjs` e `web/scripts/e2e-fidelity.mjs` (exigem `E2E_LIVE=1`).

## Limites restantes

1. **Produção pública bloqueada por autenticação/autorização ausentes nas APIs.** Os testes transacionais não resolvem o controle de acesso HTTP.
2. **Microfone físico e reconhecimento ao vivo não foram homologados com fala humana.** O áudio sintético validou o endpoint de transcrição; não equivale a testar dispositivo físico, permissões e serviço de reconhecimento do navegador.
3. **IA exige revisão do responsável pelo processo.** A primeira amostra omitiu criticidade e fez inferências; as instruções foram corrigidas e o cenário de fidelidade passou, mas uma amostra não prova fidelidade geral. Regras empresariais reais e processos mais complexos precisam de homologação.
4. **Escopo de testes:** dois cenários sintéticos, concorrência de três chamadas, sem ensaio de carga prolongada, sem certificação completa BPMN. O aviso de alterações não salvas protege fechamento/recarregamento; navegação interna ainda requer salvar antes de sair.

Nenhum processo de negócio preexistente foi alterado ou removido pelos testes.
