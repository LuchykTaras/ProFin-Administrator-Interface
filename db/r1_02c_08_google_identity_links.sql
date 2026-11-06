BEGIN;

CREATE TABLE public.profin_google_link_challenges (
  challenge_id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES public.projects(project_id),
  user_id text NOT NULL REFERENCES public.users(user_id),
  session_id text NOT NULL REFERENCES public.sessions(session_id),
  nonce_hash text NOT NULL CHECK (length(nonce_hash) = 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK (expires_at > created_at)
);

CREATE INDEX profin_google_link_challenges_rate_idx
  ON public.profin_google_link_challenges(project_id, user_id, created_at DESC);

CREATE TABLE public.profin_google_link_requests (
  request_id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES public.projects(project_id),
  user_id text NOT NULL REFERENCES public.users(user_id),
  google_sub text NOT NULL CHECK (length(google_sub) BETWEEN 1 AND 255),
  google_email text NOT NULL CHECK (length(google_email) BETWEEN 3 AND 320),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  reviewed_at timestamptz,
  reviewed_by text REFERENCES public.users(user_id),
  review_reason text,
  CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX profin_google_link_requests_pending_user
  ON public.profin_google_link_requests(project_id, user_id)
  WHERE status = 'PENDING';
CREATE UNIQUE INDEX profin_google_link_requests_pending_sub
  ON public.profin_google_link_requests(project_id, google_sub)
  WHERE status = 'PENDING';
CREATE INDEX profin_google_link_requests_review_idx
  ON public.profin_google_link_requests(project_id, status, created_at DESC);

CREATE TABLE public.profin_google_identity_links (
  link_id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES public.projects(project_id),
  user_id text NOT NULL REFERENCES public.users(user_id),
  google_sub text NOT NULL CHECK (length(google_sub) BETWEEN 1 AND 255),
  google_email text NOT NULL CHECK (length(google_email) BETWEEN 3 AND 320),
  request_id text NOT NULL UNIQUE REFERENCES public.profin_google_link_requests(request_id),
  linked_at timestamptz NOT NULL DEFAULT now(),
  linked_by text NOT NULL REFERENCES public.users(user_id),
  revoked_at timestamptz,
  revoked_by text REFERENCES public.users(user_id),
  revocation_reason text
);

CREATE UNIQUE INDEX profin_google_identity_links_active_user
  ON public.profin_google_identity_links(project_id, user_id)
  WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX profin_google_identity_links_active_sub
  ON public.profin_google_identity_links(project_id, google_sub)
  WHERE revoked_at IS NULL;
CREATE INDEX profin_google_identity_links_lookup
  ON public.profin_google_identity_links(project_id, user_id, revoked_at);

COMMIT;
