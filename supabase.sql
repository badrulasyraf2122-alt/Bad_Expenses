-- Bad Expenses: run sekali dalam Supabase > SQL Editor

create table if not exists public.app_state (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text,
  body text,
  created_at timestamptz not null default now(),
  processed boolean not null default false
);
create table if not exists public.ingest_tokens (
  token_hash text primary key,
  user_id uuid not null references auth.users on delete cascade
);

alter table public.app_state enable row level security;
alter table public.transactions enable row level security;
alter table public.ingest_tokens enable row level security;

revoke all on public.app_state, public.transactions, public.ingest_tokens from anon, authenticated;
grant select, insert, update on public.app_state to authenticated;
grant select, update on public.transactions to authenticated;

drop policy if exists own_state on public.app_state;
create policy own_state on public.app_state for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists own_tx on public.transactions;
create policy own_tx on public.transactions for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Dipanggil oleh iPhone Shortcut. Token ini hanya boleh TAMBAH transaksi.
create or replace function public.add_tng(p_token text, p_title text default '', p_body text default '')
returns text language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  select user_id into uid from public.ingest_tokens
   where token_hash = encode(sha256(convert_to(p_token, 'utf8')), 'hex');
  if uid is null then raise exception 'token tidak sah'; end if;
  if (select count(*) from public.transactions
       where user_id = uid and created_at > now() - interval '1 day') >= 200 then
    raise exception 'had harian dicapai';
  end if;
  insert into public.transactions (user_id, title, body)
  values (uid, left(p_title, 200), left(p_body, 500));
  return 'ok';
end $$;
revoke all on function public.add_tng(text, text, text) from public;
grant execute on function public.add_tng(text, text, text) to anon;
