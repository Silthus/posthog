from typing import cast

from django.db import transaction

from rest_framework.generics import get_object_or_404

from products.workflows.backend.facade.contracts import (
    WorkflowViewConflict,
    WorkflowViewPage,
    WorkflowViewRecord,
    WorkflowViewState,
)
from products.workflows.backend.models.workflow_view import WorkflowView


class WorkflowViewStore:
    def __init__(self, team_id: int) -> None:
        self.team_id = team_id

    @staticmethod
    def _record(view: WorkflowView) -> WorkflowViewRecord:
        return WorkflowViewRecord(
            id=view.id,
            name=view.name,
            state=cast(WorkflowViewState, view.state),
            version=view.version,
            default_key=view.default_key,
            deleted=view.deleted,
            created_at=view.created_at,
            updated_at=view.updated_at,
        )

    def list(self, *, limit: int, offset: int) -> WorkflowViewPage:
        views = WorkflowView.objects.for_team(self.team_id).filter(deleted=False).order_by("created_at", "id")
        return WorkflowViewPage(
            count=views.count(), results=[self._record(view) for view in views[offset : offset + limit]]
        )

    def get(self, view_id: str) -> WorkflowViewRecord:
        view = get_object_or_404(WorkflowView.objects.for_team(self.team_id).filter(deleted=False), pk=view_id)
        return self._record(view)

    def create(self, *, name: str, state: WorkflowViewState) -> WorkflowViewRecord:
        view = WorkflowView.objects.for_team(self.team_id).create(team_id=self.team_id, name=name, state=state)
        return self._record(view)

    @staticmethod
    def _default_state() -> WorkflowViewState:
        return {
            "filters": [{"facet": "created-by", "value": "me", "negated": False}],
            "text": "",
            "columns": ["owner"],
        }

    def initialize(self) -> WorkflowViewRecord:
        view, _ = WorkflowView.objects.for_team(self.team_id).get_or_create(
            default_key="my-workflows",
            defaults={"team_id": self.team_id, "name": "My workflows", "state": self._default_state()},
        )
        return self._record(view)

    def restore_default(self) -> WorkflowViewRecord:
        self.initialize()
        with transaction.atomic():
            view = WorkflowView.objects.for_team(self.team_id).select_for_update().get(default_key="my-workflows")
            if view.deleted:
                view.name = "My workflows"
                view.state = self._default_state()
                view.deleted = False
                view.version += 1
                view.save(update_fields=["name", "state", "deleted", "version", "updated_at"])
        return self._record(view)

    def _lock(self, view_id: str, version: int) -> WorkflowView:
        current = cast(
            WorkflowView,
            get_object_or_404(
                WorkflowView.objects.for_team(self.team_id).filter(deleted=False).select_for_update(), pk=view_id
            ),
        )
        if current.version != version:
            raise WorkflowViewConflict()
        return current

    def update(
        self, view_id: str, version: int, *, name: str | None, state: WorkflowViewState | None
    ) -> WorkflowViewRecord:
        with transaction.atomic():
            current = self._lock(view_id, version)
            if name is not None:
                current.name = name
            if state is not None:
                current.state = state
            current.version += 1
            current.save(update_fields=["name", "state", "version", "updated_at"])
        return self._record(current)

    def delete(self, view_id: str, version: int) -> None:
        with transaction.atomic():
            current = self._lock(view_id, version)
            if current.default_key is not None:
                current.deleted = True
                current.version += 1
                current.save(update_fields=["deleted", "version", "updated_at"])
            else:
                current.delete()
