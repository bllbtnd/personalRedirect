-- D1 Database Schema for URL Redirector
-- Database: redirect_db

DROP TABLE IF EXISTS links;
DROP TABLE IF EXISTS analytics;

CREATE TABLE links (
  slug TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  clicks INTEGER DEFAULT 0
);

-- Analytics table to track detailed visitor information
CREATE TABLE analytics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  
  -- IP and Network Info
  ip_address TEXT,
  asn TEXT,
  as_organization TEXT,
  
  -- Geographic Location
  continent TEXT,
  country TEXT,
  region TEXT,
  region_code TEXT,
  city TEXT,
  postal_code TEXT,
  latitude TEXT,
  longitude TEXT,
  timezone TEXT,
  metro_code TEXT,
  
  -- Browser and Client Info
  user_agent TEXT,
  referer TEXT,
  accept_language TEXT,
  accept_encoding TEXT,
  accept TEXT,
  connection TEXT,
  
  -- Request Details
  request_method TEXT,
  request_url TEXT,
  query_string TEXT,
  http_protocol TEXT,
  
  -- Security and TLS
  tls_version TEXT,
  tls_cipher TEXT,
  
  -- Cloudflare Specific
  cf_ray TEXT,
  cf_colo TEXT,
  cf_ipcountry TEXT,
  cf_connecting_ip TEXT,
  is_eu_country TEXT,
  
  -- Complete Data Dumps
  all_headers TEXT,
  cf_data_json TEXT,
  
  FOREIGN KEY (slug) REFERENCES links(slug) ON DELETE CASCADE
);

-- Optional: Create an index on clicks for analytics queries
CREATE INDEX idx_clicks ON links(clicks DESC);
CREATE INDEX idx_analytics_slug ON analytics(slug);
CREATE INDEX idx_analytics_timestamp ON analytics(timestamp DESC);
