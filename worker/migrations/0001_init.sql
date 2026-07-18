-- 커뮤니티 스팟 (공개 공유)
CREATE TABLE IF NOT EXISTS spots (
  id            TEXT PRIMARY KEY,
  lat           REAL NOT NULL,
  lng           REAL NOT NULL,
  name          TEXT NOT NULL,
  descr         TEXT NOT NULL DEFAULT '',
  rating        INTEGER NOT NULL DEFAULT 0,
  author_name   TEXT NOT NULL DEFAULT '익명',
  author_token  TEXT NOT NULL,
  reports       INTEGER NOT NULL DEFAULT 0,
  hidden        INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_spots_created ON spots(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spots_visible ON spots(hidden, created_at DESC);

-- 신고 (같은 토큰이 중복 신고 못하게 PK)
CREATE TABLE IF NOT EXISTS reports (
  spot_id         TEXT NOT NULL,
  reporter_token  TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  PRIMARY KEY (spot_id, reporter_token)
);
