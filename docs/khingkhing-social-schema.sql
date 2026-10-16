-- ขิงขิง social schema proposal — DESIGN ONLY, NOT APPLIED.
-- Existing production tables (users, public_media) are intentionally untouched.
-- Apply only as reviewed, additive migrations after auth/storage decisions are approved.

CREATE TABLE IF NOT EXISTS social_users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  firebase_uid VARCHAR(128) NOT NULL,
  handle VARCHAR(32) NOT NULL,
  display_name VARCHAR(80) NOT NULL,
  bio VARCHAR(300) NOT NULL DEFAULT '',
  avatar_url VARCHAR(1024) NULL,
  locale VARCHAR(5) NOT NULL DEFAULT 'th',
  theme ENUM('system', 'light', 'dark') NOT NULL DEFAULT 'system',
  account_visibility ENUM('public', 'private') NOT NULL DEFAULT 'public',
  role ENUM('user', 'moderator', 'admin') NOT NULL DEFAULT 'user',
  follower_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  following_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  total_likes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_social_users_firebase_uid (firebase_uid),
  UNIQUE KEY uq_social_users_handle (handle),
  KEY ix_social_users_display_name (display_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS social_auth_identities (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  provider ENUM('phone', 'google', 'apple', 'facebook') NOT NULL,
  provider_subject VARCHAR(191) NOT NULL,
  email VARCHAR(320) NULL,
  phone_e164 VARCHAR(16) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_social_identity_provider_subject (provider, provider_subject),
  UNIQUE KEY uq_social_identity_user_provider (user_id, provider),
  CONSTRAINT fk_social_identity_user FOREIGN KEY (user_id) REFERENCES social_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS social_sounds (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_id BIGINT UNSIGNED NULL,
  title VARCHAR(120) NOT NULL,
  artist VARCHAR(120) NOT NULL DEFAULT '',
  asset_key VARCHAR(512) NOT NULL,
  duration_ms INT UNSIGNED NOT NULL,
  license_code VARCHAR(80) NOT NULL,
  usage_policy ENUM('original', 'licensed', 'restricted') NOT NULL DEFAULT 'licensed',
  status ENUM('active', 'muted', 'removed') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_social_sounds_title (title),
  KEY ix_social_sounds_owner (owner_id, created_at),
  CONSTRAINT fk_social_sound_owner FOREIGN KEY (owner_id) REFERENCES social_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS social_videos (
  id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  author_id BIGINT UNSIGNED NULL,
  legacy_media_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
  storage_backend ENUM('mysql_blob', 'cloudflare_stream') NOT NULL DEFAULT 'mysql_blob',
  stream_uid VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  media_blob LONGBLOB NULL,
  cover_url VARCHAR(1024) NULL,
  caption VARCHAR(2200) NOT NULL DEFAULT '',
  duration_ms INT UNSIGNED NOT NULL,
  size_bytes INT UNSIGNED NOT NULL,
  mime_type VARCHAR(80) NOT NULL,
  width SMALLINT UNSIGNED NULL,
  height SMALLINT UNSIGNED NULL,
  sound_id BIGINT UNSIGNED NULL,
  visibility ENUM('public', 'followers', 'private') NOT NULL DEFAULT 'public',
  status ENUM('draft', 'processing', 'published', 'blocked', 'deleted') NOT NULL DEFAULT 'draft',
  allow_comments BOOLEAN NOT NULL DEFAULT TRUE,
  allow_duet BOOLEAN NOT NULL DEFAULT TRUE,
  allow_stitch BOOLEAN NOT NULL DEFAULT TRUE,
  remix_type ENUM('original', 'duet', 'stitch') NOT NULL DEFAULT 'original',
  source_video_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
  source_start_ms INT UNSIGNED NULL,
  source_end_ms INT UNSIGNED NULL,
  edit_recipe JSON NULL,
  view_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  like_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  comment_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  share_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  published_at TIMESTAMP(3) NULL,
  deleted_at TIMESTAMP(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_social_video_legacy (legacy_media_id),
  UNIQUE KEY uq_social_video_stream (stream_uid),
  KEY ix_social_video_for_you (status, visibility, published_at, id),
  KEY ix_social_video_creator (author_id, status, published_at),
  KEY ix_social_video_sound (sound_id, published_at),
  KEY ix_social_video_source (source_video_id, created_at),
  CONSTRAINT fk_social_video_author FOREIGN KEY (author_id) REFERENCES social_users(id) ON DELETE SET NULL,
  CONSTRAINT fk_social_video_sound FOREIGN KEY (sound_id) REFERENCES social_sounds(id) ON DELETE SET NULL,
  CONSTRAINT fk_social_video_source FOREIGN KEY (source_video_id) REFERENCES social_videos(id) ON DELETE SET NULL,
  CONSTRAINT chk_social_video_duration CHECK (duration_ms BETWEEN 15000 AND 180000),
  CONSTRAINT chk_social_video_mvp_size CHECK (size_bytes <= 20971520 OR storage_backend = 'cloudflare_stream')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS social_follows (
  follower_id BIGINT UNSIGNED NOT NULL,
  following_id BIGINT UNSIGNED NOT NULL,
  status ENUM('pending', 'accepted') NOT NULL DEFAULT 'accepted',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (follower_id, following_id),
  KEY ix_social_follows_incoming (following_id, status, created_at),
  CONSTRAINT fk_social_follow_follower FOREIGN KEY (follower_id) REFERENCES social_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_social_follow_following FOREIGN KEY (following_id) REFERENCES social_users(id) ON DELETE CASCADE,
  CONSTRAINT chk_social_follow_no_self CHECK (follower_id <> following_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS social_video_likes (
  user_id BIGINT UNSIGNED NOT NULL,
  video_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, video_id),
  KEY ix_social_video_likes_video (video_id, created_at),
  CONSTRAINT fk_social_video_like_user FOREIGN KEY (user_id) REFERENCES social_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_social_video_like_video FOREIGN KEY (video_id) REFERENCES social_videos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS social_bookmarks (
  user_id BIGINT UNSIGNED NOT NULL,
  video_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, video_id),
  KEY ix_social_bookmarks_recent (user_id, created_at),
  CONSTRAINT fk_social_bookmark_user FOREIGN KEY (user_id) REFERENCES social_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_social_bookmark_video FOREIGN KEY (video_id) REFERENCES social_videos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS social_comments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  video_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  author_id BIGINT UNSIGNED NULL,
  parent_id BIGINT UNSIGNED NULL,
  body VARCHAR(1000) NOT NULL,
  status ENUM('visible', 'hidden', 'removed') NOT NULL DEFAULT 'visible',
  like_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_social_comments_video (video_id, status, created_at, id),
  KEY ix_social_comments_parent (parent_id, created_at),
  KEY ix_social_comments_author (author_id, created_at),
  CONSTRAINT fk_social_comment_video FOREIGN KEY (video_id) REFERENCES social_videos(id) ON DELETE CASCADE,
  CONSTRAINT fk_social_comment_author FOREIGN KEY (author_id) REFERENCES social_users(id) ON DELETE SET NULL,
  CONSTRAINT fk_social_comment_parent FOREIGN KEY (parent_id) REFERENCES social_comments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS social_hashtags (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tag VARCHAR(100) NOT NULL,
  use_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_social_hashtag_tag (tag),
  KEY ix_social_hashtag_trending (use_count, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS social_video_hashtags (
  video_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  hashtag_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (video_id, hashtag_id),
  KEY ix_social_video_hashtag_lookup (hashtag_id, video_id),
  CONSTRAINT fk_social_video_hashtag_video FOREIGN KEY (video_id) REFERENCES social_videos(id) ON DELETE CASCADE,
  CONSTRAINT fk_social_video_hashtag_tag FOREIGN KEY (hashtag_id) REFERENCES social_hashtags(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS social_video_daily_metrics (
  video_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  metric_date DATE NOT NULL,
  impressions BIGINT UNSIGNED NOT NULL DEFAULT 0,
  qualified_views BIGINT UNSIGNED NOT NULL DEFAULT 0,
  completions BIGINT UNSIGNED NOT NULL DEFAULT 0,
  rewatches BIGINT UNSIGNED NOT NULL DEFAULT 0,
  total_watch_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,
  skips BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (video_id, metric_date),
  KEY ix_social_metrics_date (metric_date, qualified_views),
  CONSTRAINT fk_social_metrics_video FOREIGN KEY (video_id) REFERENCES social_videos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS social_notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  recipient_id BIGINT UNSIGNED NOT NULL,
  actor_id BIGINT UNSIGNED NULL,
  type ENUM('like', 'comment', 'reply', 'follow', 'mention', 'tag') NOT NULL,
  video_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
  comment_id BIGINT UNSIGNED NULL,
  payload JSON NULL,
  read_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_social_notifications_inbox (recipient_id, read_at, created_at, id),
  CONSTRAINT fk_social_notification_recipient FOREIGN KEY (recipient_id) REFERENCES social_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_social_notification_actor FOREIGN KEY (actor_id) REFERENCES social_users(id) ON DELETE SET NULL,
  CONSTRAINT fk_social_notification_video FOREIGN KEY (video_id) REFERENCES social_videos(id) ON DELETE CASCADE,
  CONSTRAINT fk_social_notification_comment FOREIGN KEY (comment_id) REFERENCES social_comments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS social_blocks (
  blocker_id BIGINT UNSIGNED NOT NULL,
  blocked_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (blocker_id, blocked_id),
  KEY ix_social_blocks_reverse (blocked_id, blocker_id),
  CONSTRAINT fk_social_block_blocker FOREIGN KEY (blocker_id) REFERENCES social_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_social_block_blocked FOREIGN KEY (blocked_id) REFERENCES social_users(id) ON DELETE CASCADE,
  CONSTRAINT chk_social_block_no_self CHECK (blocker_id <> blocked_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS social_reports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reporter_id BIGINT UNSIGNED NULL,
  target_type ENUM('video', 'user', 'comment', 'live') NOT NULL,
  target_id VARCHAR(64) NOT NULL,
  reason ENUM('spam', 'harassment', 'sexual_content', 'violence', 'copyright', 'self_harm', 'other') NOT NULL,
  details VARCHAR(1000) NOT NULL DEFAULT '',
  status ENUM('open', 'triaged', 'resolved', 'dismissed') NOT NULL DEFAULT 'open',
  assigned_to BIGINT UNSIGNED NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  resolved_at TIMESTAMP(3) NULL,
  PRIMARY KEY (id),
  KEY ix_social_reports_queue (status, created_at),
  KEY ix_social_reports_target (target_type, target_id, status),
  CONSTRAINT fk_social_reporter FOREIGN KEY (reporter_id) REFERENCES social_users(id) ON DELETE SET NULL,
  CONSTRAINT fk_social_report_assignee FOREIGN KEY (assigned_to) REFERENCES social_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS social_live_rooms (
  id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  host_id BIGINT UNSIGNED NOT NULL,
  provider_room_id VARCHAR(191) NULL,
  title VARCHAR(120) NOT NULL,
  status ENUM('scheduled', 'live', 'ended', 'blocked') NOT NULL DEFAULT 'scheduled',
  viewer_count INT UNSIGNED NOT NULL DEFAULT 0,
  started_at TIMESTAMP(3) NULL,
  ended_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_social_live_provider_room (provider_room_id),
  KEY ix_social_live_discovery (status, started_at),
  CONSTRAINT fk_social_live_host FOREIGN KEY (host_id) REFERENCES social_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Safety invariants enforced in API/transactions (and by migration-specific CHECK constraints
-- where supported): no self-follow/block, max 20 MiB upload in MVP, 15–180 s duration,
-- authorized owner-only edit/delete, block filters on all feed/search/comment/notification reads,
-- and idempotent unique writes for follows/likes/bookmarks/views.
