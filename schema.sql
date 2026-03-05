-- D1 Database Schema for URL Redirector
-- Database: redirect_db

DROP TABLE IF EXISTS links;

CREATE TABLE links (
  slug TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  clicks INTEGER DEFAULT 0
);

-- Optional: Create an index on clicks for analytics queries
CREATE INDEX idx_clicks ON links(clicks DESC);
