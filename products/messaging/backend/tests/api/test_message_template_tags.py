from posthog.test.base import APIBaseTest

from posthog.models.team import Team

from products.messaging.backend.models.message_template import MessageTemplate


class TestMessageTemplateTags(APIBaseTest):
    def test_email_template_tags_survive_reload_and_library_listing(self) -> None:
        template = MessageTemplate.objects.create(team=self.team, name="Welcome email", type="email")
        url = f"/api/projects/{self.team.id}/messaging_templates/{template.id}/"

        updated = self.client.patch(url, {"tags": ["onboarding"]})

        assert updated.status_code == 200, updated.json()
        assert updated.json()["tags"] == ["onboarding"]
        assert self.client.get(url).json()["tags"] == ["onboarding"]
        listed = self.client.get(f"/api/projects/{self.team.id}/messaging_templates/")
        assert listed.json()["results"][0]["tags"] == ["onboarding"]

    def test_bulk_tagging_updates_only_templates_in_this_project(self) -> None:
        template = MessageTemplate.objects.create(team=self.team, name="Welcome email", type="email")
        other_team = Team.objects.create(organization=self.organization, name="Other project")
        other_template = MessageTemplate.objects.create(team=other_team, name="Other email", type="email")
        response = self.client.post(
            f"/api/projects/{self.team.id}/messaging_templates/bulk_update_tags/",
            {"ids": [str(template.id), str(other_template.id)], "action": "add", "tags": ["onboarding"]},
            format="json",
        )

        assert response.status_code == 200, response.json()
        assert response.json()["updated"] == [{"id": str(template.id), "tags": ["onboarding"]}]
        assert [row["id"] for row in response.json()["skipped"]] == [str(other_template.id)]
        assert (
            self.client.get(f"/api/projects/{other_team.id}/messaging_templates/{other_template.id}/").json()["tags"]
            == []
        )
        assert self.client.get(f"/api/projects/{self.team.id}/messaging_templates/{template.id}/").json()["tags"] == [
            "onboarding"
        ]
