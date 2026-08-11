-- 星際冒險學院：多教師資料模型與 Row Level Security。
-- 請在 Supabase SQL Editor 一次執行本檔案。

create extension if not exists pgcrypto;

create type public.app_role as enum ('teacher', 'student');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '老師',
  role public.app_role not null default 'teacher',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.classrooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 50),
  grade text not null default '',
  join_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 20),
  seat_number smallint check (seat_number between 1 and 99),
  created_at timestamptz not null default now(),
  unique (classroom_id, nickname),
  unique (classroom_id, seat_number)
);

create table public.question_banks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  subject text not null default '未分類',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references public.question_banks(id) on delete cascade,
  prompt text not null check (char_length(prompt) between 1 and 1000),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4),
  answer_index smallint not null check (answer_index between 0 and 3),
  explanation text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bosses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  bank_id uuid not null references public.question_banks(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 80),
  icon text not null default '👾',
  max_hp integer not null default 100 check (max_hp between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.classroom_bosses (
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  boss_id uuid not null references public.bosses(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (classroom_id, boss_id)
);

create table public.game_progress (
  student_id uuid not null references public.students(id) on delete cascade,
  boss_id uuid not null references public.bosses(id) on delete cascade,
  xp integer not null default 0 check (xp >= 0),
  coins integer not null default 0 check (coins >= 0),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (student_id, boss_id)
);

create table public.answer_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  is_correct boolean not null,
  answered_at timestamptz not null default now()
);

create index classrooms_owner_id_idx on public.classrooms(owner_id);
create index students_classroom_id_idx on public.students(classroom_id);
create index question_banks_owner_id_idx on public.question_banks(owner_id);
create index questions_bank_id_idx on public.questions(bank_id);
create index bosses_owner_id_idx on public.bosses(owner_id);
create index game_progress_student_id_idx on public.game_progress(student_id);
create index answer_attempts_student_id_idx on public.answer_attempts(student_id);

create or replace function public.handle_new_teacher()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '老師'), 'teacher')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_teacher();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
create trigger classrooms_updated_at before update on public.classrooms for each row execute procedure public.set_updated_at();
create trigger question_banks_updated_at before update on public.question_banks for each row execute procedure public.set_updated_at();
create trigger questions_updated_at before update on public.questions for each row execute procedure public.set_updated_at();
create trigger bosses_updated_at before update on public.bosses for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.classrooms enable row level security;
alter table public.students enable row level security;
alter table public.question_banks enable row level security;
alter table public.questions enable row level security;
alter table public.bosses enable row level security;
alter table public.classroom_bosses enable row level security;
alter table public.game_progress enable row level security;
alter table public.answer_attempts enable row level security;

create policy "teacher reads own profile" on public.profiles for select using (id = auth.uid());
create policy "teacher updates own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid() and role = 'teacher');
create policy "teacher manages own classrooms" on public.classrooms for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "teacher manages own students" on public.students for all using (exists (select 1 from public.classrooms c where c.id = classroom_id and c.owner_id = auth.uid())) with check (exists (select 1 from public.classrooms c where c.id = classroom_id and c.owner_id = auth.uid()));
create policy "teacher manages own banks" on public.question_banks for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "teacher manages own questions" on public.questions for all using (exists (select 1 from public.question_banks b where b.id = bank_id and b.owner_id = auth.uid())) with check (exists (select 1 from public.question_banks b where b.id = bank_id and b.owner_id = auth.uid()));
create policy "teacher manages own bosses" on public.bosses for all using (owner_id = auth.uid()) with check (owner_id = auth.uid() and exists (select 1 from public.question_banks b where b.id = bank_id and b.owner_id = auth.uid()));
create policy "teacher manages assigned bosses" on public.classroom_bosses for all using (exists (select 1 from public.classrooms c where c.id = classroom_id and c.owner_id = auth.uid())) with check (exists (select 1 from public.classrooms c where c.id = classroom_id and c.owner_id = auth.uid()) and exists (select 1 from public.bosses b where b.id = boss_id and b.owner_id = auth.uid()));
create policy "teacher reads own progress" on public.game_progress for select using (exists (select 1 from public.students s join public.classrooms c on c.id = s.classroom_id where s.id = student_id and c.owner_id = auth.uid()));
create policy "teacher reads own attempts" on public.answer_attempts for select using (exists (select 1 from public.students s join public.classrooms c on c.id = s.classroom_id where s.id = student_id and c.owner_id = auth.uid()));

-- 學生的班級加入碼、答題與進度寫入，應由 Edge Function 驗證。
-- service_role 金鑰只可放在 Edge Function 的環境變數，不得放入 VITE_ 前端環境變數。
