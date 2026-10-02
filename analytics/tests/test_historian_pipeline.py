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
            # Independently sum the known 7 + 5 + 9 minute holds in a 180 minute
            # synthetic shift. A mean of cumulative samples is not a shift OEE.
            kpis = summary["kpis"]
            planned_seconds = 180 * 60
            downtime_seconds = (7 + 5 + 9) * 60
            operating_seconds = planned_seconds - downtime_seconds
            self.assertEqual(kpis["downtimeSeconds"], downtime_seconds)
            self.assertAlmostEqual(kpis["availability"], operating_seconds / planned_seconds, places=4)
            self.assertAlmostEqual(kpis["performance"], 8 * kpis["totalParts"] / operating_seconds, places=4)
            self.assertAlmostEqual(kpis["quality"], kpis["goodParts"] / kpis["totalParts"], places=4)
            self.assertAlmostEqual(kpis["oee"], 8 * kpis["goodParts"] / planned_seconds, places=4)
            self.assertNotIn(str(root), json.dumps(summary))
            bundled = json.loads((Path(__file__).resolve().parents[2] / "public/data/historian_summary.json").read_text())
            self.assertEqual(kpis, bundled["kpis"])
            self.assertEqual(summary["alarms"], bundled["alarms"])

            trend_header = (data_dir / "oee_trend.csv").read_text().splitlines()[0]
            self.assertIn("sampleTime,oee,availability,performance,quality", trend_header)
            self.assertTrue((examples_dir / "sql_analysis_results.json").exists())


if __name__ == "__main__":
    unittest.main()
