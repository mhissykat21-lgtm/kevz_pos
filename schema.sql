-- ═══════════════════════════════════════════════════════════════════
--  WILCY POS — Supabase PostgreSQL Schema
--  Run this ONCE in: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. INVENTORY TABLE ──────────────────────────────────────────────
create table if not exists public.inventory (
  id           text        primary key,
  name         text        not null,
  sku          text        not null unique,
  qty          numeric     not null default 0,
  orig_price   numeric     not null default 0,
  price        numeric     not null default 0,
  threshold    integer     not null default 5,
  sold_by_kilo boolean     not null default false,
  created_at   timestamptz not null default now()
);

-- ── 2. SALES TABLE ──────────────────────────────────────────────────
create table if not exists public.sales (
  id           text        primary key,
  item_id      text        not null,
  item_name    text        not null,
  sku          text        not null default '',
  qty          numeric     not null default 1,
  sold_by_kilo boolean     not null default false,
  price_per_pc numeric     not null default 0,
  orig_price   numeric     not null default 0,
  revenue      numeric     not null default 0,
  total        numeric     not null default 0,
  customer     text        not null default 'Walk-in',
  payment      text        not null default 'Cash',
  date         text        not null default '',
  time         text        not null default '',
  txn_id       text        not null default '',
  created_at   timestamptz not null default now()
);

-- ── 3. USER ACCOUNTS TABLE ──────────────────────────────────────────
-- Stores app-level usernames and hashed passwords (not Supabase Auth).
-- Passwords are stored as SHA-256 hex strings hashed inside a PL/pgSQL function.
create table if not exists public.user_accounts (
  id           serial      primary key,
  username     text        not null unique,
  password_hash text       not null,        -- SHA-256 hex of the password
  role         text        not null default 'Cashier' check (role in ('Admin','Cashier')),
  display_name text        not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ── 4. SEED DEFAULT USERS ───────────────────────────────────────────
-- Passwords are stored as SHA-256 hashes.
-- admin123  → sha256 hex
-- pos2024   → sha256 hex
-- We use pgcrypto's digest() for this.
-- Enable extension first (only needed once per project):
create extension if not exists pgcrypto;

insert into public.user_accounts (username, password_hash, role, display_name)
values
  ('admin',   encode(digest('admin123', 'sha256'), 'hex'), 'Admin',   'Administrator'),
  ('cashier', encode(digest('pos2024',  'sha256'), 'hex'), 'Cashier', 'Cashier')
on conflict (username) do nothing;

-- ── 5. RPC: change_user_password ────────────────────────────────────
-- Called from auth.js to securely change a password.
-- Validates the old password before updating.
-- Returns JSON: { "success": true } or raises an exception.
create or replace function public.change_user_password(
  p_username     text,
  p_old_password text,
  p_new_password text
)
returns json
language plpgsql
security definer   -- runs with owner privileges so anon key can call it
as $$
declare
  v_user      public.user_accounts%rowtype;
  v_old_hash  text;
  v_new_hash  text;
begin
  -- Look up user
  select * into v_user
  from public.user_accounts
  where username = p_username;

  if not found then
    raise exception 'User not found' using errcode = 'P0001';
  end if;

  -- Hash the supplied old password and compare
  v_old_hash := encode(digest(p_old_password, 'sha256'), 'hex');
  if v_user.password_hash <> v_old_hash then
    raise exception 'Current password is incorrect' using errcode = 'P0002';
  end if;

  -- Validate new password length (also enforced in frontend)
  if length(p_new_password) < 8 then
    raise exception 'New password must be at least 8 characters' using errcode = 'P0003';
  end if;

  -- Hash and save the new password
  v_new_hash := encode(digest(p_new_password, 'sha256'), 'hex');

  update public.user_accounts
  set password_hash = v_new_hash,
      updated_at    = now()
  where username = p_username;

  return json_build_object('success', true);

exception
  when others then
    return json_build_object('success', false, 'error', sqlerrm);
end;
$$;

-- ── 6. RPC: verify_user_password ────────────────────────────────────
-- (Optional) — verifies a login attempt from the frontend.
-- Returns the user row as JSON on success, or error JSON on failure.
create or replace function public.verify_user_password(
  p_username text,
  p_password text
)
returns json
language plpgsql
security definer
as $$
declare
  v_user     public.user_accounts%rowtype;
  v_hash     text;
begin
  select * into v_user
  from public.user_accounts
  where username = p_username;

  if not found then
    return json_build_object('success', false, 'error', 'Invalid username or password');
  end if;

  v_hash := encode(digest(p_password, 'sha256'), 'hex');

  if v_user.password_hash <> v_hash then
    return json_build_object('success', false, 'error', 'Invalid username or password');
  end if;

  return json_build_object(
    'success',      true,
    'username',     v_user.username,
    'role',         v_user.role,
    'display_name', v_user.display_name
  );
end;
$$;

-- ── 7. ROW LEVEL SECURITY ────────────────────────────────────────────
alter table public.inventory     enable row level security;
alter table public.sales         enable row level security;
alter table public.user_accounts enable row level security;

-- Allow all operations via anon key (app handles auth itself)
create policy "anon_all_inventory"
  on public.inventory for all
  using (true) with check (true);

create policy "anon_all_sales"
  on public.sales for all
  using (true) with check (true);

-- user_accounts: anon can only call the RPCs above (security definer),
-- NOT directly select/update the table from the client.
-- No permissive policy → table is locked down from direct REST access.

-- ── 8. SAMPLE INVENTORY DATA ─────────────────────────────────────────
insert into public.inventory (id, name, sku, qty, orig_price, price, threshold, sold_by_kilo)
values
  ('demo001', 'Wireless Earbuds',       'WE-001', 25,  450,  799,  5, false),
  ('demo002', 'USB-C Hub 7-in-1',       'UC-007',  4,  620,  950,  5, false),
  ('demo003', 'Mechanical Keyboard',    'MK-104',  0, 1200, 1850,  3, false),
  ('demo004', 'Phone Stand Adjustable', 'PS-ADJ', 18,   85,  149,  5, false)
on conflict (id) do nothing;
