-- ============================================================
-- Plataforma ATER — Migration 004: XLSForm / KoboToolbox
-- ============================================================

-- Novos tipos de campo
ALTER TYPE public.field_type ADD VALUE IF NOT EXISTS 'integer';
ALTER TYPE public.field_type ADD VALUE IF NOT EXISTS 'decimal';
ALTER TYPE public.field_type ADD VALUE IF NOT EXISTS 'select_multiple';
ALTER TYPE public.field_type ADD VALUE IF NOT EXISTS 'note';
ALTER TYPE public.field_type ADD VALUE IF NOT EXISTS 'time';
ALTER TYPE public.field_type ADD VALUE IF NOT EXISTS 'datetime';
ALTER TYPE public.field_type ADD VALUE IF NOT EXISTS 'audio';
ALTER TYPE public.field_type ADD VALUE IF NOT EXISTS 'video';
ALTER TYPE public.field_type ADD VALUE IF NOT EXISTS 'range';
ALTER TYPE public.field_type ADD VALUE IF NOT EXISTS 'calculate';
ALTER TYPE public.field_type ADD VALUE IF NOT EXISTS 'hidden';
ALTER TYPE public.field_type ADD VALUE IF NOT EXISTS 'begin_group';
ALTER TYPE public.field_type ADD VALUE IF NOT EXISTS 'end_group';

-- Propriedades XLSForm em form_fields
ALTER TABLE public.form_fields
  ADD COLUMN IF NOT EXISTS field_name       text,
  ADD COLUMN IF NOT EXISTS hint             text,
  ADD COLUMN IF NOT EXISTS relevant         text,
  ADD COLUMN IF NOT EXISTS constraint_expr  text,
  ADD COLUMN IF NOT EXISTS constraint_msg   text,
  ADD COLUMN IF NOT EXISTS required_msg     text,
  ADD COLUMN IF NOT EXISTS default_value    text,
  ADD COLUMN IF NOT EXISTS appearance       text,
  ADD COLUMN IF NOT EXISTS parameters       text,
  ADD COLUMN IF NOT EXISTS read_only        boolean not null default false,
  ADD COLUMN IF NOT EXISTS calculation      text;
