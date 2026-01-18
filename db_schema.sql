-- Create user_data table to store map annotations
create table if not exists user_data (
  user_id uuid references auth.users not null primary key,
  email text,
  data jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Enable RLS
alter table user_data enable row level security;

-- Policies for user_data
create policy "Users can view their own data" on user_data
  for select using (auth.uid() = user_id);

create policy "Users can insert their own data" on user_data
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own data" on user_data
  for update using (auth.uid() = user_id);

-- Create user_locations table for realtime tracking
create table if not exists user_locations (
  user_id uuid references auth.users not null primary key,
  email text,
  lat float,
  lng float,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Enable RLS
alter table user_locations enable row level security;

-- Policies for user_locations
create policy "Users can manage their own location" on user_locations
  for all using (auth.uid() = user_id);

-- Allow all authenticated users to view locations (needed for Admin dashboard to work for any authenticated user who is admin on frontend)
-- Ideally, you'd have an 'is_admin' column in a profiles table, but for this simple setup:
create policy "Authenticated users can view all locations" on user_locations
  for select using (auth.role() = 'authenticated');
