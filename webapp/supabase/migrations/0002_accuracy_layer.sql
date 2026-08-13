create table heartbeats (
  ip_hash text primary key,
  seen_at timestamptz not null default now()
);

create index heartbeats_seen_at_idx on heartbeats (seen_at);

alter table heartbeats enable row level security;
