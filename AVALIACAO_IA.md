# Avaliação de IA — 12/09/2026

## Decisão

Usar **GPT-5.4 Mini com raciocínio médio** para extração, geração e revisão do mapeamento. O chat sem documento mantém GPT-4o Mini. `OPENAI_MAPPING_MODEL` permite alterar o modelo sem editar código. A entrevista com documento usa o Mini sem raciocínio explícito.

O modelo completo não apresentou benefício suficiente para justificar seu custo como padrão: no teste com inventário e revisão, excedeu o limite de espera HTTP de aproximadamente cinco minutos. O Mini com raciocínio baixo foi mais rápido, mas apresentou erros relevantes. Esta escolha é provisória até haver avaliação com mais processos e revisores de negócio.

## Comparação controlada

Uma chamada por configuração, mesma transcrição do workshop de compras, mesmo prompt e esquema JSON, sem extração, revisão ou correção posterior. Comparação realizada antes da otimização final que retirou a rastreabilidade da geração e a manteve somente na revisão. Chamadas reais via Responses; preços padrão sem cache. Custos em USD calculados pelo uso retornado pela API, incluindo raciocínio nos tokens de saída.

| Configuração | Entrada | Saída | Tempo | Custo de uma geração | Verificações do cenário | Estrutura |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| GPT-5.4 Mini / low | 3.682 | 6.559 | 26 s | US$ 0,0323 | 8/10 | 1 atividade inalcançável |
| GPT-5.4 Mini / medium | 3.682 | 31.726 | 142 s | US$ 0,1455 | 10/10 | Sem erros detectados |
| GPT-5.4 / medium | 3.682 | 15.045 | 111 s | US$ 0,2349 | 10/10 | Sem erros detectados |

O Mini médio custou cerca de **38% menos** que o completo, mas levou cerca de 31 segundos a mais. O Mini baixo inventou atributos e permitiu cotações sem aprovação prévia do gestor. A presença dos outros elementos não elimina esses defeitos.

Os 10 critérios verificam Compliance, Jurídico, três cotações, faixas de valor, exclusividade, emergência, menção à lacuna regulatória, funções nas raias, ausência de dono/criticidade inventados e aprovação antes das cotações. São verificações específicas, algumas baseadas em texto; não demonstram equivalência semântica completa nem certificam BPMN. Tempos e custos variam entre execuções.

Preços por milhão de tokens: Mini US$ 0,75 entrada / US$ 4,50 saída ([OpenAI](https://developers.openai.com/api/docs/models/gpt-5.4-mini)); completo US$ 2,50 / US$ 15,00 ([OpenAI](https://developers.openai.com/api/docs/models/gpt-5.4)). Esses custos são de **uma geração isolada**, não do fluxo completo: o aplicativo também extrai, entrevista, revisa e eventualmente corrige.

## Ajustes de fidelidade

- Preservação do texto original e inventário com trechos literais conferidos na fonte; resumos não substituem a evidência original.
- Perguntas priorizam lacunas reais nas regras; informação documental explícita não exige reconfirmação.
- Geração e revisão separadas, seguidas de uma tentativa de correção quando há defeitos; pendências e associações propostas aparecem no editor.
- A geração recebe a fonte original; a revisão recebe também o inventário. O gerador não repete a rastreabilidade produzida pelo revisor. Essa separação foi adotada depois que o fluxo anterior com Mini caiu para 8/10 verificações e levou 299 segundos.
- A geração com revisão tem orçamento de 280 segundos. Em falha após gerar um rascunho, o aplicativo o preserva e sinaliza que a conferência está incompleta; não apresenta o resultado como validado.
- Condições livres nas conexões, descrição e SLA preservados durante edição e salvamento; painel de revisão adaptado a telas menores.
- Marcadores das setas funcionam também na reabertura via Server Components. Uploads sem resposta já aparecem no histórico. Falha de consulta não é confundida com conversa inexistente.
- Geração migrada para Responses com JSON estruturado. A combinação de ferramentas com raciocínio no Chat Completions foi rejeitada pela API dos modelos testados.
- Sem migração SQL adicional. A persistência atômica da migração 006 continua sendo usada.

## Reprodução

### Resultado final de validação

Na versão final, o caso de compras retornou 28 nós e passou nas 10 verificações específicas, mas a conferência atingiu o orçamento de 280 segundos. O rascunho foi preservado com aviso de revisão incompleta. Portanto, o resultado **não está homologado para uso sem revisão humana**. A próxima melhoria de desempenho deve separar geração e revisão em trabalho assíncrono, com avaliação em vários processos; trocar tudo pelo modelo completo não resolveu essa limitação no teste.

O teste simples de fidelidade passou. A persistência foi repetida usando esse resultado real da IA: cinco verificações passaram, incluindo upload sem resposta no histórico, leitura integral da fonte, três commits simultâneos com dois replays, conflito de conteúdo, rejeição de autosave após conclusão e descrição/SLA no banco. Relatório local: `web/.e2e/persistence-a0588921-2f29-4251-8d6f-668106d12b4e.json`. O E2E monolítico anterior falhou na consulta imediatamente após a gravação; a consulta recebeu uma repetição limitada apenas para falhas de transporte/servidor, e a verificação de persistência posterior passou. Não foi feita nova chamada paga de geração para repetir essa etapa.

Os 24 testes locais, lint, TypeScript e build passaram. O teste de interface confirmou reabertura de atributos e os marcadores das nove conexões do processo sintético. Microfone físico não foi homologado nesta rodada. Nenhum processo de negócio preexistente foi alterado.

### Comandos

Em `web/`, com a aplicação e as variáveis de ambiente configuradas:

```powershell
$env:E2E_LIVE='1'
$env:E2E_REASONING='medium'
node scripts/benchmark-mapping.mjs 'C:\caminho\transcricao.txt' gpt-5.4-mini gpt-5.4
node scripts/check-procurement.mjs .e2e/benchmark-gpt-5.4-mini-medium.json
node scripts/e2e-transcript.mjs 'C:\caminho\transcricao.txt'
node scripts/e2e-fidelity.mjs
node scripts/e2e-persistence.mjs .e2e/fidelity.json
npm test
npm run lint
npm run build
```

Os relatórios brutos ficam em `web/.e2e/`, ignorado pelo Git, pois contêm a transcrição e respostas completas. O teste específico de compras só se aplica ao workshop usado nesta avaliação. Os scripts fazem chamadas pagas reais quando `E2E_LIVE=1`.
