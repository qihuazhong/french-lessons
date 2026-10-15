DROP TABLE IF EXISTS progress;
CREATE TABLE IF NOT EXISTS progress (
  user_id TEXT PRIMARY KEY,
  email TEXT,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
