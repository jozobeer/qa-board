CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
ALTER TABLE questions ADD COLUMN room_id TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_questions_room ON questions(room_id, id);
