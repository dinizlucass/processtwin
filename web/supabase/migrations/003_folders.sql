-- Migração 003 — pastas do repositório de processos
-- Rode isto UMA vez no SQL Editor do Supabase (no projeto que já tem o schema.sql + 002 aplicados).
-- Sem esta migração, o repositório continua funcionando como lista plana (a app tolera a ausência),
-- mas as pastas não ficam disponíveis.

-- 1. Pastas hierárquicas (árvore de parent único — base do futuro grafo).
create table if not exists process_folder (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references process_folder(id) on delete set null, -- aninhamento; o app faz reparent no delete
  color text,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Cada processo pode estar em uma pasta (null = sem pasta / raiz).
alter table process add column if not exists folder_id uuid references process_folder(id) on delete set null;

-- 3. Índices para navegar a árvore e filtrar por pasta.
create index if not exists idx_process_folder_parent on process_folder(parent_id);
create index if not exists idx_process_folder_col on process(folder_id);
