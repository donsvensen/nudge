-- Image messages: a private Storage bucket + messages.image_path.
-- Files live at  <channel_id>/<uuid>.jpg  so storage policies can reuse the channel access rule.

alter table messages add column if not exists image_path text;

-- Replace the "must have content" check so an image-only message is allowed.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.messages'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%gif_url%'
  loop
    execute format('alter table public.messages drop constraint %I', c);
  end loop;
end $$;
alter table messages add constraint messages_has_content
  check (body <> '' or gif_url is not null or image_path is not null);

-- Private bucket, 5 MB per file, images only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

-- Read/upload only in channels you can access; archived channels are not checked here (messages are blocked by RLS).
create policy chat_images_read on storage.objects for select to authenticated
  using (bucket_id = 'chat-images' and can_access_channel(((storage.foldername(name))[1])::uuid));

create policy chat_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-images' and can_access_channel(((storage.foldername(name))[1])::uuid));

-- Delete your own uploads; admins can delete any.
create policy chat_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'chat-images' and (owner_id = auth.uid()::text or is_admin()));
