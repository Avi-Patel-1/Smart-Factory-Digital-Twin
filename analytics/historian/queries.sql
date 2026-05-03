-- Shift-level OEE, counts, and downtime.
SELECT *
FROM oee_shift_summary;

-- OEE trend at five-minute buckets for dashboard charts.
SELECT
  substr(sample_ts, 1, 15) || '0:00' AS bucket_start,
  ROUND(AVG(overall_oee), 4) AS oee,
  ROUND(AVG(availability), 4) AS availability,
  ROUND(AVG(performance), 4) AS performance,
  ROUND(AVG(quality), 4) AS quality,
  ROUND(AVG(throughput_ppm), 2) AS throughput_ppm
FROM oee_samples
GROUP BY bucket_start
ORDER BY bucket_start;

-- Alarm downtime by reason.
SELECT
  downtime_reason,
  COUNT(*) AS event_count,
  ROUND(SUM(duration_seconds), 1) AS downtime_seconds,
  MAX(severity) AS max_severity
FROM alarm_events
GROUP BY downtime_reason
ORDER BY downtime_seconds DESC;

-- Latest dashboard tags.
SELECT t.tag_name, t.tag_value, t.data_type, t.quality, t.sample_ts
FROM tag_samples t
JOIN (
  SELECT tag_name, MAX(scan_number) AS scan_number
  FROM tag_samples
  GROUP BY tag_name
) latest
  ON latest.tag_name = t.tag_name
 AND latest.scan_number = t.scan_number
ORDER BY t.tag_name;
