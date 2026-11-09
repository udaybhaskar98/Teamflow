import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { projectApi } from "../lib/api";
import type { ProjectContextValue } from "./ProjectLayout";
import { Icon } from "../components/Icon";
import { Button, FormError } from "../components/ui";

export function ProjectSettingsPage() {
  const { project, organization, refreshProject } = useOutletContext<ProjectContextValue>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [deadline, setDeadline] = useState(project.deadline ? project.deadline.slice(0, 10) : "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    setName(project.name);
    setDescription(project.description ?? "");
    setDeadline(project.deadline ? project.deadline.slice(0, 10) : "");
  }, [project.id, project.name, project.description, project.deadline]);

  const canManage = project.role === "OWNER" || project.role === "ADMIN" || project.ownerId === user?.id;

  if (!canManage) {
    return (
      <div className="card p-8 text-center">
        <Icon name="settings" className="mx-auto h-8 w-8 text-slate-300" />
        <h2 className="mt-3 font-semibold text-slate-800">Settings are restricted</h2>
        <p className="mt-1 text-sm text-slate-500">
          Only the project owner and organization admins can change project settings.
        </p>
      </div>
    );
  }

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await projectApi.update(project.id, {
        name: name.trim(),
        description: description.trim() || null,
        deadline: deadline ? new Date(`${deadline}T12:00:00`).toISOString() : null
      });
      refreshProject();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update project");
    } finally {
      setSaving(false);
    }
  };

  const removeProject = async () => {
    if (confirmName.trim() !== project.name) {
      setError("Type the project name exactly to confirm deletion");
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await projectApi.remove(project.id);
      navigate(`/organizations/${organization.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete project");
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <section className="card p-5 sm:p-6">
        <h2 className="text-base font-semibold text-slate-900">General</h2>
        <p className="text-sm text-slate-500">Update how this project appears across TeamFlow.</p>
        <form onSubmit={save} className="mt-5 space-y-4">
          <FormError message={error} />
          <div>
            <label className="label" htmlFor="settings-name">
              Project name
            </label>
            <input
              id="settings-name"
              className="input"
              required
              minLength={2}
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="settings-description">
              Description
            </label>
            <textarea
              id="settings-description"
              className="input min-h-28 resize-y"
              maxLength={2000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="settings-deadline">
              Deadline
            </label>
            <input
              id="settings-deadline"
              type="date"
              className="input max-w-xs"
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" loading={saving}>
              <Icon name="check" className="h-4 w-4" />
              Save changes
            </Button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-red-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold text-red-700">Danger zone</h2>
        <p className="mt-1 text-sm text-slate-500">
          Deleting this project permanently removes its board, comments, attachments, and activity.
        </p>
        {!deleteOpen ? (
          <Button variant="danger" className="mt-4" onClick={() => setDeleteOpen(true)}>
            <Icon name="trash" className="h-4 w-4" />
            Delete project
          </Button>
        ) : (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800">
              Type <span className="font-bold">{project.name}</span> to confirm.
            </p>
            <input
              className="input mt-2 border-red-300 bg-white"
              value={confirmName}
              onChange={(event) => setConfirmName(event.target.value)}
              placeholder={project.name}
            />
            <div className="mt-3 flex gap-2">
              <Button variant="danger" loading={deleting} onClick={removeProject} disabled={confirmName !== project.name}>
                Permanently delete
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setDeleteOpen(false);
                  setConfirmName("");
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
