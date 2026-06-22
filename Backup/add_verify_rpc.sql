-- ═══════════════════════════════════════════════════════════════════════
--  WILCY POS — Add verify_user_password RPC
--  Run in: Supabase Dashboard → SQL Editor → New Query → ▶ Run
-- ═══════════════════════════════════════════════════════════════════════

-- Uses extensions.digest() explicitly (pgcrypto lives in extensions schema on Supabase)

create or replace function public.verify_user_password(
  p_username text,
  p_password text
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user  public.user_accounts%rowtype;
  v_hash  text;
begin
  select * into v_user
  from public.user_accounts
  where username = p_username;

  if not found then
    -- Same message for both "not found" and "wrong password" — avoids username enumeration
    return json_build_object('success', false, 'error', 'Invalid username or password');
  end if;

  v_hash := encode(extensions.digest(p_password, 'sha256'), 'hex');

  if v_user.password_hash <> v_hash then
    return json_build_object('success', false, 'error', 'Invalid username or password');
  end if;

  return json_build_object(
    'success',      true,
    'username',     v_user.username,
    'role',         v_user.role,
    'display_name', v_user.display_name
  );

exception
  when others then
    return json_build_object('success', false, 'error', sqlerrm);
end;
$$;

-- Grant anon access so the login page can call it
grant execute on function public.verify_user_password(text, text)
  to anon, authenticated;

-- ── Smoke test — should return { "success": true, "username": "admin", ... } ──
select public.verify_user_password('admin', 'admin123');
