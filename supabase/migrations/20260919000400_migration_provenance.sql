-- Trusted migration provenance; never browser-editable. Legacy reviewers stay
-- unknown rather than attributing past actions to the newly created administrator.
begin;
create table private.firebase_migration_records (
 id uuid primary key default gen_random_uuid(),
 source_path text not null unique,
 target_table text not null,
 target_id uuid not null,
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(target_table,target_id)
);
alter table private.firebase_migration_records enable row level security;
revoke all on private.firebase_migration_records from public,anon,authenticated;
grant all on private.firebase_migration_records to service_role;
alter table public.seller_profiles add column legacy_review_source_sha256 text
 check(legacy_review_source_sha256 is null or legacy_review_source_sha256 ~ '^[a-f0-9]{64}$');
alter table public.seller_profiles drop constraint seller_profiles_check;
alter table public.seller_profiles add constraint seller_profiles_review_check check (
 (status='PENDING' and reviewed_at is null and reviewed_by is null and rejection_reason is null and legacy_review_source_sha256 is null)
 or (status='APPROVED' and reviewed_at is not null and (reviewed_by is not null or legacy_review_source_sha256 is not null) and rejection_reason is null)
 or (status='REJECTED' and reviewed_at is not null and reviewed_by is not null and rejection_reason is not null and length(trim(rejection_reason))>0 and legacy_review_source_sha256 is null)
);
commit;
