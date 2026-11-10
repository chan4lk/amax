-- 089: a default-branch push withdraws the proposals whose change folder is gone (AC-6), and an applied push can
-- carry skips a person must look at (AC-9, duplicate numbers). The Repo sync card shows both (AC-7).
alter table delivery.sync_push add column withdrawn int not null default 0;
alter table delivery.sync_push add column needs_review boolean not null default false;
