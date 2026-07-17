import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "platform_brief",
    ROOT / "scripts" / "platform_brief.py",
)
platform_brief = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(platform_brief)


class PlatformBriefMigrationTests(unittest.TestCase):
    def test_migration_number_ignores_date_format(self):
        self.assertEqual(platform_brief.migration_number("926_feature.sql"), 926)
        self.assertEqual(platform_brief.migration_number("20260703_feature.sql"), 0)
        self.assertEqual(platform_brief.migration_number("not_numbered.sql"), 0)

    def test_tracked_scope_matches_production_ledger_helper(self):
        self.assertTrue(platform_brief.is_tracked_migration("926_feature.sql"))
        self.assertFalse(platform_brief.is_tracked_migration("449_legacy.sql"))
        self.assertFalse(platform_brief.is_tracked_migration("20260703_feature.sql"))
        self.assertFalse(
            platform_brief.is_tracked_migration(
                "supabase_semantic_code_search_1536.sql"
            )
        )

    def test_drift_uses_exact_filename_not_numeric_ceiling(self):
        git = {
            "unpushed_commits": platform_brief.fact([], "test"),
            "dirty_count": platform_brief.fact(0, "test"),
        }
        migrations = {
            "tracked_migration_files": platform_brief.fact(
                ["785_existing.sql", "926_new.sql"], "test"
            )
        }
        d1 = {
            "applied_migration_names": platform_brief.fact(
                ["785_existing.sql"], "test"
            ),
            "applied_max_migration": platform_brief.fact(
                {"number": 785, "name": "785_existing.sql"}, "test"
            ),
            "active_tickets": platform_brief.fact([], "test"),
        }

        drift = platform_brief.detect_drift(git, migrations, d1)

        self.assertEqual(len(drift), 1)
        self.assertEqual(drift[0]["kind"], "migration_ledger_gap")
        self.assertEqual(drift[0]["items"], ["926_new.sql"])
        self.assertNotIn("20260703", drift[0]["detail"])


if __name__ == "__main__":
    unittest.main()
