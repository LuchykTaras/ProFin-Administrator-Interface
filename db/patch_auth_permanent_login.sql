BEGIN;

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS password_hash text;

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS password_set_at timestamptz;

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS password_reset_required boolean
NOT NULL
DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique_idx
ON public.users (
  lower(email)
)
WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS sessions_user_active_idx
ON public.sessions (
  user_id,
  expires_at
)
WHERE revoked_at IS NULL;

COMMIT;