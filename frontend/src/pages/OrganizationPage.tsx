import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { organizationApi, projectApi } from "../lib/api";
import { formatDate, formatDateTime } from "../lib/utils";
import { useAsyncData } from "../lib/useAsyncData";
import { Icon } from "../components/Icon";
import {
  Avatar,
  Button,
  EmptyState,
  ErrorBanner,
  FormError,
  LoadingBlock,
  Modal,
  PageHeader,
  RoleBadge
} from "../components/ui";
import type { OrganizationRole } from "../types";

export function OrganizationPage() {
  const { orgId = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { notify } = useToast();
  const [projectModal, setProjectModal] = useState(false);
  const [memberModal, setMemberModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectDeadline, setProjectDeadline] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [orgName, setOrgName] = useState("");
  const [orgDescription, setOrgDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { data, loading, error, reload } = useAsyncData(
    async () => {
      const [organization, members, projects] = await Promise.all([
        organizationApi.get(orgId),
        organizationApi.members(orgId),
        projectApi.list(orgId)
      ]);
      return { organization, members, projects };
    },
    [orgId]
  );

  if (loading && !data) return <LoadingBlock label="Loading organization" />;
  if (error) return <ErrorBanner message={error} onRetry={reload} />;
  if (!data) return null;

  const { organization, members, projects } = data;
  const canManage = organization.role === "OWNER" || organization.role === "ADMIN";

  const openEdit = () => {
    setOrgName(organization.name);
    setOrgDescription(organization.description ?? "");
    setFormError(null);
    setEditModal(true);
  };

  const openProject = () => {
    setFormError(null);
    setProjectModal(true);
  };

  const createProject = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const project = await projectApi.create({
        organizationId: orgId,
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

  const addMember = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await organizationApi.addMember(orgId, { email: memberEmail.trim(), role: memberRole });
      notify("Member added", "success");
      setMemberModal(false);
      setMemberEmail("");
      setMemberRole("MEMBER");
      reload();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not add member");
    } finally {
      setSaving(false);
    }
  };

  const updateOrganization = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await organizationApi.update(orgId, {
        name: orgName.trim(),
        description: orgDescription.trim() || null
      });
      notify("Organization updated", "success");
      setEditModal(false);
      reload();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not update organization");
    } finally {
      setSaving(false);
    }
  };

  const changeRole = async (userId: string, role: "ADMIN" | "MEMBER") => {
    try {
      await organizationApi.updateMember(orgId, userId, role);
      notify("Member role updated", "success");
      reload();
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Could not update role", "error");
    }
  };

  const removeMember = async (userId: string, name: string) => {
    if (!window.confirm(`Remove ${name} from ${organization.name}?`)) return;
    try {
      await organizationApi.removeMember(orgId, userId);
      notify("Member removed", "success");
      if (userId === user?.id) {
        navigate("/");
      } else {
        reload();
      }
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Could not remove member", "error");
    }
  };

  return (
    <div>
      <nav className="mb-4 flex items-center gap-2 text-sm text-slate-500">
        <Link to="/" className="hover:text-brand-600">
          Dashboard
        </Link>
        <span>/</span>
        <span className="truncate font-medium text-slate-700">{organization.name}</span>
      </nav>

      <PageHeader
        title={organization.name}
        description={organization.description || "No organization description yet."}
        actions={
          <>
            {canManage && (
              <Button variant="secondary" onClick={openEdit}>
                <Icon name="edit" className="h-4 w-4" />
                Edit
              </Button>
            )}
            {canManage && (
              <Button variant="secondary" onClick={() => setMemberModal(true)}>
                <Icon name="users" className="h-4 w-4" />
                Add member
              </Button>
            )}
            <Button onClick={openProject}>
              <Icon name="plus" className="h-4 w-4" />
              New project
            </Button>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
        <RoleBadge role={organization.role} />
        <span>{members.length} member{members.length === 1 ? "" : "s"}</span>
        <span className="text-slate-300">|</span>
        <span>{projects.length} project{projects.length === 1 ? "" : "s"}</span>
        <span className="text-slate-300">|</span>
        <span>Created {formatDate(organization.createdAt)}</span>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Projects</h2>
          <button type="button" onClick={openProject} className="text-sm font-semibold text-brand-600">
            New project
          </button>
        </div>
        {projects.length === 0 ? (
          <EmptyState
            title="No projects in this organization"
            description="Create a project to start planning work with a board and task tracking."
            action={<Button onClick={openProject}>New project</Button>}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <Link
                key={project.id}
                to={`/projects/${project.id}/board`}
                className="card group p-5 transition hover:-translate-y-0.5 hover:shadow-card"
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <Icon name="board" className="h-5 w-5" />
                  </div>
                  <Icon name="arrow" className="h-5 w-5 text-slate-300 group-hover:text-brand-500" />
                </div>
                <h3 className="mt-4 font-semibold text-slate-900 group-hover:text-brand-700">
                  {project.name}
                </h3>
                <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm text-slate-500">
                  {project.description || "No description yet."}
                </p>
                <div className="mt-4 flex items-center gap-1.5 text-xs text-slate-500">
                  <Icon name="calendar" className="h-4 w-4" />
                  {project.deadline ? `Due ${formatDate(project.deadline)}` : "No deadline"}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Members</h2>
          {canManage && (
            <button
              type="button"
              onClick={() => setMemberModal(true)}
              className="text-sm font-semibold text-brand-600"
            >
              Add member
            </button>
          )}
        </div>
        <div className="card overflow-hidden">
          <div className="divide-y divide-slate-100">
            {members.map((member) => (
              <div key={member.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
                <Avatar name={member.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{member.name}</p>
                  <p className="truncate text-xs text-slate-500">{member.email}</p>
                </div>
                <span className="hidden text-xs text-slate-400 sm:block">
                  Joined {formatDate(member.createdAt)}
                </span>
                {canManage && member.role !== "OWNER" ? (
                  <select
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700"
                    value={member.role}
                    onChange={(event) => changeRole(member.userId, event.target.value as "ADMIN" | "MEMBER")}
                    aria-label={`Role for ${member.name}`}
                  >
                    <option value="MEMBER">Member</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                ) : (
                  <RoleBadge role={member.role as OrganizationRole} />
                )}
                {canManage && member.role !== "OWNER" && (
                  <button
                    type="button"
                    onClick={() => removeMember(member.userId, member.name)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    title="Remove member"
                    aria-label={`Remove ${member.name}`}
                  >
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <Modal open={projectModal} onClose={() => setProjectModal(false)} title="New project">
        <form onSubmit={createProject} className="space-y-4">
          <FormError message={formError} />
          <div>
            <label className="label" htmlFor="org-project-name">
              Project name
            </label>
            <input
              id="org-project-name"
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
            <label className="label" htmlFor="org-project-description">
              Description
            </label>
            <textarea
              id="org-project-description"
              className="input min-h-24 resize-y"
              maxLength={2000}
              value={projectDescription}
              onChange={(event) => setProjectDescription(event.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="org-project-deadline">
              Deadline
            </label>
            <input
              id="org-project-deadline"
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

      <Modal
        open={memberModal}
        onClose={() => setMemberModal(false)}
        title="Add member"
        subtitle="The person must already have a TeamFlow account."
      >
        <form onSubmit={addMember} className="space-y-4">
          <FormError message={formError} />
          <div>
            <label className="label" htmlFor="member-email">
              Email
            </label>
            <input
              id="member-email"
              type="email"
              className="input"
              required
              value={memberEmail}
              onChange={(event) => setMemberEmail(event.target.value)}
              placeholder="teammate@company.com"
            />
          </div>
          <div>
            <label className="label" htmlFor="member-role">
              Role
            </label>
            <select
              id="member-role"
              className="input"
              value={memberRole}
              onChange={(event) => setMemberRole(event.target.value as "ADMIN" | "MEMBER")}
            >
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setMemberModal(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Add member
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={editModal} onClose={() => setEditModal(false)} title="Edit organization">
        <form onSubmit={updateOrganization} className="space-y-4">
          <FormError message={formError} />
          <div>
            <label className="label" htmlFor="edit-org-name">
              Name
            </label>
            <input
              id="edit-org-name"
              className="input"
              required
              minLength={2}
              maxLength={100}
              value={orgName}
              onChange={(event) => setOrgName(event.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="edit-org-description">
              Description
            </label>
            <textarea
              id="edit-org-description"
              className="input min-h-24 resize-y"
              maxLength={500}
              value={orgDescription}
              onChange={(event) => setOrgDescription(event.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEditModal(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save changes
            </Button>
          </div>
        </form>
      </Modal>

      <p className="mt-8 text-xs text-slate-400">Last updated {formatDateTime(organization.updatedAt)}</p>
    </div>
  );
}
