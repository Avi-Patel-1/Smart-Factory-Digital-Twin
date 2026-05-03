import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from analytics.historian.pipeline import build_historian


class HistorianPipelineTest(unittest.TestCase):
    def test_builds_sqlite_historian_and_static_exports(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            database = root / "historian.sqlite"
            data_dir = root / "public" / "data"
            examples_dir = root / "examples"

            build_historian(database, data_dir, examples_dir)

            self.assertTrue(database.exists())
            with sqlite3.connect(database) as connection:
                scan_count = connection.execute("SELECT COUNT(*) FROM scan_samples").fetchone()[0]
                alarm_count = connection.execute("SELECT COUNT(*) FROM alarm_events").fetchone()[0]
                tag_count = connection.execute("SELECT COUNT(*) FROM tag_samples").fetchone()[0]
                self.assertGreater(scan_count, 1000)
                self.assertEqual(alarm_count, 3)
                self.assertGreater(tag_count, scan_count * 5)

            summary = json.loads((data_dir / "historian_summary.json").read_text())
            self.assertEqual(summary["metadata"]["runId"], "packaging-cell-shift-a")
            self.assertGreater(summary["kpis"]["goodParts"], 0)
            self.assertGreater(summary["kpis"]["oee"], 0.6)
            self.assertLessEqual(summary["kpis"]["oee"], 1.0)
            self.assertEqual(len(summary["alarms"]), 3)

            trend_header = (data_dir / "oee_trend.csv").read_text().splitlines()[0]
            self.assertIn("sampleTime,oee,availability,performance,quality", trend_header)
            self.assertTrue((examples_dir / "sql_analysis_results.json").exists())


if __name__ == "__main__":
    unittest.main()
