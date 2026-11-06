-- Reactions: generalise likes (hearts) to a small set of emoji. Existing likes become ❤️ reactions.
-- Emoji are written as unicode escapes so they match the app's characters exactly.
alter table message_likes rename to message_reactions;
alter index message_likes_channel rename to message_reactions_channel;

alter table message_reactions add column emoji text not null default E'❤️';

-- A person may react to a message with several different emoji, but only once per emoji.
alter table message_reactions drop constraint message_likes_pkey;
alter table message_reactions add primary key (message_id, user_id, emoji);

-- Only these six: heart, thumbs up, laughing, surprised, sad, folded hands.
alter table message_reactions add constraint message_reactions_emoji_check
  check (emoji in (E'❤️', E'\U0001F44D', E'\U0001F602', E'\U0001F62E', E'\U0001F622', E'\U0001F64F'));

-- The existing policies (read / insert / delete-own) and realtime publication follow the renamed table.
