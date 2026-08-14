alter table events
  add column client text not null default 'unknown'
  check (client in ('desktop', 'mobile', 'proxy', 'unknown'));
