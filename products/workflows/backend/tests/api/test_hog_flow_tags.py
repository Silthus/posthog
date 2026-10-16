from posthog.test.base import APIBaseTest

from posthog.models import Tag, Team
from posthog.models.organization import OrganizationMembership

from products.messaging.backend.models.message_template import MessageTemplate
from products.workflows.backend.models.hog_flow.hog_flow import HogFlow


class TestHogFlowTags(APIBaseTest):
    def test_rename_is_scoped_to_this_team(self) -> None:
        self.organization_membership.level = OrganizationMembership.Level.ADMIN
        self.organization_membership.save()
        other_team = Team.objects.create(organization=self.organization, name="Other project")
        template = MessageTemplate.objects.create(team=self.team, name="Receipt email", type="email")
        other = MessageTemplate.objects.create(team=other_team, name="Other email", type="email")
        url = f"/api/projects/{self.team.id}/messaging_templates/{template.id}/"
        other_url = f"/api/projects/{other_team.id}/messaging_templates/{other.id}/"
        self.client.patch(url, {"tags": ["billing"]})
        self.client.patch(other_url, {"tags": ["billing"]})
        renamed = self.client.post(
            f"/api/projects/{self.team.id}/tags/rename/", {"name": "billing", "new_name": "receipts"}, format="json"
        )
        assert renamed.status_code == 200, renamed.json()
        assert self.client.get(url).json()["tags"] == ["receipts"]
        assert self.client.get(other_url).json()["tags"] == ["billing"]

    def test_project_member_cannot_rename_a_shared_tag(self) -> None:
        Tag.objects.create(team=self.team, name="billing")
        response = self.client.post(
            f"/api/projects/{self.team.id}/tags/rename/", {"name": "billing", "new_name": "receipts"}, format="json"
        )
        assert response.status_code == 403, response.json()
        assert self.client.get(f"/api/projects/{self.team.id}/tags/").json() == ["billing"]

    def test_rename_merges_tags_on_workflows_and_email_templates(self) -> None:
        self.organization_membership.level = OrganizationMembership.Level.ADMIN
        self.organization_membership.save()
        flow = HogFlow.objects.create(
            team=self.team,
            name="Receipt workflow",
            actions=[{"id": "trigger", "name": "Trigger", "type": "trigger", "config": {"type": "event"}}],
        )
        template = MessageTemplate.objects.create(team=self.team, name="Receipt email", type="email")
        workflow_url = f"/api/projects/{self.team.id}/hog_flows/{flow.id}/"
        template_url = f"/api/projects/{self.team.id}/messaging_templates/{template.id}/"
        loaded = self.client.patch(workflow_url, {"tags": ["billing", "eu"]}).json()
        self.client.patch(template_url, {"tags": ["billing"]})

        renamed = self.client.post(
            f"/api/projects/{self.team.id}/tags/rename/",
            {"name": "billing", "new_name": " EU "},
            format="json",
        )

        assert renamed.status_code == 200, renamed.json()
        assert self.client.get(workflow_url).json()["tags"] == ["eu"]
        assert self.client.get(template_url).json()["tags"] == ["eu"]
        assert "billing" not in self.client.get(f"/api/projects/{self.team.id}/tags/").json()
        stale = self.client.patch(
            workflow_url, {"tags": loaded["tags"], "base_updated_at": loaded["updated_at"]}, format="json"
        )
        assert stale.status_code == 409, stale.json()

    def test_tag_edit_survives_reload_and_appears_in_list(self) -> None:
        flow = HogFlow.objects.create(
            team=self.team,
            name="Welcome workflow",
            actions=[{"id": "trigger", "name": "Trigger", "type": "trigger", "config": {"type": "event"}}],
        )
        url = f"/api/projects/{self.team.id}/hog_flows/{flow.id}/"

        updated = self.client.patch(url, {"tags": ["onboarding"]})

        assert updated.status_code == 200, updated.json()
        assert updated.json()["tags"] == ["onboarding"]
        assert self.client.get(url).json()["tags"] == ["onboarding"]
        summary = self.client.get(f"/api/projects/{self.team.id}/hog_flows/")
        assert summary.status_code == 200, summary.json()
        assert summary.json()["results"][0]["tags"] == ["onboarding"]

    def test_bulk_tagging_adds_tags_without_replacing_existing_tags(self) -> None:
        flow = HogFlow.objects.create(
            team=self.team,
            name="Welcome workflow",
            actions=[{"id": "trigger", "name": "Trigger", "type": "trigger", "config": {"type": "event"}}],
        )
        url = f"/api/projects/{self.team.id}/hog_flows/{flow.id}/"
        self.client.patch(url, {"tags": ["welcome"]})

        response = self.client.post(
            f"/api/projects/{self.team.id}/hog_flows/bulk_update_tags/",
            {"ids": [str(flow.id)], "action": "add", "tags": ["onboarding"]},
            format="json",
        )

        assert response.status_code == 200, response.json()
        assert response.json()["skipped"] == []
        assert sorted(self.client.get(url).json()["tags"]) == ["onboarding", "welcome"]

    def test_bulk_tags_reject_a_stale_editor_save(self) -> None:
        flow = HogFlow.objects.create(
            team=self.team,
            name="Welcome workflow",
            actions=[{"id": "trigger", "name": "Trigger", "type": "trigger", "config": {"type": "event"}}],
        )
        url = f"/api/projects/{self.team.id}/hog_flows/{flow.id}/"
        loaded = self.client.get(url).json()
        bulk = self.client.post(
            f"/api/projects/{self.team.id}/hog_flows/bulk_update_tags/",
            {"ids": [str(flow.id)], "action": "add", "tags": ["onboarding"]},
            format="json",
        )
        assert bulk.status_code == 200, bulk.json()
        stale = self.client.patch(url, {"tags": loaded["tags"], "base_updated_at": loaded["updated_at"]}, format="json")
        assert stale.status_code == 409, stale.json()
        assert self.client.get(url).json()["tags"] == ["onboarding"]

    def test_repeated_bulk_tag_does_not_invalidate_an_editor_save(self) -> None:
        flow = HogFlow.objects.create(
            team=self.team,
            name="Welcome workflow",
            actions=[{"id": "trigger", "name": "Trigger", "type": "trigger", "config": {"type": "event"}}],
        )
        url = f"/api/projects/{self.team.id}/hog_flows/{flow.id}/"
        loaded = self.client.patch(url, {"tags": ["onboarding"]}).json()
        response = self.client.post(
            f"/api/projects/{self.team.id}/hog_flows/bulk_update_tags/",
            {"ids": [str(flow.id)], "action": "add", "tags": ["onboarding"]},
            format="json",
        )
        assert response.status_code == 200, response.json()
        assert self.client.get(url).json()["updated_at"] == loaded["updated_at"]
