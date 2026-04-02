-- ============================================================
-- Plataforma ATER — Migration 002: Recomendações + Audio
-- ============================================================

-- ============================================================
-- RECOMMENDATIONS
-- ============================================================
create type public.recommendation_category as enum (
  'fertilizacao', 'defensivo', 'irrigacao', 'manejo', 'outro'
);

create table public.recommendations (
  id            uuid primary key default uuid_generate_v4(),
  visit_id      uuid not null references public.visits(id) on delete cascade,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  description   text not null,
  category      public.recommendation_category not null default 'outro',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger set_updated_at_recommendations
  before update on public.recommendations
  for each row execute function public.handle_updated_at();

alter table public.recommendations enable row level security;

create policy "recommendations_all" on public.recommendations
  for all using (workspace_id = public.get_user_workspace_id());

create index idx_recommendations_visit on public.recommendations(visit_id);
create index idx_recommendations_workspace on public.recommendations(workspace_id);

-- ============================================================
-- AUDIO: adicionar coluna audio_urls em visits
-- ============================================================
alter table public.visits
  add column if not exists audio_urls text[] not null default '{}';
