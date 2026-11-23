grant select, insert on public.generated_image_history to authenticated;

drop policy if exists "Users can insert their own generated image history" on public.generated_image_history;
create policy "Users can insert their own generated image history"
  on public.generated_image_history
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can upload their own generated images" on storage.objects;
create policy "Users can upload their own generated images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'obitrend-generated'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "Users can read their own generated images" on storage.objects;
create policy "Users can read their own generated images"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'obitrend-generated'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
