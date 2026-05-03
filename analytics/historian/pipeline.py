from __future__ import annotations

import argparse
import csv
import json
import math
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATABASE = REPO_ROOT / "examples" / "packaging_cell_historian.sqlite"
DEFAULT_DATA_DIR = REPO_ROOT / "public" / "data"
DEFAULT_EXAMPLES_DIR = REPO_ROOT / "examples"
RUN_ID = "packaging-cell-shift-a"
START_AT = datetime(2026, 4, 27, 8, 0, 0)
SCAN_INTERVAL_SECONDS = 10
RUN_MINUTES = 180
IDEAL_CYCLE_SECONDS = 8.0


@dataclass(frozen=True)
class AlarmWindow:
    tag: str
    start_minute: int
    duration_minutes: int
    severity: str
    message: str
    reason: str

    @property
    def end_minute(self) -> int:
        return self.start_minute + self.duration_minutes


ALARM_WINDOWS = [
    AlarmWindow("ALM_INFEED_JAM", 42, 7, "warning", "Infeed photoeye blocked longer than expected", "infeed jam"),
    AlarmWindow("ALM_REJECT_GATE", 96, 5, "warning", "Reject gate response time exceeded limit", "reject gate delay"),
    AlarmWindow("ALM_MOTOR_OVERLOAD", 132, 9, "critical", "Conveyor drive current exceeded trip threshold", "motor overload"),
]

TAG_TYPES = {
    "MTR_CONV_RUN": "BOOL",
    "PE_INFEED_BLOCKED": "BOOL",
    "PE_DISCHARGE_CLEAR": "BOOL",
    "CYL_REJECT_EXT": "BOOL",
    "CNT_GOOD_PARTS": "DINT",
    "CNT_REJECTS": "DINT",
    "OEE_OVERALL": "REAL",
    "MOTOR_CURRENT_A": "REAL",
    "STATE_NAME": "STRING",
}


def iso(value: datetime) -> str:
    return value.isoformat(timespec="seconds")


def active_alarm_at(minute: float) -> AlarmWindow | None:
    for window in ALARM_WINDOWS:
        if window.start_minute <= minute < window.end_minute:
            return window
    return None


def machine_state_for(minute: float, scan_number: int) -> tuple[str, str]:
    alarm = active_alarm_at(minute)
    if alarm:
        return ("fault", alarm.reason)
    phase = scan_number % 6
    states = [
        ("infeed", "Infeed"),
        ("index conveyor", "Conveyor"),
        ("inspect", "Vision inspection"),
        ("accept", "Accept lane"),
        ("reject", "Reject lane"),
        ("discharge", "Discharge"),
    ]
    return states[phase]


def reject_probability(minute: float) -> float:
    if minute < 80:
        return 0.035
    if minute < 120:
        return 0.055
    return 0.075


def build_rows() -> dict[str, list[tuple[Any, ...]]]:
    scan_rows: list[tuple[Any, ...]] = []
    production_rows: list[tuple[Any, ...]] = []
    oee_rows: list[tuple[Any, ...]] = []
    tag_rows: list[tuple[Any, ...]] = []
    alarm_rows: list[tuple[Any, ...]] = []
    good_parts = 0
    rejects = 0
    downtime_seconds = 0.0

    total_scans = int((RUN_MINUTES * 60) / SCAN_INTERVAL_SECONDS) + 1
    for scan_number in range(total_scans):
        elapsed_seconds = scan_number * SCAN_INTERVAL_SECONDS
        minute = elapsed_seconds / 60
        sample_ts = START_AT + timedelta(seconds=elapsed_seconds)
        alarm = active_alarm_at(minute)
        state, station = machine_state_for(minute, scan_number)

        if alarm:
            downtime_seconds += SCAN_INTERVAL_SECONDS
            package_position = 38.0 + (scan_number % 4) * 0.8
        else:
            package_position = (scan_number * 7.4) % 100

        produced_this_scan = not alarm and scan_number > 0
        if produced_this_scan:
            reject_every = max(12, round(1 / reject_probability(minute)))
            is_reject = scan_number % reject_every == 0
            if is_reject:
                rejects += 1
            else:
                good_parts += 1

        total_parts = good_parts + rejects
        planned_seconds = max(elapsed_seconds, 1)
        availability = max(0.0, (planned_seconds - downtime_seconds) / planned_seconds)
        target_parts = max((planned_seconds - downtime_seconds) / IDEAL_CYCLE_SECONDS, 1)
        performance = min(1.0, total_parts / target_parts)
        quality = good_parts / total_parts if total_parts else 1.0
        overall_oee = availability * performance * quality
        throughput_ppm = total_parts / (planned_seconds / 60)
        motor_current = 2.8 + (0.55 * math.sin(scan_number / 18)) + (2.2 if alarm and alarm.reason == "motor overload" else 0)
        cycle_time_ms = 7600 + (scan_number % 7) * 115 + (1450 if alarm else 0)

        scan_rows.append(
            (
                RUN_ID,
                iso(sample_ts),
                scan_number,
                state,
                station,
                round(cycle_time_ms, 1),
                round(package_position, 2),
                round(motor_current, 2),
            )
        )
        production_rows.append((RUN_ID, iso(sample_ts), scan_number, good_parts, rejects, total_parts))
        oee_rows.append(
            (
                RUN_ID,
                iso(sample_ts),
                scan_number,
                round(availability, 5),
                round(performance, 5),
                round(quality, 5),
                round(overall_oee, 5),
                round(throughput_ppm, 3),
                round(downtime_seconds, 1),
            )
        )

        tag_values = {
            "MTR_CONV_RUN": str(not alarm).lower(),
            "PE_INFEED_BLOCKED": str(bool(alarm and alarm.reason == "infeed jam")).lower(),
            "PE_DISCHARGE_CLEAR": str(scan_number % 8 != 0).lower(),
            "CYL_REJECT_EXT": str(state == "reject").lower(),
            "CNT_GOOD_PARTS": str(good_parts),
            "CNT_REJECTS": str(rejects),
            "OEE_OVERALL": f"{overall_oee:.5f}",
            "MOTOR_CURRENT_A": f"{motor_current:.2f}",
            "STATE_NAME": state,
        }
        for tag_name, tag_value in tag_values.items():
            tag_rows.append((RUN_ID, iso(sample_ts), scan_number, tag_name, tag_value, TAG_TYPES[tag_name], "Good"))

    for alarm in ALARM_WINDOWS:
        raised_at = START_AT + timedelta(minutes=alarm.start_minute)
        cleared_at = START_AT + timedelta(minutes=alarm.end_minute)
        alarm_rows.append(
            (
                RUN_ID,
                alarm.tag,
                iso(raised_at),
                iso(cleared_at),
                alarm.severity,
                alarm.message,
                alarm.reason,
                alarm.duration_minutes * 60,
            )
        )

    return {
        "scan_rows": scan_rows,
        "production_rows": production_rows,
        "oee_rows": oee_rows,
        "tag_rows": tag_rows,
        "alarm_rows": alarm_rows,
    }


def initialize_database(database_path: Path) -> sqlite3.Connection:
    database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database_path)
    schema_path = Path(__file__).with_name("schema.sql")
    connection.executescript(schema_path.read_text())
    connection.execute(
        """
        INSERT INTO historian_runs (
          run_id, line_name, scenario, started_at, ended_at, ideal_cycle_seconds, scan_interval_seconds
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            RUN_ID,
            "Packaging Cell A",
            "sample shift with jams and quality drift",
            iso(START_AT),
            iso(START_AT + timedelta(minutes=RUN_MINUTES)),
            IDEAL_CYCLE_SECONDS,
            SCAN_INTERVAL_SECONDS,
        ),
    )
    return connection


def populate_database(connection: sqlite3.Connection) -> None:
    rows = build_rows()
    connection.executemany(
        """
        INSERT INTO scan_samples (
          run_id, sample_ts, scan_number, machine_state, active_station, cycle_time_ms, package_position, motor_current_a
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows["scan_rows"],
    )
    connection.executemany(
        """
        INSERT INTO production_counts (run_id, sample_ts, scan_number, good_parts, rejects, total_parts)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        rows["production_rows"],
    )
    connection.executemany(
        """
        INSERT INTO oee_samples (
          run_id, sample_ts, scan_number, availability, performance, quality, overall_oee, throughput_ppm,
          unplanned_downtime_seconds
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows["oee_rows"],
    )
    connection.executemany(
        """
        INSERT INTO alarm_events (
          run_id, alarm_tag, raised_at, cleared_at, severity, message, downtime_reason, duration_seconds
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows["alarm_rows"],
    )
    connection.executemany(
        """
        INSERT INTO tag_samples (run_id, sample_ts, scan_number, tag_name, tag_value, data_type, quality)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        rows["tag_rows"],
    )
    connection.commit()


def query_rows(connection: sqlite3.Connection, sql: str) -> list[dict[str, Any]]:
    connection.row_factory = sqlite3.Row
    cursor = connection.execute(sql)
    return [dict(row) for row in cursor.fetchall()]


def latest_tag_snapshot(connection: sqlite3.Connection) -> list[dict[str, Any]]:
    return query_rows(
        connection,
        """
        SELECT t.tag_name AS name, t.tag_value AS value, t.data_type AS type, t.quality, t.sample_ts AS sampleTime
        FROM tag_samples t
        JOIN (
          SELECT tag_name, MAX(scan_number) AS scan_number
          FROM tag_samples
          GROUP BY tag_name
        ) latest
          ON latest.tag_name = t.tag_name
         AND latest.scan_number = t.scan_number
        ORDER BY t.tag_name
        """,
    )


def relative_database_label(database_path: Path) -> str:
    try:
        return str(database_path.relative_to(REPO_ROOT))
    except ValueError:
        return str(database_path)


def export_dashboard_data(connection: sqlite3.Connection, data_dir: Path, examples_dir: Path, database_path: Path) -> None:
    data_dir.mkdir(parents=True, exist_ok=True)
    examples_dir.mkdir(parents=True, exist_ok=True)

    summary = query_rows(connection, "SELECT * FROM oee_shift_summary")[0]
    oee_trend = query_rows(
        connection,
        """
        SELECT
          sample_ts AS sampleTime,
          overall_oee AS oee,
          availability,
          performance,
          quality,
          throughput_ppm AS throughputPpm,
          unplanned_downtime_seconds AS downtimeSeconds
        FROM oee_samples
        WHERE scan_number % 30 = 0
        ORDER BY scan_number
        """,
    )
    alarms = query_rows(
        connection,
        """
        SELECT alarm_tag AS tag, raised_at AS raisedAt, cleared_at AS clearedAt, severity, message,
               downtime_reason AS downtimeReason, duration_seconds AS durationSeconds
        FROM alarm_events
        ORDER BY raised_at
        """,
    )
    downtime = query_rows(
        connection,
        """
        SELECT downtime_reason AS reason, COUNT(*) AS eventCount, SUM(duration_seconds) AS durationSeconds
        FROM alarm_events
        GROUP BY downtime_reason
        ORDER BY durationSeconds DESC
        """,
    )
    recent_scans = query_rows(
        connection,
        """
        SELECT sample_ts AS sampleTime, scan_number AS scanNumber, machine_state AS machineState,
               active_station AS activeStation, cycle_time_ms AS cycleTimeMs, motor_current_a AS motorCurrentA
        FROM scan_samples
        ORDER BY scan_number DESC
        LIMIT 12
        """,
    )
    query_results = {
        "shiftSummary": summary,
        "alarmDowntime": downtime,
        "latestTags": latest_tag_snapshot(connection),
    }
    dashboard_summary = {
        "metadata": {
            "runId": RUN_ID,
            "lineName": summary["line_name"],
            "scenario": summary["scenario"],
            "generatedAt": iso(START_AT + timedelta(minutes=RUN_MINUTES)),
            "database": relative_database_label(database_path),
        },
        "kpis": {
            "goodParts": summary["good_parts"],
            "rejects": summary["rejects"],
            "totalParts": summary["total_parts"],
            "availability": summary["avg_availability"],
            "performance": summary["avg_performance"],
            "quality": summary["avg_quality"],
            "oee": summary["avg_oee"],
            "downtimeSeconds": summary["downtime_seconds"],
            "throughputPpm": summary["avg_throughput_ppm"],
        },
        "oeeTrend": oee_trend,
        "alarms": alarms,
        "downtimeReasons": downtime,
        "tagSnapshot": latest_tag_snapshot(connection),
        "recentScans": list(reversed(recent_scans)),
    }

    (data_dir / "historian_summary.json").write_text(json.dumps(dashboard_summary, indent=2) + "\n")
    (examples_dir / "sql_analysis_results.json").write_text(json.dumps(query_results, indent=2) + "\n")
    write_csv(data_dir / "oee_trend.csv", oee_trend)
    write_csv(data_dir / "alarm_events.csv", alarms)
    write_csv(data_dir / "tag_snapshot.csv", dashboard_summary["tagSnapshot"])


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        path.write_text("")
        return
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()), lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def build_historian(
    database_path: Path = DEFAULT_DATABASE,
    data_dir: Path = DEFAULT_DATA_DIR,
    examples_dir: Path = DEFAULT_EXAMPLES_DIR,
) -> None:
    if database_path.exists():
        database_path.unlink()
    connection = initialize_database(database_path)
    try:
        populate_database(connection)
        export_dashboard_data(connection, data_dir, examples_dir, database_path)
    finally:
        connection.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate the packaging-cell SQLite historian and static dashboard exports.")
    parser.add_argument("--database", type=Path, default=DEFAULT_DATABASE, help="SQLite historian output path.")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR, help="Static dashboard data directory.")
    parser.add_argument("--examples-dir", type=Path, default=DEFAULT_EXAMPLES_DIR, help="Example analysis output directory.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    build_historian(args.database, args.data_dir, args.examples_dir)


if __name__ == "__main__":
    main()
