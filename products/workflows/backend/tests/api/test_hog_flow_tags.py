from posthog.test.base import APIBaseTest

from products.workflows.backend.models.hog_flow.hog_flow import HogFlow


class TestHogFlowTags(APIBaseTest):
    def test_tag_edit_survives_reload_and_appears_in_list_summary(self) -> None:
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
        summary = self.client.get(f"/api/projects/{self.team.id}/hog_flows/summaries/")
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
