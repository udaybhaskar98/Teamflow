import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { organizationApi, projectApi } from "../lib/api";
import { formatDate, humanize, isOverdue } from "../lib/utils";
import { useAsyncData } from "../lib/useAsyncData";
import { Icon } from "../components/Icon";
import {
  Button,
  EmptyState,
  ErrorBanner,
  FormError,
  LoadingBlock,
  Modal,
  PageHeader,
  RoleBadge,
  StatCard
} from "../components/ui";

export function DashboardPage() {
  const { user } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [orgModal, setOrgModal] = useState(false);
  const [projectModal, setProjectModal] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [orgDescription, setOrgDescription] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectOrgId, setProjectOrgId] = useState("");
  const [projectDeadline, setProjectDeadline] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { data, loading, error, reload } = useAsyncData(
    async () => {
      const [organizations, projects] = await Promise.all([
        organizationApi.list(),
        projectApi.list()
      ]);
      return { organizations, projects };
    },
    []
  );

  const organizations = data?.organizations ?? [];
  const projects = data?.projects ?? [];
  const upcoming = projects
    .filter((project) => project.deadline && !isOverdue(project.deadline, "TODO"))
    .sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)))
    .slice(0, 3);

  const openProjectModal = () => {
    setProjectOrgId(organizations[0]?.id ?? "");
    setFormError(null);
    setProjectModal(true);
  };

  const createOrganization = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const organization = await organizationApi.create({
        name: orgName.trim(),
        description: orgDescription.trim() || null
      });
      notify("Organization created", "success");
      setOrgModal(false);
      setOrgName("");
      setOrgDescription("");
      reload();
      navigate(`/organizations/${organization.id}`);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not create organization");
    } finally {
      setSaving(false);
    }
  };

  const createProject = async (event: FormEvent) => {
    event.preventDefault();
    if (!projectOrgId) {
      setFormError("Create an organization first");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const project = await projectApi.create({
        organizationId: projectOrgId,
        name: projectName.trim(),
        description: projectDescription.trim() || null,
        deadline: projectDeadline ? new Date(`${projectDeadline}T12:00:00`).toISOString() : null
      });
      notify("Project created", "success");
      setProjectModal(false);
      setProjectName("");
      setProjectDescription("");
      setProjectDeadline("");
      navigate(`/projects/${project.id}/board`);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not create project");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={`Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, ${
          user?.name.split(" ")[0] || "there"
        }`}
        description="Here is what is happening across your workspaces."
        actions={
          <>
            <Button variant="secondary" onClick={() => setOrgModal(true)}>
              <Icon name="building" className="h-4 w-4" />
              New organization
            </Button>
            <Button onClick={openProjectModal} disabled={organizations.length === 0}>
              <Icon name="plus" className="h-4 w-4" />
              New project
            </Button>
          </>
        }
      />

      {error && <ErrorBanner message={error} onRetry={reload} />}
      {loading && !data && <LoadingBlock label="Loading workspace" />}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Organizations" value={organizations.length} detail="Teams you belong to" />
            <StatCard label="Projects" value={projects.length} detail="Across all organizations" />
            <StatCard
              label="Upcoming deadlines"
              value={upcoming.length}
              detail={upcoming[0] ? `Next: ${formatDate(upcoming[0].deadline)}` : "Nothing scheduled"}
              tone={upcoming.length > 0 ? "warn" : "default"}
            />
            <StatCard
              label="Access level"
              value={organizations[0] ? humanize(organizations[0].role) : "—"}
              detail={organizations[0]?.name || "No organization yet"}
            />
          </div>

          <div className="mt-8 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">Organizations</h2>
                <button
                  type="button"
                  className="text-sm font-semibold text-brand-600 hover:text-brand-700"
                  onClick={() => setOrgModal(true)}
                >
                  Add organization
                </button>
              </div>
              {organizations.length === 0 ? (
                <EmptyState
                  icon="building"
                  title="Create your first organization"
                  description="Organizations group your projects and teammates. Create one to get started."
                  action={
                    <Button onClick={() => setOrgModal(true)}>
                      <Icon name="plus" className="h-4 w-4" />
                      New organization
                    </Button>
                  }
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {organizations.map((organization) => (
                    <Link
                      key={organization.id}
                      to={`/organizations/${organization.id}`}
                      className="card group p-5 transition hover:-translate-y-0.5 hover:shadow-card"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 font-bold text-brand-700">
                          {organization.name.slice(0, 2).toUpperCase()}
                        </div>
                        <RoleBadge role={organization.role} />
                      </div>
                      <h3 className="mt-4 font-semibold text-slate-900 group-hover:text-brand-700">
                        {organization.name}
                      </h3>
                      <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm text-slate-500">
                        {organization.description || "No description yet."}
                      </p>
                      <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
                        <Icon name="users" className="h-4 w-4" />
                        {organization.memberCount ?? 1} member{(organization.memberCount ?? 1) === 1 ? "" : "s"}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">Recent projects</h2>
                <button
                  type="button"
                  className="text-sm font-semibold text-brand-600 hover:text-brand-700"
                  onClick={openProjectModal}
                  disabled={organizations.length === 0}
                >
                  New project
                </button>
              </div>
              {projects.length === 0 ? (
                <div className="card p-6 text-center">
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                    <Icon name="board" />
                  </div>
                  <p className="mt-3 font-semibold text-slate-800">No projects yet</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Projects hold boards, tasks, and activity.
                  </p>
                  <Button className="mt-4" onClick={openProjectModal} disabled={organizations.length === 0}>
                    New project
                  </Button>
                </div>
              ) : (
                <div className="card divide-y divide-slate-100 overflow-hidden">
                  {projects.slice(0, 6).map((project) => (
                    <Link
                      key={project.id}
                      to={`/projects/${project.id}/board`}
                      className="group flex items-center gap-3 px-4 py-3.5 transition hover:bg-slate-50"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 group-hover:bg-brand-50 group-hover:text-brand-600">
                        <Icon name="board" className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">{project.name}</p>
                        <p className="truncate text-xs text-slate-500">
                          {project.deadline ? `Due ${formatDate(project.deadline)}` : "No deadline"}
                        </p>
                      </div>
                      <Icon name="arrow" className="h-4 w-4 text-slate-300 group-hover:text-brand-500" />
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}

      <Modal
        open={orgModal}
        onClose={() => setOrgModal(false)}
        title="New organization"
        subtitle="Create a shared home for your team and projects."
      >
        <form className="space-y-4" onSubmit={createOrganization}>
          <FormError message={formError} />
          <div>
            <label className="label" htmlFor="org-name">
              Name
            </label>
            <input
              id="org-name"
              className="input"
              required
              minLength={2}
              maxLength={100}
              value={orgName}
              onChange={(event) => setOrgName(event.target.value)}
              placeholder="Acme Product Team"
            />
          </div>
          <div>
            <label className="label" htmlFor="org-description">
              Description
            </label>
            <textarea
              id="org-description"
              className="input min-h-24 resize-y"
              maxLength={500}
              value={orgDescription}
              onChange={(event) => setOrgDescription(event.target.value)}
              placeholder="What does this team work on?"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOrgModal(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Create organization
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={projectModal}
        onClose={() => setProjectModal(false)}
        title="New project"
        subtitle="Start with a Kanban board and task tracking."
      >
        <form className="space-y-4" onSubmit={createProject}>
          <FormError message={formError} />
          <div>
            <label className="label" htmlFor="project-org">
              Organization
            </label>
            <select
              id="project-org"
              className="input"
              value={projectOrgId}
              onChange={(event) => setProjectOrgId(event.target.value)}
              required
            >
              <option value="">Select an organization</option>
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="project-name">
              Project name
            </label>
            <input
              id="project-name"
              className="input"
              required
              minLength={2}
              maxLength={120}
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="Website launch"
            />
          </div>
          <div>
            <label className="label" htmlFor="project-description">
              Description
            </label>
            <textarea
              id="project-description"
              className="input min-h-24 resize-y"
              maxLength={2000}
              value={projectDescription}
              onChange={(event) => setProjectDescription(event.target.value)}
              placeholder="Goal, scope, and context"
            />
          </div>
          <div>
            <label className="label" htmlFor="project-deadline">
              Deadline
            </label>
            <input
              id="project-deadline"
              type="date"
              className="input"
              value={projectDeadline}
              onChange={(event) => setProjectDeadline(event.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setProjectModal(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Create project
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
