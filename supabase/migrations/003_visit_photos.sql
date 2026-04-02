-- ============================================================
-- Plataforma ATER — Migration 003: Fotos de visita
-- ============================================================
alter table public.visits
  add column if not exists photo_urls text[] not null default '{}';
