-- ProcessTwin — schema inicial (MVP)
-- Rode isto inteiro no SQL Editor do Supabase (Project > SQL Editor > New query > Run)

create extension if not exists "pgcrypto";

create type process_status as enum ('rascunho', 'em_revisao', 'publicado', 'obsoleto');
create type criticality_level as enum ('alta', 'media', 'baixa');
create type node_kind as enum ('start', 'end', 'task', 'decision');
create type activity_type as enum ('manual', 'semiautomatica', 'automatizada');
create type risk_category as enum ('pessoas', 'sistemas', 'processos', 'regulatorio', 'externo', 'mudanca');

create table process_owner (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  created_at timestamptz not null default now()
);

create table process (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique,
  macroprocess text,
  department text,
  version int not null default 1,
  status process_status not null default 'rascunho',
  criticality criticality_level,
  objective text,
  scope text,
  trigger_desc text,
  inputs text,
  outputs text,
  frequency text,
  sla text,
  regulation text[] not null default '{}',
  owner_id uuid references process_owner(id),
  uses_ai boolean not null default false,
  ai_detail text,
  esg_tags text[] not null default '{}',
  last_reviewed_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table flow_node (
  process_id uuid not null references process(id) on delete cascade,
  node_id text not null, -- id local do react-flow (ex.: 't1'), único dentro do processo
  kind node_kind not null,
  label text not null,
  actor text,
  activity_type activity_type,
  alert_frequency text,
  tags text[] not null default '{}',
  uses_ai boolean not null default false,
  pos_x double precision not null default 0,
  pos_y double precision not null default 0,
  primary key (process_id, node_id)
);

create table flow_edge (
  process_id uuid not null references process(id) on delete cascade,
  edge_id text not null,
  source_id text not null,
  target_id text not null,
  source_handle text,
  label text,
  primary key (process_id, edge_id)
);

create table risk_factor (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references process(id) on delete cascade,
  category risk_category not null,
  description text,
  control_coverage smallint check (control_coverage between 0 and 100),
  created_at timestamptz not null default now()
);

create table incident (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references process(id) on delete cascade,
  occurred_at date not null,
  severity smallint check (severity between 1 and 5),
  description text
);

create table system_dependency (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references process(id) on delete cascade,
  system_name text not null,
  is_primary boolean not null default false,
  criticality criticality_level,
  rto text,
  rpo text
);

create table key_person_dependency (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references process(id) on delete cascade,
  person_name text not null,
  has_backup boolean not null default false,
  note text
);

create table improvement_opportunity (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references process(id) on delete cascade,
  title text not null,
  priority text check (priority in ('P1', 'P2', 'P3')),
  impact_hours_year numeric,
  effort text check (effort in ('baixo', 'alto')),
  created_at timestamptz not null default now()
);

create table ai_conversation (
  id uuid primary key default gen_random_uuid(),
  process_id uuid references process(id) on delete set null,
  messages jsonb not null default '[]',
  extracted_fields jsonb not null default '{}',
  status text not null default 'em_andamento',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table dashboard_widget_config (
  id uuid primary key default gen_random_uuid(),
  widget_key text not null unique,
  visible boolean not null default true,
  order_index int not null default 0
);

-- MVP: sem tela de login ainda, então as chamadas passam pelo backend do Next.js
-- usando a service role key (que já ignora RLS). RLS fica desabilitado por enquanto
-- e é reativado quando entrarmos com autenticação de verdade.

-- ============ SEED ============

insert into process_owner (name, role) values
  ('Ana Souza', 'Coordenadora de RH'),
  ('Carlos Lima', 'Analista Financeiro'),
  ('Paula Reis', 'Compras'),
  ('Marina Costa', 'Process Owner · Admin');

with o as (select id from process_owner where name = 'Ana Souza')
insert into process (name, code, department, criticality, status, version, uses_ai, ai_detail, esg_tags, owner_id, last_reviewed_at)
select 'Admissão de Colaboradores', 'RH-001', 'RH', 'alta', 'rascunho', 5, true, 'Triagem automática de currículos', '{Social,Governança}', o.id, current_date - 10
from o;

with p as (select id from process where code = 'RH-001')
insert into flow_node (process_id, node_id, kind, label, actor, activity_type, alert_frequency, tags, uses_ai, pos_x, pos_y)
select p.id, v.node_id, v.kind::node_kind, v.label, v.actor, v.activity_type::activity_type, v.alert_frequency, v.tags, v.uses_ai, v.pos_x, v.pos_y
from p, (values
  ('start', 'start', 'Início', null, null, null, array[]::text[], false, 20, 220),
  ('t1', 'task', 'Receber Solicitação', 'Analista de RH', 'manual', 'A cada 90 dias', array['RH','Onboarding'], false, 180, 188),
  ('gw', 'decision', 'Aprovado?', 'Coordenador de RH', null, 'A cada 90 dias', array['Decisão','Compliance'], true, 440, 204),
  ('t2', 'task', 'Emitir Contrato', 'Jurídico · DocuSign', 'manual', 'A cada 60 dias', array['Jurídico','DocuSign'], false, 640, 40),
  ('t3', 'task', 'Notificar Recusa', 'Analista de RH', 'automatizada', 'A cada 180 dias', array['RH'], true, 640, 360),
  ('end', 'end', 'Fim', null, null, null, array[]::text[], false, 900, 40)
) as v(node_id, kind, label, actor, activity_type, alert_frequency, tags, uses_ai, pos_x, pos_y);

with p as (select id from process where code = 'RH-001')
insert into flow_edge (process_id, edge_id, source_id, target_id, source_handle, label)
select p.id, v.edge_id, v.source_id, v.target_id, v.source_handle, v.label
from p, (values
  ('e-start-t1', 'start', 't1', null, null),
  ('e-t1-gw', 't1', 'gw', null, null),
  ('e-gw-t2', 'gw', 't2', 'yes', 'Sim'),
  ('e-gw-t3', 'gw', 't3', 'no', 'Não'),
  ('e-t2-end', 't2', 'end', null, null)
) as v(edge_id, source_id, target_id, source_handle, label);

insert into dashboard_widget_config (widget_key, visible, order_index) values
  ('kpis', true, 0),
  ('department_maturity', true, 1),
  ('pending_alerts', true, 2);

-- processos adicionais, sem fluxo modelado ainda, só para dar variedade real
-- ao dashboard (departamentos, criticidade, datas de última revisão)
insert into process_owner (name, role) values
  ('Roberto Alves', 'Gerente Comercial'),
  ('Juliana Prado', 'Coordenadora de CX')
on conflict do nothing;

insert into process (name, code, department, criticality, status, version, owner_id, last_reviewed_at)
select v.name, v.code, v.department, v.criticality::criticality_level, v.status::process_status, v.version, o.id, current_date - v.days_ago
from (values
  ('Faturamento', 'FIN-001', 'Financeiro', 'alta', 'publicado', 7, 'Carlos Lima', 200),
  ('Gestão de Fornecedores', 'CMP-001', 'Compras', 'media', 'em_revisao', 2, 'Paula Reis', 600),
  ('Processo de Vendas', 'COM-001', 'Comercial', 'baixa', 'publicado', 5, 'Roberto Alves', 100),
  ('Fechamento Contábil', 'FIN-002', 'Financeiro', 'media', 'publicado', 3, 'Carlos Lima', 540),
  ('Atendimento ao Cliente', 'CX-001', 'CX', 'baixa', 'publicado', 6, 'Juliana Prado', 50),
  ('Desligamento de Colaboradores', 'RH-002', 'RH', 'alta', 'publicado', 1, null, 400)
) as v(name, code, department, criticality, status, version, owner_name, days_ago)
left join process_owner o on o.name = v.owner_name
on conflict (code) do nothing;
