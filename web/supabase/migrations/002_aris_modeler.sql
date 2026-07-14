-- Migração 002 — modelador nível ARIS
-- Rode isto UMA vez no SQL Editor do Supabase (no projeto que já tem o schema.sql aplicado).
-- Sem esta migração, salvar o fluxo com os novos tipos de elemento e atributos vai falhar.

-- 1. Permite mais tipos de elemento (evento intermediário, subprocesso, gateways
--    paralelo/inclusivo, objeto de dados, anotação) — kind deixa de ser enum restrito.
alter table flow_node alter column kind type text;

-- 2. Guarda os atributos ricos de cada tarefa (descrição, sistemas, entradas/saídas,
--    SLA, custo, controles, exceções, KPI, área, documentação) em JSONB.
alter table flow_node add column if not exists attributes jsonb not null default '{}';
