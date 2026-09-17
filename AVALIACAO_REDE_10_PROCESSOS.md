# Avaliação integrada — rede de 10 processos

Data: 16/09/2026  
Modelo: `gpt-5.6-luna`  
Área sintética: `E2E Suprimentos Integrados c4520e9d`

## Escopo

Foram geradas dez transcrições completas e relacionadas de uma cadeia de Suprimentos. Cada uma passou por extração, entrevista, geração, revisão de fidelidade, persistência e inclusão no grafo. As onze relações esperadas foram medidas antes da confirmação e depois gravadas explicitamente.

## Resultado executivo

- 10/10 processos gerados, persistidos e visíveis no grafo.
- 9/10 mapas sem erros estruturais.
- 1/10 mapas com erro estrutural: P07, Inspeção de Qualidade, deixou uma decisão após repetição com somente um caminho definido.
- 11/11 relações esperadas foram inferidas automaticamente: recall de 100%.
- 27 relações foram sugeridas no total; 16 eram falsos positivos: precisão de 40,7%.
- 11/11 relações esperadas foram confirmadas e persistidas no grafo.
- 36/40 verificações textuais e 36/40 verificações de metadados passaram. Parte das oito falhas é variação de redação, não necessariamente perda semântica.
- Somente 1/10 mapas terminou sem observações do revisor de fidelidade.
- Todos os mapas mantiveram pelo menos uma pendência de rastreabilidade.
- Tempo de parede do teste: 11 min 16 s, executando dois processos por vez.

## Processos

| Código | Processo | Nós | Conexões | Estrutura | Observações principais |
|---|---|---:|---:|---|---|
| P01 | Planejamento de demanda | 9 | 9 | Válida | Inventou executor indefinido e classificou tarefas como manuais sem evidência. |
| P02 | Abertura de requisição | 8 | 7 | Válida | Perdeu duas expressões literais nos checks e ampliou o uso atribuído ao SAP. |
| P03 | Sourcing e cotação | 15 | 19 | Válida | Encerrou um caminho cuja continuidade não estava definida na fonte. |
| P04 | Homologação cadastral | 14 | 15 | Válida | Representou incorretamente a combinação documento vencido OU alerta de compliance. |
| P05 | Emissão de pedido | 11 | 12 | Válida | Inferiu o retorno após reenvio e omitiu dor/oportunidade nos metadados. |
| P06 | Recebimento físico | 12 | 11 | Válida | Único sem issues do revisor; pequenas diferenças de redação e sistema. |
| P07 | Inspeção de qualidade | 15 | 14 | Inválida | Gateway após segunda amostragem ficou com um único caminho e houve inferências de executor. |
| P08 | Armazenagem | 9 | 9 | Válida | Inferiu executores e omitiu dor/oportunidade. |
| P09 | Devolução ao fornecedor | 16 | 16 | Válida | Inventou comportamento para autorização negada/pendente e ordenação do crédito. |
| P10 | Conciliação de fatura | 14 | 13 | Válida | Não representou explicitamente a saída “divergência registrada”. |

## Relações esperadas e confirmadas

1. P01 → P02 — plano de demanda inicia requisição.
2. P02 → P03 — requisição liberada inicia sourcing.
3. P03 → P04 — shortlist segue para homologação.
4. P04 → P05 — fornecedor homologado permite emissão do pedido.
5. P05 → P06 — pedido aprovado autoriza recebimento.
6. P06 → P07 — lote recebido segue para inspeção.
7. P06 → P09 — avaria inicia devolução.
8. P07 → P08 — lote aprovado segue para armazenagem.
9. P07 → P09 — não conformidade inicia devolução.
10. P08 → P10 — recebimento liberado segue para conciliação.
11. P09 → P10 — crédito solicitado segue para conciliação.

## Feedback real

O resultado comprova que a arquitetura funciona para formar uma rede coerente de processos e que o Luna é capaz de gerar mapas ricos com custo baixo. A inferência atual é excelente para descobrir candidatos: não perdeu nenhuma ligação esperada. Entretanto, ela usa sobreposição de palavras isoladas e gerou relações incorretas como P05 → P02 apenas porque ambos mencionam “compra”. Portanto, relações inferidas devem continuar como sugestões e nunca ser confirmadas automaticamente.

Na modelagem interna, o resultado é bom para produzir um primeiro rascunho, mas não está pronto para publicação sem revisão humana. Os principais problemas são inferência de executor ou modo manual, omissão de dor/oportunidade e fechamento inventado de caminhos que a transcrição deixou incompletos. O revisor detectou esses pontos, o que é positivo, mas o pipeline ainda persiste o rascunho com avisos em vez de bloquear ou exigir correção.

## Recomendação

Seguir com o GPT-5.6 Luna como modelo operacional, mantendo revisão humana obrigatória. Antes de homologar publicação automática:

1. Bloquear conclusão quando houver erro estrutural.
2. Exigir aceite dos `reviewIssues` ou uma nova correção antes do commit.
3. Melhorar a inferência de hand-off para exigir dois termos fortes ou correspondência de artefato completo, reduzindo falsos positivos.
4. Separar explicitamente dor e oportunidade no esquema, pois hoje o modelo frequentemente as omite.
5. Não preencher `activityType`, executor, `usesAI` ou primariedade de sistema quando a fonte não informar.

## Evidências

Os artefatos completos, incluindo as dez transcrições e o JSON detalhado, estão em `web/.e2e/network-c4520e9d/`.
