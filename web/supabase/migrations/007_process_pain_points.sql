begin;

alter table public.process alter column uses_ai drop not null;
alter table public.process alter column uses_ai drop default;
alter table public.flow_node alter column uses_ai drop not null;
alter table public.flow_node alter column uses_ai drop default;
alter table public.system_dependency alter column is_primary drop not null;
alter table public.system_dependency alter column is_primary drop default;

create table if not exists public.process_pain_point (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.process(id) on delete cascade,
  description text not null,
  created_at timestamptz not null default now(),
  unique (process_id, description)
);

alter table public.process_pain_point enable row level security;
revoke all on public.process_pain_point from public, anon, authenticated;
grant select, insert, update, delete on public.process_pain_point to service_role;

-- O commit atômico já grava seu payload na ledger. Este trigger mantém a
-- migração compatível com a função 006 já instalada em produção.
create or replace function public.persist_mapping_pain_points()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  insert into process_pain_point(process_id, description)
  select new.process_id, value
  from jsonb_array_elements_text(coalesce(new.request_payload->'pain_points', '[]'::jsonb))
  where btrim(value) <> ''
  on conflict (process_id, description) do nothing;

  -- A função 006 antiga aplicava false como padrão. Restaure NULL quando a
  -- fonte não informou esses atributos, preservando "desconhecido".
  update process
  set uses_ai = case when new.request_payload->'process' ? 'uses_ai'
    then (new.request_payload->'process'->>'uses_ai')::boolean else null end
  where id = new.process_id;

  update flow_node n
  set uses_ai = src.uses_ai
  from jsonb_to_recordset(coalesce(new.request_payload->'nodes', '[]'::jsonb)) as src(node_id text, uses_ai boolean)
  where n.process_id = new.process_id and n.node_id = src.node_id;

  update system_dependency d
  set is_primary = src.is_primary
  from jsonb_to_recordset(coalesce(new.request_payload->'systems', '[]'::jsonb)) as src(system_name text, is_primary boolean)
  where d.process_id = new.process_id and d.system_name = src.system_name;
  return new;
end;
$$;

drop trigger if exists mapping_commit_pain_points on public.mapping_commit_request;
create trigger mapping_commit_pain_points
after insert on public.mapping_commit_request
for each row execute function public.persist_mapping_pain_points();

notify pgrst, 'reload schema';
commit;
