-- 102: the admin CLI must refuse an AUDIT_HASH_KEY that isn't this deployment's, or it appends audit rows no one can
-- verify or erase. The key covers every tenant, and a new tenant has no rows of its own, so the check reads the
-- newest keyed row across tenants. Like the job claims (0003), that cross-tenant read happens only inside this
-- SECURITY DEFINER function, owned by amax_claimer, and it returns one keyed hash, never a tenant's data. Only the
-- schema owner (the CLI) may call it; the app role can't.

grant select on core.audit_event to amax_claimer;
create policy claimer_read on core.audit_event for select to amax_claimer using (true);

create function core.latest_keyed_actor() returns table (actor text, actor_key text)
language sql stable security definer set search_path = core, pg_temp as $$
  select actor, actor_key from core.audit_event
   where chain_v = 2 and actor is not null and actor_key is not null
   order by occurred_at desc, seq desc
   limit 1;
$$;

alter function core.latest_keyed_actor() owner to amax_claimer;
revoke all on function core.latest_keyed_actor() from public;
grant execute on function core.latest_keyed_actor() to current_user;
