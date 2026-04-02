-- Checklist templates (workspace-level, managed by admin)
CREATE TABLE IF NOT EXISTS checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  label text NOT NULL,
  order_index int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE checklist_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_member_access" ON checklist_templates
  USING (workspace_id = (SELECT workspace_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (workspace_id = (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

-- Checklist items (per-visit instances, copied from templates)
CREATE TABLE IF NOT EXISTS checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  visit_id uuid NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  label text NOT NULL,
  checked boolean NOT NULL DEFAULT false,
  order_index int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_member_access" ON checklist_items
  USING (workspace_id = (SELECT workspace_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (workspace_id = (SELECT workspace_id FROM profiles WHERE id = auth.uid()));

-- Allow admins to update other members' profiles in the same workspace
DROP POLICY IF EXISTS "admin_can_update_members" ON profiles;
CREATE POLICY "admin_can_update_members" ON profiles
  FOR UPDATE
  USING (
    workspace_id = (SELECT workspace_id FROM profiles p2 WHERE p2.id = auth.uid())
    AND (SELECT role FROM profiles p3 WHERE p3.id = auth.uid()) = 'admin'
    AND id <> auth.uid()
  )
  WITH CHECK (true);
