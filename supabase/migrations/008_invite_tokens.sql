-- ============================================================
-- Plataforma ATER — Migration 008: Tokens de convite seguros
-- Substitui o uso do workspace_id como código de convite por
-- tokens aleatórios de uso único com expiração.
-- ============================================================

-- ── Tabela de convites ────────────────────────────────────────
CREATE TABLE public.workspace_invites (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  token        text        NOT NULL UNIQUE,
  created_by   uuid        NOT NULL REFERENCES public.profiles(id),
  used_by      uuid        REFERENCES auth.users(id),
  used_at      timestamptz,
  expires_at   timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;

-- Admins do workspace podem ver e criar convites
CREATE POLICY "invites_admin_select" ON public.workspace_invites
  FOR SELECT
  USING (
    workspace_id = public.get_user_workspace_id()
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "invites_admin_insert" ON public.workspace_invites
  FOR INSERT
  WITH CHECK (
    workspace_id = public.get_user_workspace_id()
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- ── Função pública para validar token (usada no cadastro) ────
-- Acessível a usuários não autenticados (anon) para que o
-- frontend possa verificar o token antes de criar a conta.
CREATE OR REPLACE FUNCTION public.check_invite_token(token_input text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT jsonb_build_object(
    'valid',        true,
    'workspace_id', wi.workspace_id,
    'expires_at',   wi.expires_at
  )
  FROM public.workspace_invites wi
  WHERE wi.token = token_input
    AND wi.used_at IS NULL
    AND wi.expires_at > now()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.check_invite_token TO anon;
GRANT EXECUTE ON FUNCTION public.check_invite_token TO authenticated;

-- ── Atualiza handle_new_user: usa invite_token em vez de invite_workspace_id ──
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_workspace_id uuid;
  workspace_name   text;
  invite_token_val text;
  invite_ws_id     uuid;
BEGIN
  -- Verifica se há token de convite válido
  invite_token_val := NEW.raw_user_meta_data->>'invite_token';

  IF invite_token_val IS NOT NULL THEN
    SELECT workspace_id INTO invite_ws_id
    FROM public.workspace_invites
    WHERE token     = invite_token_val
      AND used_at   IS NULL
      AND expires_at > now();

    IF invite_ws_id IS NOT NULL THEN
      -- Marcar token como usado
      UPDATE public.workspace_invites
      SET used_by = NEW.id,
          used_at = now()
      WHERE token = invite_token_val;

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
    -- Token inválido/expirado: cria workspace próprio (comportamento seguro)
  END IF;

  -- Sem convite (ou token inválido): criar novo workspace como admin
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

-- Índice para lookup rápido por token
CREATE INDEX idx_workspace_invites_token ON public.workspace_invites(token)
  WHERE used_at IS NULL;
