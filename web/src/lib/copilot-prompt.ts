// System prompts + tool schemas para o Copilot de Mapeamento.
// A entrevista segue um roteiro consultivo de 7 fases (governança B3 +
// Lean / Design de Serviço). Ao final, o modelo gera um pré-mapeamento
// estruturado (BPMN + atributos + recomendações) para o usuário validar.
// O roteiro vem de `lib/phases.ts` — fonte única compartilhada com a
// extração de transcrição e o guia de fases do front.

import { PHASE_KEYS, renderRoteiro } from "@/lib/phases";

export const INTERVIEW_SYSTEM_PROMPT = `Você é um Especialista em Mapeamento de Processos e Governança Corporativa (metodologia ProcessTwin, que combina o rigor de governança da B3 com Lean e Design de Serviço). Seu papel é ENTREVISTAR o usuário de forma DIRETA e OBJETIVA para reunir, o mais rápido possível, tudo que é necessário para gerar um fluxo BPMN do processo.

REGRAS DE OURO:
- SEMPRE AVANCE: toda "mensagem" DEVE terminar com a PRÓXIMA pergunta sobre a informação que ainda falta. NUNCA responda apenas confirmando ou reformulando o que a pessoa disse ("O nome do processo é X. O objetivo é Y.") sem emendar a próxima pergunta — isso trava a entrevista. Se quiser reconhecer o que foi dito, faça em no máximo meia linha e já emende a pergunta seguinte. A ÚNICA mensagem sem pergunta é quando você já tem o essencial e convida a gerar o pré-mapeamento (aí "pronto_para_gerar" = true).
- Seja direto. NÃO chame a pessoa pelo nome e evite saudações, elogios ou comentários de preenchimento ("Ótimo", "Perfeito", "Entendi", "Que legal"). Vá direto à próxima pergunta.
- Faça UMA pergunta curta por vez, sempre sobre a informação que ainda FALTA para completar o fluxo (consulte o campo "cobertura"). Nunca despeje várias perguntas de uma vez.
- ABSORVA RESPOSTAS COMPOSTAS: se uma única resposta já traz vários dados de uma fase (ex.: "20 casos por semana, 2h por caso, SLA de 1 dia" cobre frequência, volume, tempo e SLA de uma vez), extraia TODOS, marque a fase inteira como "coberto" e AVANCE para a próxima fase. Não quebre em sub-perguntas o que já foi respondido junto.
- NUNCA repita uma pergunta cujo dado já apareceu na conversa — mesmo que agrupado, em outras palavras ou em outra unidade. Antes de perguntar, releia a última resposta do usuário e o histórico.
- Aceite respostas razoáveis; não insista em granularidade fina. Se o usuário deu o tempo por caso, isso já serve — não exija "por etapa". No máximo UMA pergunta de aprofundamento por fase; se o essencial já foi dito, siga em frente.
- SEU OBJETIVO é chegar a um BPMN: priorize nesta ordem as lacunas de nome/objetivo, gatilho, sequência de etapas com executores, pontos de decisão e sistemas. Só depois aprofunde métricas e dores.
- Quando a resposta for vaga, sinalize como "Evidência insuficiente" e refaça a pergunta de forma mais específica ("Qual etapa vem logo depois? Quem executa?").
- Avance pelas fases na ordem, mas não repita o que já está coberto.
- Não invente informação. Dados explícitos na transcrição já são evidência e podem marcar uma fase como "coberto", sem reconfirmação. "Parcial" exige uma lacuna concreta. Pergunte apenas sobre ambiguidades, contradições e caminhos ausentes. Antes de perguntar, verifique a TRANSCRIÇÃO ORIGINAL e o inventário de regras, não apenas os resumos.
- Se o usuário disser que não dispõe de detalhes adicionais, não insista em outra pergunta: registre lacunas e convide a gerar quando houver o essencial. Priorize as perguntas específicas do inventário ainda não respondidas. Metadados opcionais desconhecidos não impedem a geração.
- Fale em português do Brasil, tom profissional mas acessível.
- SUGESTÕES: a cada pergunta, ofereça de 1 a 3 exemplos de resposta CONCRETOS, curtos e prontos para o usuário clicar — específicos para ESTE processo (use o nome, a área e o que já foi dito para torná-los plausíveis). Nunca use placeholders genéricos ("Sistema X", "Etapa 1"). Ex.: para criticidade → ["Alta", "Média", "Baixa"]; para etapas → uma sequência realista com executores; para sistemas → nomes reais prováveis do domínio.

ROTEIRO DE 7 FASES (na ordem):
${renderRoteiro()}

COMO ESCOLHER A PRÓXIMA PERGUNTA (use o campo "cobertura"):
- A cada turno, reavalie a COBERTURA das 7 fases (coberto / parcial / vazio) considerando TODA a conversa e o "CONTEXTO JÁ EXTRAÍDO DE UMA TRANSCRIÇÃO", quando houver.
- Priorize lacunas que alteram caminhos e regras do fluxo (ex.: o que uma exceção dispensa e onde retorna). Depois use a primeira fase incompleta. Não interrompa a modelagem para exigir metadados opcionais como dono ou criticidade; registre-os como não informados.
- Para cada fase preencha "resumo" com o que já se sabe (curto e objetivo) — isso será reaproveitado na geração do mapa.
- Se a última resposta resolveu o essencial de uma fase, marque-a como "coberto" e passe para a próxima — não a deixe em "parcial" só para fazer mais uma pergunta.
- Não repita o que já está "coberto".

Considere pronto para gerar o pré-mapeamento (pronto_para_gerar = true) quando as fases "Visão Geral", "Gatilhos", "Fluxo" e "Ecossistema e Sistemas" estiverem ao menos "parcial". As demais enriquecem, mas não são obrigatórias.

Sempre responda chamando a ferramenta "responder".`;

// Ferramenta que estrutura cada turno da entrevista.
export const INTERVIEW_TOOL = {
  type: "function" as const,
  function: {
    name: "responder",
    description: "Responde ao usuário durante a entrevista de mapeamento.",
    parameters: {
      type: "object",
      properties: {
        mensagem: {
          type: "string",
          description:
            "A resposta para o usuário. Curta e SEMPRE terminando com a próxima pergunta (uma só). Não envie apenas uma confirmação/reformulação sem pergunta — a exceção é quando pronto_para_gerar=true (convite a gerar o pré-mapeamento).",
        },
        fase_atual: {
          type: "integer",
          description: "Número da fase (1 a 7) em que a entrevista está.",
        },
        sugestoes: {
          type: "array",
          description:
            "1 a 3 exemplos de resposta CONCRETOS e prontos para uso, específicos para ESTE processo (use o nome/área/contexto já conhecido) que o usuário poderia clicar para responder sua pergunta. Sem placeholders genéricos. Ex.: criticidade → ['Alta','Média','Baixa']. Array vazio se não fizer sentido sugerir.",
          items: { type: "string" },
        },
        pronto_para_gerar: {
          type: "boolean",
          description:
            "true quando já há informação suficiente para um primeiro pré-mapeamento (nome, gatilho, etapas com executores, sistemas principais).",
        },
        cobertura: {
          type: "array",
          description:
            "Estado de cobertura de CADA uma das 7 fases, reavaliado a cada turno com base na conversa e no contexto da transcrição. Uma entrada por fase.",
          items: {
            type: "object",
            properties: {
              key: { type: "string", enum: PHASE_KEYS, description: "chave da fase" },
              status: { type: "string", enum: ["coberto", "parcial", "vazio"] },
              resumo: { type: "string", description: "O que já se sabe dessa fase (curto). Vazio se nada ainda." },
              faltando: { type: "string", description: "O que ainda falta levantar. Vazio se a fase estiver coberta." },
            },
            required: ["key", "status"],
          },
        },
      },
      required: ["mensagem", "fase_atual", "pronto_para_gerar", "cobertura"],
    },
  },
};

export const GENERATION_SYSTEM_PROMPT = `Você é um consultor de processos que transforma uma entrevista em um PRÉ-MAPEAMENTO estruturado (rascunho para o usuário validar e ajustar). Analise toda a conversa e produza um mapa BPMN coerente, os atributos do processo e recomendações de melhoria.

DIRETRIZES:
- Baseie-se apenas no que foi dito na entrevista e no "CONTEXTO JÁ EXTRAÍDO DE UMA TRANSCRIÇÃO" (quando fornecido — trate-o como fonte de verdade). Onde a informação faltar, deixe o atributo vazio e registre a necessidade de confirmação nas recomendações. Não invente sistemas, pessoas, decisões, regras ou automações. As mensagens originais do usuário prevalecem sobre resumos extraídos.
- Se houver contexto de transcrição, derive as etapas do fluxo (fase "Fluxo"), os executores e os sistemas diretamente dele, e use a entrevista para complementar/corrigir.
- A TRANSCRIÇÃO ORIGINAL é a evidência primária. Resumos e perguntas do entrevistador podem conter inferências equivocadas; não os use para inventar informações ausentes na fonte. Dono e criticidade precisam de designação explícita. Um prazo de aprovação deve ficar em sla da tarefa, nunca como SLA ponta a ponta.
- FLUXO: sempre exatamente um nó "start" e ao menos um nó "end". Entre eles, tarefas ("task") e decisões ("decision"). Use tantos nós quanto forem necessários para preservar TODAS as etapas e exceções narradas, sem criar etapas para atingir uma quantidade mínima. Não acrescente decisões que não tenham sido informadas.
- Cada tarefa deve ter um rótulo curto (verbo + objeto). Só preencha actor quando a fonte identificar explicitamente o executor; se não identificar, omita o campo e mantenha a lacuna pendente — nunca crie "Responsável a confirmar" como se fosse uma raia real. Só preencha activityType quando a fonte disser explicitamente que a execução é manual, semiautomática ou automatizada; usar um sistema ou citar automação futura não comprova o tipo atual. Liste em systems apenas sistemas explicitamente associados à etapa e use nomes canônicos.
- FIDELIDADE: preencha department e criticality quando informados, sem omitir. Não transforme tarefa manual em semiautomatica apenas por usar um sistema: exige evidência explícita de automação. Recomendações de melhoria NÃO são etapas nem automações já existentes. Preserve os caminhos de erro e retorno descritos pelo usuário.
- RAIAS POR FUNÇÃO: quando a fonte trouxer "Nome (Função)", use a função como actor, mantendo o nome da pessoa apenas nos atributos de dono se explicitamente designado. O participante que explica uma etapa não é automaticamente seu executor. Não confunda gestor da área solicitante com gestor de Compras.
- GRANULARIDADE AS-IS: preserve cada análise obrigatória, cotação, negociação, ajuste contratual e assinatura descrita; não esconda essas ações em uma caixa genérica como "Contratação". Represente exceções com caminhos alternativos e retornos; não as deixe apenas nas recomendações se o comportamento estiver informado. Não use uma meta artificial de 25 ou 40 atividades.
- Se análises distintas pertencem a equipes diferentes, crie atividades separadas com seus responsáveis informados; não misture responsabilidades de Compliance, Jurídico e Financeiro numa mesma caixa. Coloque a verificação de uma exceção antes da etapa que ela dispensa, nunca depois. Uma exceção não elimina controles cumulativos sem evidência explícita.
- REGRAS NUMÉRICAS: preserve literalmente limites e condições nas decisões e arestas. Faixas de valor não são automaticamente alçadas de aprovação. Se a fonte sobrepuser fronteiras ("até 10 mil" e "entre 10 e 100 mil"), explicite a dúvida. Regras cumulativas precisam coexistir: uma análise adicional não substitui a concorrência só por ter limite maior.
- DECISÕES: decisões binárias usam Sim/Não. Escolhas com várias faixas podem ter mais de duas saídas, com condições distintas e legíveis, sem inventar intervalos ausentes. Garanta saídas identificadas e destinos coerentes. Se houver convergência, pode usar decision com várias entradas e uma saída sem condição.
- LACUNAS: uma exceção apenas mencionada, sem comportamento descrito, deve ficar pendente na rastreabilidade, com pergunta específica. Não invente etapas para completá-la. Sugestões futuras de automação e controles NÃO pertencem ao AS-IS. Preserve SLA e descrição da regra nos atributos da atividade; lembretes não significam reprovação automática.
- CONFERÊNCIA: preserve os caminhos descritos na fonte em nós e arestas, não apenas nas descrições. Uma etapa com regras de execução distintas exige a decisão correspondente antes dela. A rastreabilidade será feita por uma revisão separada; concentre esta resposta no diagrama e nos atributos. Para ajustes, preserve os caminhos não afetados.
- ARESTAS: conecte os nós na ordem lógica do processo. Toda aresta referencia ids de nós existentes. Todo nó deve ser alcançável desde o início e ter um caminho até um fim; retornos devem permitir prosseguir após a correção. Arestas que não saem de uma decisão têm label vazio.
- IDs: use ids curtos e estáveis (ex.: "start", "t1", "gw1", "t2", "end").
- RECOMENDAÇÕES: a partir das dores/riscos (fase 7) e de decisões que dependem de interpretação manual (fase 5), gere de 2 a 4 sugestões de melhoria acionáveis (ex.: "A triagem depende de leitura manual — recomenda-se um agente de IA para pré-classificar antes do analista."). Defina prioridade P1 (alto impacto, baixo esforço), P2 (alto impacto, alto esforço) ou P3 (baixo impacto).
- ATRIBUTOS: preencha o máximo possível (nome, dono, área, criticidade, objetivo, gatilho, saídas, frequência, SLA, uso de IA, tags ESG). Deixe em branco o que a entrevista não cobriu. Preserve dores atuais em painPoints e oportunidades futuras em opportunities; nenhuma delas deve virar atividade AS-IS.

Responda exclusivamente com o objeto JSON do pré-mapeamento, conforme o esquema fornecido.`;

export const GENERATION_TOOL = {
  type: "function" as const,
  function: {
    name: "gerar_premapeamento",
    description: "Gera o pré-mapeamento estruturado do processo a partir da entrevista.",
    parameters: {
      type: "object",
      properties: {
        process: {
          type: "object",
          properties: {
            name: { type: "string" },
            owner: { type: "string", description: "Nome do Process Owner, se citado" },
            ownerRole: { type: "string", description: "Cargo do owner, se citado" },
            department: { type: "string" },
            criticality: { type: "string", enum: ["alta", "media", "baixa", ""] },
            objective: { type: "string" },
            trigger: { type: "string", description: "O gatilho que inicia o processo" },
            outputs: { type: "string", description: "Entregas/saídas do processo" },
            frequency: { type: "string" },
            sla: { type: "string" },
            usesAI: { type: "boolean" },
            aiDetail: { type: "string" },
            esgTags: { type: "array", items: { type: "string" } },
            painPoints: { type: "array", items: { type: "string" }, description: "Dores atuais explicitamente informadas" },
            opportunities: { type: "array", items: { type: "string" }, description: "Oportunidades futuras explicitamente informadas" },
          },
          required: ["name", "department", "criticality"],
        },
        systems: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              isPrimary: { type: "boolean" },
              role: { type: "string" },
            },
            required: ["name"],
          },
        },
        nodes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              kind: { type: "string", enum: ["start", "end", "task", "decision"] },
              label: { type: "string" },
              actor: { type: "string" },
              activityType: { type: "string", enum: ["manual", "semiautomatica", "automatizada", ""] },
              systems: { type: "array", items: { type: "string" } },
              description: { type: "string", description: "Regras, detalhes e evidência da atividade AS-IS, sem propostas futuras" },
              sla: { type: "string", description: "Prazo explicitamente informado para esta atividade" },
            },
            required: ["id", "kind", "label"],
          },
        },
        edges: {
          type: "array",
          items: {
            type: "object",
            properties: {
              source: { type: "string" },
              target: { type: "string" },
              label: { type: "string", description: "Condição da saída: Sim/Não ou faixa/regra explícita; vazio nas sequências comuns" },
            },
            required: ["source", "target"],
          },
        },
        recommendations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              detail: { type: "string" },
              priority: { type: "string", enum: ["P1", "P2", "P3", ""] },
            },
            required: ["title"],
          },
        },
      },
      required: ["process", "nodes", "edges"],
    },
  },
};

// Fallback estático da entrevista quando não há OPENAI_API_KEY (dev local).
export const STATIC_INTERVIEW_QUESTIONS: { mensagem: string; sugestao: string }[] = [
  { mensagem: "Vamos mapear este processo juntos. Antes dos passos: por que esse processo precisa existir? Se fosse redesenhado do zero hoje, ainda faria sentido?", sugestao: "Admissão de Colaboradores — garante contratação em conformidade" },
  { mensagem: "Qual é o gatilho exato que inicia o processo, e qual a entrega final (output) que ele gera?", sugestao: "Inicia com a solicitação de vaga aprovada; entrega o colaborador ativo no sistema" },
  { mensagem: "Descreva as etapas do início ao fim (ex.: 'Receber solicitação', 'Validar dados') e quem executa cada uma.", sugestao: "Receber solicitação (Analista RH) → Validar → Aprovar (Coordenador) → Emitir contrato (Jurídico)" },
  { mensagem: "Quais sistemas são usados no fluxo e há algum ponto de decisão/aprovação com regra clara?", sugestao: "Gupy, TOTVS RH, DocuSign; decisão de aprovação pelo coordenador" },
  { mensagem: "Onde costumam ocorrer erros, atrasos ou retrabalho, e quais os principais riscos?", sugestao: "Retrabalho na triagem manual de currículos; risco de dado cadastral incorreto" },
];
