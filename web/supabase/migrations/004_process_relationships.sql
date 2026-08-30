-- 004 — Relações processo→processo (hand-offs) para o Grafo de Processos (CON-03)
-- Rode no SQL Editor do Supabase. O app degrada graciosamente sem esta tabela:
-- até rodar, o grafo mostra apenas hand-offs INFERIDOS (não confirmados).

create table if not exists process_relationship (
  id uuid primary key default gen_random_uuid(),
  from_process uuid not null references process(id) on delete cascade,
  to_process   uuid not null references process(id) on delete cascade,
  kind text not null default 'handoff',        -- handoff | gatilho | dependencia
  label text,                                    -- artefato que passa de um p/ outro
  created_at timestamptz not null default now(),
  unique (from_process, to_process, kind)
);

create index if not exists idx_process_relationship_from on process_relationship(from_process);
create index if not exists idx_process_relationship_to   on process_relationship(to_process);
