import { Link, NavLink, Outlet, useOutletContext, useParams } from "react-router-dom";
import { organizationApi, projectApi } from "../lib/api";
import { formatDate } from "../lib/utils";
import { useAsyncData } from "../lib/useAsyncData";
import { ErrorBanner, LoadingBlock, RoleBadge } from "../components/ui";
import { Icon } from "../components/Icon";
import type { Organization, Project } from "../types";

export interface ProjectContextValue {
  project: Project;
  organization: Organization;
  refreshProject: () => void;
}

export function useProjectContext() {
  return useOutletContext<ProjectContextValue>();
}

const tabs = [
  { to: "board", label: "Board", icon: "board" as const },
  { to: "activity", label: "Activity", icon: "activity" as const },
  { to: "settings", label: "Settings", icon: "settings" as const }
];

export function ProjectLayout() {
  const { projectId = "" } = useParams();
  const { data, loading, error, reload } = useAsyncData(
    async () => {
      const project = await projectApi.get(projectId);
      const organization = await organizationApi.get(project.organizationId);
      return { project, organization };
    },
    [projectId]
  );

  if (loading && !data) return <LoadingBlock label="Loading project" />;
  if (error) return <ErrorBanner message={error} onRetry={reload} />;
  if (!data) return null;

  const { project, organization } = data;
  const context: ProjectContextValue = {
    project,
    organization,
    refreshProject: reload
  };

  return (
    <div>
      <nav className="mb-4 flex items-center gap-2 text-sm text-slate-500">
        <Link to="/" className="hover:text-brand-600">
          Dashboard
        </Link>
        <span>/</span>
        <Link to={`/organizations/${organization.id}`} className="hover:text-brand-600">
          {organization.name}
        </Link>
        <span>/</span>
        <span className="truncate font-medium text-slate-700">{project.name}</span>
      </nav>

      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">{project.name}</h1>
                {project.role && <RoleBadge role={project.role} />}
              </div>
              <p className="mt-1 max-w-3xl text-sm text-slate-500">
                {project.description || "No project description yet."}
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <Icon name="calendar" className="h-4 w-4 text-slate-400" />
              {project.deadline ? `Due ${formatDate(project.deadline)}` : "No deadline"}
            </div>
          </div>
        </div>
        <div className="overflow-x-auto px-3 sm:px-5">
          <nav className="flex min-w-max gap-1 py-2">
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? "bg-brand-50 text-brand-700"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  }`
                }
              >
                <Icon name={tab.icon} className="h-4 w-4" />
                {tab.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>

      <div className="mt-6">
        <Outlet context={context} />
      </div>
    </div>
  );
}
