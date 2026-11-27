-- Tukar email, kemudian Run. Salin token yang keluar (dipaparkan sekali sahaja).
with t as (
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') as token
), simpan as (
  insert into public.ingest_tokens (token_hash, user_id)
  select encode(sha256(convert_to(t.token, 'utf8')), 'hex'), u.id
  from t, auth.users u where u.email = 'EMAIL_AWAK'
  returning 1
)
select token from t where exists (select 1 from simpan);
