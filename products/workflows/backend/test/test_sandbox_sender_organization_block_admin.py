from posthog.test.base import BaseTest

from django.contrib.admin import AdminSite
from django.test import RequestFactory

from products.workflows.backend.admin.sandbox_sender_organization_block_admin import SandboxSenderOrganizationBlockAdmin
from products.workflows.backend.models import SandboxSenderOrganizationBlock


class TestSandboxSenderOrganizationBlockAdmin(BaseTest):
    def test_a_block_added_in_admin_records_the_staff_user(self) -> None:
        admin = SandboxSenderOrganizationBlockAdmin(SandboxSenderOrganizationBlock, AdminSite())
        request = RequestFactory().post("/admin/workflows/sandboxsenderorganizationblock/add/")
        request.user = self.user
        block = SandboxSenderOrganizationBlock(organization=self.organization, reason="Abuse report")

        admin.save_model(request, block, form=None, change=False)

        assert SandboxSenderOrganizationBlock.objects.get(organization=self.organization).created_by == self.user
