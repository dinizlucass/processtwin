-- Execute after migrations 002–004. One transaction, serialized by process.
create or replace function public.save_process_flow(
  p_process_id uuid, p_nodes jsonb, p_edges jsonb, p_expected_version integer default null
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare current_version integer;
begin
  select version into current_version from process where id = p_process_id for update;
  if not found then raise exception 'Processo não encontrado'; end if;
  if p_expected_version is not null and current_version <> p_expected_version then
    raise exception 'FLOW_VERSION_CONFLICT';
  end if;
  if jsonb_typeof(p_nodes) <> 'array' or jsonb_typeof(p_edges) <> 'array' then
    raise exception 'Fluxo inválido';
  end if;
  delete from flow_edge where process_id = p_process_id;
  delete from flow_node where process_id = p_process_id;
  insert into flow_node (process_id, node_id, kind, label, actor, activity_type,
    alert_frequency, tags, uses_ai, pos_x, pos_y, attributes)
  select p_process_id, n.node_id, n.kind, n.label, n.actor, n.activity_type,
    n.alert_frequency, n.tags, n.uses_ai, n.pos_x, n.pos_y, n.attributes
  from jsonb_populate_recordset(null::flow_node, p_nodes) n;
  insert into flow_edge (process_id, edge_id, source_id, target_id, source_handle, label)
  select p_process_id, e.edge_id, e.source_id, e.target_id, e.source_handle, e.label
  from jsonb_populate_recordset(null::flow_edge, p_edges) e;
  update process set version = current_version + 1 where id = p_process_id;
  return current_version + 1;
end;
$$;
revoke all on function public.save_process_flow(uuid, jsonb, jsonb, integer) from public, anon, authenticated;
grant execute on function public.save_process_flow(uuid, jsonb, jsonb, integer) to service_role;
