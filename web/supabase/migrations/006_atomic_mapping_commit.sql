-- Execute after 003 and 005. No existing process data is rewritten.
begin;
create table if not exists public.mapping_commit_request (
  request_id uuid primary key,
  request_payload jsonb not null,
  process_id uuid not null references public.process(id) on delete cascade,
  conversation_id uuid unique references public.ai_conversation(id) on delete set null,
  response jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.mapping_commit_request enable row level security;
revoke all on public.mapping_commit_request from public, anon, authenticated;
grant select, insert, delete on public.mapping_commit_request to service_role;

create or replace function public.commit_process_mapping(p_request_id uuid, p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  previous public.mapping_commit_request%rowtype;
  conversation_id_value uuid;
  linked_process_id uuid;
  owner_id_value uuid;
  folder_id_value uuid;
  process_id_value uuid := gen_random_uuid();
  process_code_value text;
  owner_name text;
  folder_name text;
  result jsonb;
begin
  if p_request_id is null or jsonb_typeof(p_payload) is distinct from 'object'
    or nullif(btrim(p_payload->'process'->>'name'), '') is null
    or jsonb_typeof(p_payload->'nodes') is distinct from 'array'
    or jsonb_array_length(p_payload->'nodes') = 0
    or jsonb_typeof(p_payload->'edges') is distinct from 'array'
    or jsonb_typeof(p_payload->'systems') is distinct from 'array'
    or jsonb_typeof(p_payload->'recommendations') is distinct from 'array' then
    raise exception 'INVALID_MAPPING_PAYLOAD';
  end if;
  -- Concurrent retries for this key serialize. Failed attempts leave no ledger row.
  perform pg_advisory_xact_lock(hashtextextended('mapping:' || p_request_id::text, 0));
  select * into previous from mapping_commit_request where request_id = p_request_id;
  if found then
    if previous.request_payload <> p_payload then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return previous.response || jsonb_build_object('replayed', true);
  end if;
  conversation_id_value := (p_payload->>'conversation_id')::uuid;
  if conversation_id_value is not null then
    select process_id into linked_process_id from ai_conversation where id = conversation_id_value for update;
    if not found then raise exception 'CONVERSATION_NOT_FOUND'; end if;
    if linked_process_id is not null then raise exception 'CONVERSATION_ALREADY_COMMITTED'; end if;
  end if;
  owner_name := nullif(btrim(p_payload->'owner'->>'name'), '');
  if owner_name is not null then
    perform pg_advisory_xact_lock(hashtextextended('owner:' || lower(owner_name), 0));
    select id into owner_id_value from process_owner where lower(btrim(name)) = lower(owner_name) order by created_at, id limit 1;
    if owner_id_value is null then
      insert into process_owner(name, role) values (owner_name, p_payload->'owner'->>'role') returning id into owner_id_value;
    end if;
  end if;
  folder_name := nullif(btrim(p_payload->>'folder'), '');
  if folder_name is not null then
    perform pg_advisory_xact_lock(hashtextextended('folder:' || lower(folder_name), 0));
    select id into folder_id_value from process_folder where lower(btrim(name)) = lower(folder_name) order by created_at, id limit 1;
    if folder_id_value is null then
      insert into process_folder(name) values (folder_name) returning id into folder_id_value;
    end if;
  end if;
  process_code_value := 'MAP-' || replace(process_id_value::text, '-', '');
  insert into process(id, name, code, department, criticality, status, version, objective, trigger_desc,
    outputs, frequency, sla, owner_id, folder_id, uses_ai, ai_detail, esg_tags)
  select process_id_value, p.name, process_code_value, p.department, p.criticality, 'rascunho', 1, p.objective,
    p.trigger_desc, p.outputs, p.frequency, p.sla, owner_id_value, folder_id_value, coalesce(p.uses_ai, false),
    p.ai_detail, coalesce(p.esg_tags, '{}')
  from jsonb_populate_record(null::process, p_payload->'process') p;

  insert into flow_node(process_id, node_id, kind, label, actor, activity_type, alert_frequency, tags, uses_ai, pos_x, pos_y, attributes)
  select process_id_value, n.node_id, n.kind, n.label, n.actor, n.activity_type, n.alert_frequency,
    n.tags, n.uses_ai, n.pos_x, n.pos_y, n.attributes
  from jsonb_populate_recordset(null::flow_node, p_payload->'nodes') n;
  -- flow_edge has no composite FK in the legacy schema. Enforce endpoint integrity here.
  if exists (
    select 1 from jsonb_populate_recordset(null::flow_edge, p_payload->'edges') e
    where e.source_id = e.target_id
      or not exists (select 1 from flow_node n where n.process_id = process_id_value and n.node_id = e.source_id and n.kind <> 'lane')
      or not exists (select 1 from flow_node n where n.process_id = process_id_value and n.node_id = e.target_id and n.kind <> 'lane')
  ) then raise exception 'INVALID_MAPPING_EDGES'; end if;
  insert into flow_edge(process_id, edge_id, source_id, target_id, source_handle, label)
  select process_id_value, e.edge_id, e.source_id, e.target_id, e.source_handle, e.label
  from jsonb_populate_recordset(null::flow_edge, p_payload->'edges') e;
  insert into system_dependency(process_id, system_name, is_primary)
  select process_id_value, s.system_name, coalesce(s.is_primary, false)
  from jsonb_populate_recordset(null::system_dependency, p_payload->'systems') s;
  insert into improvement_opportunity(process_id, title, priority)
  select process_id_value, r.title, r.priority
  from jsonb_populate_recordset(null::improvement_opportunity, p_payload->'recommendations') r;
  if conversation_id_value is not null then
    update ai_conversation set process_id = process_id_value, status = 'concluida', updated_at = now() where id = conversation_id_value;
  end if;
  result := jsonb_build_object('processId', process_id_value, 'code', process_code_value, 'version', 1, 'replayed', false);
  insert into mapping_commit_request(request_id, request_payload, process_id, conversation_id, response)
    values (p_request_id, p_payload, process_id_value, conversation_id_value, result);
  return result;
end;
$$;
revoke all on function public.commit_process_mapping(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.commit_process_mapping(uuid, jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
