-- "Urban Legends" SQLite schema.
-- Applied on the first API request and re-run whenever SCHEMA_VERSION in core.php is bumped,
-- so every statement here must be safe to run against an existing database.

PRAGMA foreign_keys = ON;

-- A point on the map. One place holds many stories.
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
    author     TEXT    NOT NULL,          -- sha256 of the anonymous session id
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

-- Failed admin logins, for the per-IP lockout in api/admin-session.php.
CREATE TABLE IF NOT EXISTS login_failures (
    ip TEXT    NOT NULL,
    at INTEGER NOT NULL                   -- unix time
);
CREATE INDEX IF NOT EXISTS idx_login_failures ON login_failures(ip, at);
