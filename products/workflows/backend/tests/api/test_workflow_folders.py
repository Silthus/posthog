from posthog.test.base import APIBaseTest
from unittest.mock import MagicMock, patch

from posthog.models.activity_logging.activity_log import ActivityLog
from posthog.models.file_system.file_system import FileSystem

from products.messaging.backend.models.message_template import MessageTemplate
from products.workflows.backend.models.hog_flow.hog_flow import HogFlow


class TestWorkflowFolders(APIBaseTest):
    def setUp(self) -> None:
        super().setUp()
        flag = patch("posthoganalytics.feature_enabled", return_value=True)
        flag.start()
        self.addCleanup(flag.stop)

    @patch("posthoganalytics.feature_enabled", return_value=False)
    def test_disabled_project_files_leave_tree_search_and_unfiled_unchanged(self, _flag: MagicMock) -> None:
        with patch("products.workflows.backend.models.hog_flow.hog_flow.reload_hog_flows_on_workers"):
            workflow = HogFlow.objects.create(team=self.team, name="Synthetic welcome")
        template = MessageTemplate.objects.create(team=self.team, name="Synthetic email", type="email")
        FileSystem.objects.create(team=self.team, path="Unfiled", depth=1, type="folder")
        FileSystem.objects.create(team=self.team, path="Unfiled/Workflows", depth=2, type="folder")
        FileSystem.objects.create(team=self.team, path="Unfiled/Email templates", depth=2, type="folder")
        notebook = FileSystem.objects.create(
            team=self.team, path="Unfiled/Synthetic notebook", depth=2, type="notebook", ref="invented"
        )
        files_url = f"/api/projects/{self.team.id}/file_system/"
        for params in ({}, {"search": "Synthetic"}, {"parent": "Unfiled", "depth": "2"}):
            response = self.client.get(files_url, params)
            self.assertEqual(response.status_code, 200)
            rows = response.json()["results"]
            self.assertFalse(any(row["type"] in ("hog_flow", "message_template") for row in rows))
            self.assertFalse(any(row["path"] in ("Unfiled/Workflows", "Unfiled/Email templates") for row in rows))
            self.assertTrue(any(row["id"] == str(notebook.id) for row in rows))
        FileSystem.objects.filter(team=self.team, type__in=["hog_flow", "message_template"]).delete()
        response = self.client.get(f"{files_url}unfiled/")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(FileSystem.objects.filter(team=self.team, type__in=["hog_flow", "message_template"]).exists())
        self.assertTrue(HogFlow.objects.filter(team=self.team, id=workflow.id).exists())
        self.assertTrue(MessageTemplate.objects.filter(team=self.team, id=template.id).exists())

    @patch("products.workflows.backend.models.hog_flow.hog_flow.reload_hog_flows_on_workers")
    def test_deleting_workflow_through_project_files_records_activity(self, _reload: MagicMock) -> None:
        created = self.client.post(
            f"/api/projects/{self.team.id}/hog_flows/",
            {
                "name": "Welcome",
                "actions": [{"id": "trigger", "name": "Trigger", "type": "trigger", "config": {"type": "manual"}}],
                "edges": [],
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.content)
        workflow_id = created.json()["id"]
        files = self.client.get(
            f"/api/projects/{self.team.id}/file_system/", {"type": "hog_flow", "ref": workflow_id}
        ).json()["results"]
        deleted = self.client.delete(f"/api/projects/{self.team.id}/file_system/{files[0]['id']}/")
        self.assertEqual(deleted.status_code, 200, deleted.content)
        self.assertTrue(
            ActivityLog.objects.filter(
                team_id=self.team.id, scope="HogFlow", item_id=workflow_id, activity="deleted"
            ).exists()
        )

    def test_email_template_can_be_created_and_moved_in_project_files(self) -> None:
        created = self.client.post(
            f"/api/projects/{self.team.id}/messaging_templates/",
            {"name": "Welcome email", "type": "email", "_create_in_folder": "Campaigns"},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.content)
        files_url = f"/api/projects/{self.team.id}/file_system/"
        files = self.client.get(files_url, {"type": "message_template", "ref": created.json()["id"]}).json()["results"]
        self.assertEqual([file["path"] for file in files], ["Campaigns/Welcome email"])
        entry = files[0]
        moved = self.client.post(
            f"{files_url}{entry['id']}/move/", {"new_path": "Campaigns/Retention/Welcome email"}, format="json"
        )
        self.assertEqual(moved.status_code, 200, moved.content)
        reloaded = self.client.get(f"{files_url}{entry['id']}/")
        self.assertEqual(reloaded.json()["path"], "Campaigns/Retention/Welcome email")

    @patch("products.workflows.backend.models.hog_flow.hog_flow.reload_hog_flows_on_workers")
    def test_new_workflow_is_created_in_the_requested_project_folder(self, _reload: MagicMock) -> None:
        created = self.client.post(
            f"/api/projects/{self.team.id}/hog_flows/",
            {
                "name": "Renewal",
                "_create_in_folder": "Campaigns/Retention",
                "actions": [{"id": "trigger", "name": "Trigger", "type": "trigger", "config": {"type": "manual"}}],
                "edges": [],
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.content)
        files = self.client.get(
            f"/api/projects/{self.team.id}/file_system/", {"type": "hog_flow", "ref": created.json()["id"]}
        ).json()["results"]
        self.assertEqual([file["path"] for file in files], ["Campaigns/Retention/Renewal"])

    @patch("products.workflows.backend.models.hog_flow.hog_flow.reload_hog_flows_on_workers")
    def test_workflow_move_survives_reload_and_rename(self, _reload: MagicMock) -> None:
        created = self.client.post(
            f"/api/projects/{self.team.id}/hog_flows/",
            {
                "name": "Welcome",
                "actions": [
                    {"id": "trigger", "name": "Trigger", "type": "trigger", "config": {"type": "manual"}},
                    {"id": "exit", "name": "Exit", "type": "exit", "config": {}},
                ],
                "edges": [{"from": "trigger", "to": "exit", "type": "continue"}],
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.content)
        workflow_id = created.json()["id"]
        files_url = f"/api/projects/{self.team.id}/file_system/"
        files = self.client.get(files_url, {"type": "hog_flow"}).json()["results"]
        entry = next(item for item in files if item["ref"] == workflow_id)
        moved = self.client.post(f"{files_url}{entry['id']}/move/", {"new_path": "Campaigns/Welcome"}, format="json")
        self.assertEqual(moved.status_code, 200, moved.content)
        renamed = self.client.patch(
            f"/api/projects/{self.team.id}/hog_flows/{workflow_id}/", {"name": "Welcome back"}, format="json"
        )
        self.assertEqual(renamed.status_code, 200, renamed.content)
        reloaded = self.client.get(f"{files_url}{entry['id']}/")
        self.assertEqual(reloaded.json()["path"], "Campaigns/Welcome back")
        self.assertEqual(reloaded.json()["ref"], workflow_id)
