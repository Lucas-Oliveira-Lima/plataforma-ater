-- ============================================================
-- Plataforma ATER — Migration 005: Sistema de convite
-- ============================================================

-- Atualiza handle_new_user para suportar convite (join workspace existente)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_workspace_id uuid;
  workspace_name   text;
  invite_ws_id     uuid;
BEGIN
  -- Verifica se há convite para workspace existente
  BEGIN
    invite_ws_id := (NEW.raw_user_meta_data->>'invite_workspace_id')::uuid;
  EXCEPTION WHEN OTHERS THEN
    invite_ws_id := NULL;
  END;

  IF invite_ws_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.workspaces WHERE id = invite_ws_id
  ) THEN
    -- Entrar no workspace existente como técnico
    INSERT INTO public.profiles (id, workspace_id, full_name, role)
    VALUES (
      NEW.id,
      invite_ws_id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
      'technician'
    );
    RETURN NEW;
  END IF;

  -- Comportamento original: criar novo workspace como admin
  workspace_name := COALESCE(
    NEW.raw_user_meta_data->>'workspace_name',
    NEW.raw_user_meta_data->>'full_name',
    'Minha Organização'
  );

  INSERT INTO public.workspaces (name)
  VALUES (workspace_name)
  RETURNING id INTO new_workspace_id;

  INSERT INTO public.profiles (id, workspace_id, full_name, role)
  VALUES (
    NEW.id,
    new_workspace_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'admin'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
