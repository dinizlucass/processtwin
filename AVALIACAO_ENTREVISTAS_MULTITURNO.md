# Avaliação de entrevistas multirrodada — 20/09/2026

## Atualização após as correções

O teste foi repetido com `OPENAI_MODEL=gpt-5.6-luna` e
`OPENAI_MAPPING_MODEL=gpt-5.6-luna`. Nas quatro entrevistas sem transcrição
artificial, todos os turnos retornaram `source: openai`: o erro 400 e o
fallback silencioso desapareceram. A prontidão ocorreu em 2, 4, 2 e 2
respostas no primeiro rerun. Após reforçar a regra contra repetição de lacuna
já declarada desconhecida, os controles finais pararam em 1 resposta no caso
de transcrição rica e 3 no caso gradual.

As sugestões agora se limitam a “Não sei informar”; não apresentam donos,
integrações ou etapas hipotéticas. Nos quatro mapas do rerun, uso de IA e
primariedade do sistema sem evidência ficaram ausentes, bem como todos os
tipos de atividade não declarados. Ainda houve 2, 1, 1 e 2 avisos de revisão,
respectivamente; no primeiro caso, o ramo de correção ficou sem saída e o
bloqueio estrutural impede conclusão. Portanto, a correção melhora o
controle de evidência, mas não dispensa revisão humana do fluxo.

O relatório principal do rerun está em `web/.e2e/interview-eval/report.json`;
os controles finais de lacuna desconhecida estão em `check-unknown.json` e
`check-gradual.json` no mesmo diretório. A seção abaixo registra a linha de
base anterior às correções, mantida para comparação.

## Método e limites

Quatro cenários sintéticos foram conduzidos pela API real `/api/copilot` e os
históricos enviados à geração/revisão real, **sem persistir processos**. As
respostas foram roteirizadas antes da chamada, não escolhidas a partir dos
botões sugeridos. Para forçar o caminho efetivamente suportado pelo
`gpt-5.6-luna`, cada cenário recebeu a primeira fala como transcrição inicial.
Os arquivos brutos locais, ignorados pelo Git, são
`web/.e2e/interview-eval/report-luna-transcript.json` e
`web/.e2e/interview-eval/report-luna-correction.json`. O script reproduzível é
`web/scripts/eval-interview.mjs`.

Isso avalia o fluxo **com transcrição** e estes casos, não uma amostra de
usuários reais nem o fluxo sem transcrição em produção.

| Cenário | Respostas até prontidão | Nós | Avisos do revisor | Achado principal |
|---|---:|---:|---:|---|
| Resposta inicial completa | 1 | 10 | 2 | Pediu owner opcional; criou fim artificial após correção |
| Informação gradual | 3 | 9 | 1 | Cobriu a exceção; inventou sistema primário |
| Conciliação com correção posterior | 1 | 6 | 0 | Parou antes de receber correção crítica |
| Transcrição rica | 1 | 10 | 0 | Preservou bifurcação e atributos desconhecidos |

Forçando a continuação da conciliação até três respostas, o mapa passou a
representar os retornos distintos de divergência de valor e quantidade (7 nós),
mas ainda teve dois avisos: não representou explicitamente o estado “nota
pendente” e tratou a liberação final como tarefa apesar do executor desconhecido.

## Achado de configuração — importante

A rota de entrevista seleciona `OPENAI_MODEL` quando **não** há transcrição e
`OPENAI_MAPPING_MODEL` quando há. Com o ambiente local original, as três
entrevistas sem transcrição foram, portanto, realizadas por `gpt-4o-mini`, não
por Luna. Quando ambos foram definidos como Luna, todas as chamadas sem
transcrição falharam com HTTP 400 da OpenAI: function tools requerem
`reasoning_effort: "none"` no Chat Completions; a rota não envia essa opção
nesse ramo. A API respondeu 200 ao cliente, mas com `source: "fallback"` e
perguntas estáticas. **Não contar esse fallback como desempenho do Luna.**

Por esse motivo, a rodada Luna acima usou o caminho de transcrição. O teste
preliminar misto (`gpt-4o-mini` na entrevista e Luna na geração) revelou gaps
semelhantes, mas não integra a tabela principal.

## Julgamento sobre o meio-termo

Há evidência de que não precisamos fazer sete perguntas para sete fases: o Luna
chegou ao rascunho em 1–3 respostas. Porém `readyToGenerate=true` veio
frequentemente acompanhado de outra pergunta sobre **owner** ou objetivo formal,
embora opcionais. Isso gera atrito desnecessário. Na conciliação, a prontidão
imediata suprimiu a oportunidade de capturar uma correção decisiva.

Recomendação: orçamento orientativo de **até três perguntas de esclarecimento
de alto impacto** após a narrativa inicial, sem limite rígido que esconda
contradição. Perguntar só o que muda desenho e hand-offs: destino de exceção,
critério de decisão, responsável efetivamente necessário, entrada/saída para
ligar processos. Se o entrevistado não sabe, registrar a pergunta pendente e
oferecer o rascunho. Owner formal, SLA, custo, IA e tipo de execução podem ficar
“não informado” quando não são essenciais ao fluxo.

## Gaps observados na entrevista e nos atributos

1. **Parada precoce e pergunta simultânea.** A conciliação ficou pronta na
   primeira resposta e omitiu os caminhos que surgiram na segunda. Mesmo
   `ready=true`, a mensagem ainda pediu owner/objetivo, em vez de convidar a
   gerar com lacunas registradas.
2. **Sugestões induzem fatos.** Foram oferecidos owners específicos, passos
   adicionais e gatilhos não presentes na fonte, por exemplo “Cliente recusa a
   entrega”, “transportadora retorna” e “Process Owner: Coordenação de
   Suprimentos”. Não foram clicados, mas um clique os transformaria em fala do
   entrevistado. Sugestões para fatos ainda desconhecidos precisam oferecer
   “não sei/não informado” e exemplos neutros, não completar o processo.
3. **Desconhecido ainda vira falso.** No caso gradual, `usesAI: false` foi
   gerado sem evidência, e o revisor não apontou isso. `systems[0].isPrimary`
   virou `true` sem evidência; esse segundo erro foi detectado. Nos demais
   casos Luna, o tipo das tarefas ficou ausente, corretamente.
4. **Fim artificial para lacuna.** O pedido negado foi corrigido, mas a fonte
   não dizia o que ocorre depois; o mapa criou evento final. O revisor detectou
   isso. A validade estrutural BPMN não deve converter “fim do relato” em “fim
   do processo”.
5. **Revisão sem avisos não é garantia completa.** O mapa da conciliação após
   uma fala teve zero issues porque não recebeu as correções posteriores. O
   caso gradual teve `usesAI: false` não apontado. A revisão deve ser lida
   contra toda a evidência disponível, não como selo absoluto.
6. **Editor confunde desconhecido.** O painel ainda mostra `activityType`
   ausente como “Manual”, e `toReactFlow` injeta `usesAI: false`. Isso pode
   contaminar um rascunho que a geração deixou corretamente em branco.

## Próxima validação

Primeiro corrigir a rota sem transcrição para não cair silenciosamente no
fallback com Luna; depois repetir estes mesmos casos sem a transcrição
artificial. Em paralelo, testar com pessoas reais se 1–3 perguntas focadas
parecem suficientes e confortáveis. O critério de sucesso deve combinar
**poucos turnos**, **nenhuma pergunta repetida**, **nenhum atributo inventado**
e **lacunas críticas explicitamente pendentes** — não a porcentagem de campos
preenchidos.
