create table if not exists public.recipe_books (
  id text primary key check (id ~ '^[a-f0-9]{64}$'),
  payload text not null check (octet_length(payload) <= 3000),
  created_at timestamptz not null default now()
);

create sequence if not exists public.recipe_change_sequence;
create table if not exists public.recipes (
  book_id text not null references public.recipe_books(id) on delete cascade,
  id text not null,
  payload text check (octet_length(payload) <= 3300000),
  revision bigint not null default 1,
  deleted boolean not null default false,
  sequence bigint not null default nextval('public.recipe_change_sequence'),
  primary key (book_id, id)
);
create index if not exists recipes_book_sequence on public.recipes(book_id, sequence);

alter table public.recipe_books enable row level security;
alter table public.recipes enable row level security;
revoke all on public.recipe_books, public.recipes from anon, authenticated;
revoke all on sequence public.recipe_change_sequence from anon, authenticated;
grant all on public.recipe_books, public.recipes to service_role;
grant usage, select on sequence public.recipe_change_sequence to service_role;

-- An expected revision prevents two devices from silently overwriting each other.
create or replace function public.save_recipe(
  p_book_id text, p_id text, p_payload text, p_expected_revision bigint, p_deleted boolean
) returns jsonb
language plpgsql
set search_path = public
as $$
declare saved_revision bigint;
begin
  if p_expected_revision = 0 then
    insert into public.recipes(book_id, id, payload, deleted)
      values (p_book_id, p_id, p_payload, p_deleted)
      on conflict (book_id, id) do nothing
      returning revision into saved_revision;
  else
    update public.recipes set payload = p_payload, deleted = p_deleted,
      revision = revision + 1, sequence = nextval('public.recipe_change_sequence')
      where book_id = p_book_id and id = p_id and revision = p_expected_revision
      returning revision into saved_revision;
  end if;
  if saved_revision is null then return jsonb_build_object('conflict', true); end if;
  return jsonb_build_object('conflict', false, 'revision', saved_revision);
end;
$$;
revoke all on function public.save_recipe(text, text, text, bigint, boolean) from public, anon, authenticated;
grant execute on function public.save_recipe(text, text, text, bigint, boolean) to service_role;
