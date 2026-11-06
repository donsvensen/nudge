-- Likes: one heart per person per message.
-- channel_id is stored on the row so we can load and subscribe per channel cheaply.
create table message_likes (
  message_id uuid not null references messages(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  channel_id uuid not null references channels(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index message_likes_channel on message_likes (channel_id);

alter table message_likes enable row level security;

-- You can see likes in channels you can see.
create policy likes_read on message_likes for select to authenticated
  using (can_access_channel(channel_id));

-- You can like as yourself, on a real message in that channel, unless the channel is archived.
create policy likes_insert on message_likes for insert to authenticated
  with check (
    user_id = auth.uid()
    and can_access_channel(channel_id)
    and exists (select 1 from messages m where m.id = message_likes.message_id and m.channel_id = message_likes.channel_id)
    and not exists (select 1 from channels c where c.id = message_likes.channel_id and c.archived)
  );

-- You can only remove your own like.
create policy likes_delete on message_likes for delete to authenticated
  using (user_id = auth.uid());

alter publication supabase_realtime add table message_likes;
