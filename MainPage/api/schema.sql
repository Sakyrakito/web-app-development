-- «Городские легенды» — схема SQLite.
-- Создаётся автоматически при первом обращении к API (см. bootstrap.php).

PRAGMA foreign_keys = ON;

-- Точка на карте. К одной точке привязано несколько историй.
CREATE TABLE IF NOT EXISTS places (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    lat        REAL    NOT NULL,
    lng        REAL    NOT NULL,
    address    TEXT,
    created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_places_lat_lng ON places(lat, lng);

CREATE TABLE IF NOT EXISTS stories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    place_id   INTEGER NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    text       TEXT    NOT NULL,
    category   TEXT    CHECK (category IS NULL OR category IN ('rumor', 'horror', 'history', 'omen')),
    likes      INTEGER NOT NULL DEFAULT 0,
    dislikes   INTEGER NOT NULL DEFAULT 0,
    reports    INTEGER NOT NULL DEFAULT 0,
    hidden     INTEGER NOT NULL DEFAULT 0,
    author     TEXT    NOT NULL,          -- sha256 от id анонимной сессии
    created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_stories_place   ON stories(place_id, hidden);
CREATE INDEX IF NOT EXISTS idx_stories_author  ON stories(author, created_at);
CREATE INDEX IF NOT EXISTS idx_stories_created ON stories(created_at);

CREATE TABLE IF NOT EXISTS votes (
    story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    actor    TEXT    NOT NULL,
    value    INTEGER NOT NULL CHECK (value IN (-1, 1)),
    PRIMARY KEY (story_id, actor)
);

CREATE TABLE IF NOT EXISTS reports (
    story_id   INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
    actor      TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (story_id, actor)
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
INSERT OR IGNORE INTO settings (key, value) VALUES ('report_threshold', '5');
