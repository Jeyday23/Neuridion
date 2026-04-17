ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user'
CHECK (role IN ('user', 'admin'));
