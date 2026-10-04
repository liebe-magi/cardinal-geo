-- Add before deploying the new client. Old clients keep writing NULL snapshots.
-- Never infer presentation order from correctness or normalized question order.
begin;
alter table public.match_history
  add column if not exists presented_target_code text,
  add column if not exists presented_origin_code text,
  add column if not exists presented_correct_ns char(1),
  add column if not exists presented_correct_ew char(1);
alter table public.match_history add constraint match_history_presentation_complete check (
  (presented_target_code is null and presented_origin_code is null
    and presented_correct_ns is null and presented_correct_ew is null)
  or
  (presented_target_code is not null and presented_origin_code is not null
    and presented_target_code <> presented_origin_code
    and presented_correct_ns is not null and presented_correct_ns in ('N', 'S')
    and presented_correct_ew is not null and presented_correct_ew in ('E', 'W'))
);
commit;
