ALTER TABLE public.tracker_projects ADD COLUMN linear_project jsonb;
ALTER TABLE public.tracker_entries ADD CONSTRAINT tracker_entries_id_team_unique UNIQUE (id, team_id);

CREATE TABLE public.linear_issues (
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  organization_id uuid NOT NULL,
  PRIMARY KEY (team_id, id)
);

CREATE TABLE public.tracker_entry_linear_issues (
  team_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  issue_id uuid NOT NULL,
  PRIMARY KEY (team_id, entry_id, issue_id),
  FOREIGN KEY (entry_id, team_id) REFERENCES public.tracker_entries(id, team_id) ON DELETE CASCADE,
  FOREIGN KEY (team_id, issue_id) REFERENCES public.linear_issues(team_id, id) ON DELETE CASCADE
);

-- Ticket metadata is only accessible through the authenticated, team-scoped API.
ALTER TABLE public.linear_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracker_entry_linear_issues ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.linear_issues, public.tracker_entry_linear_issues FROM anon, authenticated;

-- Each authenticated Payments user owns their own Linear authorization.
CREATE TABLE public.linear_connections (
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  encrypted_config text NOT NULL,
  revocation_pending boolean NOT NULL DEFAULT false,
  PRIMARY KEY (team_id, user_id)
);
ALTER TABLE public.linear_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.linear_connections FROM PUBLIC, anon, authenticated;
