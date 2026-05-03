PRAGMA foreign_keys = ON;

DROP VIEW IF EXISTS oee_shift_summary;
DROP TABLE IF EXISTS tag_samples;
DROP TABLE IF EXISTS alarm_events;
DROP TABLE IF EXISTS oee_samples;
DROP TABLE IF EXISTS production_counts;
DROP TABLE IF EXISTS scan_samples;
DROP TABLE IF EXISTS historian_runs;

CREATE TABLE historian_runs (
  run_id TEXT PRIMARY KEY,
  line_name TEXT NOT NULL,
  scenario TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  ideal_cycle_seconds REAL NOT NULL,
  scan_interval_seconds REAL NOT NULL
);

CREATE TABLE scan_samples (
  sample_id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES historian_runs(run_id),
  sample_ts TEXT NOT NULL,
  scan_number INTEGER NOT NULL,
  machine_state TEXT NOT NULL,
  active_station TEXT NOT NULL,
  cycle_time_ms REAL NOT NULL,
  package_position REAL NOT NULL,
  motor_current_a REAL NOT NULL
);

CREATE TABLE production_counts (
  sample_id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES historian_runs(run_id),
  sample_ts TEXT NOT NULL,
  scan_number INTEGER NOT NULL,
  good_parts INTEGER NOT NULL,
  rejects INTEGER NOT NULL,
  total_parts INTEGER NOT NULL
);

CREATE TABLE oee_samples (
  sample_id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES historian_runs(run_id),
  sample_ts TEXT NOT NULL,
  scan_number INTEGER NOT NULL,
  availability REAL NOT NULL,
  performance REAL NOT NULL,
  quality REAL NOT NULL,
  overall_oee REAL NOT NULL,
  throughput_ppm REAL NOT NULL,
  unplanned_downtime_seconds REAL NOT NULL
);

CREATE TABLE alarm_events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES historian_runs(run_id),
  alarm_tag TEXT NOT NULL,
  raised_at TEXT NOT NULL,
  cleared_at TEXT,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  downtime_reason TEXT NOT NULL,
  duration_seconds REAL NOT NULL
);

CREATE TABLE tag_samples (
  sample_id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES historian_runs(run_id),
  sample_ts TEXT NOT NULL,
  scan_number INTEGER NOT NULL,
  tag_name TEXT NOT NULL,
  tag_value TEXT NOT NULL,
  data_type TEXT NOT NULL,
  quality TEXT NOT NULL
);

CREATE INDEX idx_scan_run_ts ON scan_samples(run_id, sample_ts);
CREATE INDEX idx_oee_run_ts ON oee_samples(run_id, sample_ts);
CREATE INDEX idx_tags_run_name_ts ON tag_samples(run_id, tag_name, sample_ts);
CREATE INDEX idx_alarms_run_raised ON alarm_events(run_id, raised_at);

CREATE VIEW oee_shift_summary AS
SELECT
  r.run_id,
  r.line_name,
  r.scenario,
  r.started_at,
  r.ended_at,
  MAX(p.good_parts) AS good_parts,
  MAX(p.rejects) AS rejects,
  MAX(p.total_parts) AS total_parts,
  ROUND(AVG(o.availability), 4) AS avg_availability,
  ROUND(AVG(o.performance), 4) AS avg_performance,
  ROUND(AVG(o.quality), 4) AS avg_quality,
  ROUND(AVG(o.overall_oee), 4) AS avg_oee,
  ROUND(MAX(o.unplanned_downtime_seconds), 1) AS downtime_seconds,
  ROUND(AVG(o.throughput_ppm), 2) AS avg_throughput_ppm
FROM historian_runs r
JOIN production_counts p ON p.run_id = r.run_id
JOIN oee_samples o ON o.run_id = r.run_id AND o.scan_number = p.scan_number
GROUP BY r.run_id;
