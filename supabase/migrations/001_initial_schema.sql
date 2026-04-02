-- ============================================================
-- Plataforma ATER — Schema inicial
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- WORKSPACES (raiz do multi-tenant)
-- ============================================================
create table public.workspaces (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- PROFILES (extensão de auth.users)
-- ============================================================
create type public.user_role as enum ('technician', 'admin');

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  full_name     text not null,
  role          public.user_role not null default 'technician',
  created_at    timestamptz not null default now()
);

-- ============================================================
-- PRODUCERS
-- ============================================================
create table public.producers (
  id            uuid primary key default uuid_generate_v4(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  phone         text,
  email         text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- PROPERTIES
-- ============================================================
create table public.properties (
  id            uuid primary key default uuid_generate_v4(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  producer_id   uuid not null references public.producers(id) on delete cascade,
  name          text not null,
  municipality  text not null,
  car_code      text,
  area_ha       numeric,
  gps_lat       double precision,
  gps_lng       double precision,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- VISITS
-- ============================================================
create type public.visit_status as enum ('active', 'completed');

create table public.visits (
  id              uuid primary key default uuid_generate_v4(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  technician_id   uuid not null references public.profiles(id),
  producer_id     uuid not null references public.producers(id),
  property_id     uuid references public.properties(id),
  status          public.visit_status not null default 'active',
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  notes           text,
  gps_lat         double precision,
  gps_lng         double precision,
  synced_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ============================================================
-- VISIT RECORDS (registros agronômicos)
-- ============================================================
create type public.record_type as enum ('pest', 'disease', 'soil', 'management');
create type public.severity_level as enum ('low', 'medium', 'high');

create table public.visit_records (
  id            uuid primary key default uuid_generate_v4(),
  visit_id      uuid not null references public.visits(id) on delete cascade,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  type          public.record_type not null,
  description   text not null,
  severity      public.severity_level not null default 'low',
  media_urls    text[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- FORMS
-- ============================================================
create table public.forms (
  id            uuid primary key default uuid_generate_v4(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  title         text not null,
  description   text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- FORM FIELDS
-- ============================================================
create type public.field_type as enum ('text', 'number', 'select', 'checkbox', 'date', 'photo', 'gps');

create table public.form_fields (
  id           uuid primary key default uuid_generate_v4(),
  form_id      uuid not null references public.forms(id) on delete cascade,
  label        text not null,
  type         public.field_type not null,
  options      jsonb,
  required     boolean not null default false,
  order_index  integer not null default 0,
  created_at   timestamptz not null default now()
);

-- ============================================================
-- FORM RESPONSES
-- ============================================================
create table public.form_responses (
  id            uuid primary key default uuid_generate_v4(),
  form_id       uuid not null references public.forms(id),
  visit_id      uuid references public.visits(id),
  producer_id   uuid references public.producers(id),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  submitted_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- ============================================================
-- FORM ANSWERS
-- ============================================================
create table public.form_answers (
  id            uuid primary key default uuid_generate_v4(),
  response_id   uuid not null references public.form_responses(id) on delete cascade,
  field_id      uuid not null references public.form_fields(id),
  value_text    text,
  value_number  numeric,
  value_date    date,
  value_bool    boolean,
  value_json    jsonb,
  media_url     text,
  created_at    timestamptz not null default now()
);

-- ============================================================
-- TRIGGERS: updated_at automático
-- ============================================================
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at_producers
  before update on public.producers
  for each row execute function public.handle_updated_at();

create trigger set_updated_at_properties
  before update on public.properties
  for each row execute function public.handle_updated_at();

create trigger set_updated_at_visits
  before update on public.visits
  for each row execute function public.handle_updated_at();

create trigger set_updated_at_visit_records
  before update on public.visit_records
  for each row execute function public.handle_updated_at();

create trigger set_updated_at_forms
  before update on public.forms
  for each row execute function public.handle_updated_at();

-- ============================================================
-- TRIGGER: criar workspace automaticamente no cadastro
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
declare
  new_workspace_id uuid;
  workspace_name   text;
begin
  workspace_name := coalesce(
    new.raw_user_meta_data->>'workspace_name',
    new.raw_user_meta_data->>'full_name',
    'Minha Organização'
  );

  insert into public.workspaces (name)
  values (workspace_name)
  returning id into new_workspace_id;

  insert into public.profiles (id, workspace_id, full_name, role)
  values (
    new.id,
    new_workspace_id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    'admin'
  );

  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
alter table public.workspaces      enable row level security;
alter table public.profiles        enable row level security;
alter table public.producers       enable row level security;
alter table public.properties      enable row level security;
alter table public.visits          enable row level security;
alter table public.visit_records   enable row level security;
alter table public.forms           enable row level security;
alter table public.form_fields     enable row level security;
alter table public.form_responses  enable row level security;
alter table public.form_answers    enable row level security;

-- Helper function: retorna workspace_id do usuário autenticado
create or replace function public.get_user_workspace_id()
returns uuid as $$
  select workspace_id from public.profiles where id = auth.uid();
$$ language sql security definer stable;

-- workspaces: só ver o próprio
create policy "workspace_select" on public.workspaces
  for select using (id = public.get_user_workspace_id());

-- profiles
create policy "profiles_select" on public.profiles
  for select using (workspace_id = public.get_user_workspace_id());

create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());

-- producers
create policy "producers_all" on public.producers
  for all using (workspace_id = public.get_user_workspace_id());

-- properties
create policy "properties_all" on public.properties
  for all using (workspace_id = public.get_user_workspace_id());

-- visits
create policy "visits_all" on public.visits
  for all using (workspace_id = public.get_user_workspace_id());

-- visit_records
create policy "visit_records_all" on public.visit_records
  for all using (workspace_id = public.get_user_workspace_id());

-- forms
create policy "forms_all" on public.forms
  for all using (workspace_id = public.get_user_workspace_id());

-- form_fields: acesso via form
create policy "form_fields_all" on public.form_fields
  for all using (
    form_id in (
      select id from public.forms where workspace_id = public.get_user_workspace_id()
    )
  );

-- form_responses
create policy "form_responses_all" on public.form_responses
  for all using (workspace_id = public.get_user_workspace_id());

-- form_answers: acesso via response
create policy "form_answers_all" on public.form_answers
  for all using (
    response_id in (
      select id from public.form_responses where workspace_id = public.get_user_workspace_id()
    )
  );

-- ============================================================
-- ÍNDICES de performance
-- ============================================================
create index idx_producers_workspace on public.producers(workspace_id);
create index idx_properties_workspace on public.properties(workspace_id);
create index idx_properties_producer on public.properties(producer_id);
create index idx_visits_workspace on public.visits(workspace_id);
create index idx_visits_producer on public.visits(producer_id);
create index idx_visits_status on public.visits(status);
create index idx_visit_records_visit on public.visit_records(visit_id);
create index idx_forms_workspace on public.forms(workspace_id);
create index idx_form_fields_form on public.form_fields(form_id, order_index);
create index idx_form_responses_workspace on public.form_responses(workspace_id);
create index idx_form_responses_visit on public.form_responses(visit_id);
create index idx_form_answers_response on public.form_answers(response_id);
