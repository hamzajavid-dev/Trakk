create table emails (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null,
  thread_id text not null,
  subject text not null,
  recipient_count integer not null default 1,
  sent_at timestamptz not null default now(),
  tracking_enabled boolean not null default true
);

create table links (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references emails(id) on delete cascade,
  idx integer not null,
  url text not null,
  sig text not null,
  unique (email_id, idx)
);

create table events (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references emails(id) on delete cascade,
  link_id uuid references links(id) on delete cascade,
  type text not null check (type in ('prefetch', 'open', 'click')),
  at timestamptz not null default now(),
  ip_hash text not null,
  ua_hash text not null,
  is_proxy boolean not null default false,
  is_self boolean not null default false,
  confidence integer not null default 100
);

create index events_email_id_at_idx on events (email_id, at);

alter table emails enable row level security;
alter table links enable row level security;
alter table events enable row level security;
