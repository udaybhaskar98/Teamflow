import { useOutletContext } from "react-router-dom";
import { activityApi } from "../lib/api";
import { timeAgo, humanize } from "../lib/utils";
import { useAsyncData } from "../lib/useAsyncData";
import type { ProjectContextValue } from "./ProjectLayout";
import { Icon, type IconName } from "../components/Icon";
import { Button, EmptyState, ErrorBanner, LoadingBlock } from "../components/ui";

function iconFor(type: string): IconName {
  if (type.startsWith("comment")) return "comment";
  if (type.startsWith("project")) return "building";
  if (type.startsWith("org")) return "users";
  if (type.startsWith("task")) return "board";
  return "activity";
}

export function ActivityPage() {
  const { project } = useOutletContext<ProjectContextValue>();
  const { data, loading, error, reload } = useAsyncData(
    () => activityApi.list(project.id, 100),
    [project.id]
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Project activity</h2>
          <p className="text-sm text-slate-500">A chronological record of changes from across the stack.</p>
        </div>
        <Button variant="secondary" onClick={reload} loading={loading}>
          <Icon name="arrow" className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {error && <ErrorBanner message={error} onRetry={reload} />}
      {loading && !data && <LoadingBlock label="Loading activity" />}
      {data && data.length === 0 && (
        <EmptyState
          icon="activity"
          title="No activity yet"
          description="Create tasks, move work on the board, and leave comments. Activity will show up here."
        />
      )}
      {data && data.length > 0 && (
        <div className="card p-5 sm:p-6">
          <ol className="relative space-y-5 border-l border-slate-200 pl-6">
            {data.map((entry) => (
              <li key={entry.id} className="relative">
                <span className="absolute -left-[34px] flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500">
                  <Icon name={iconFor(entry.type)} className="h-3.5 w-3.5" />
                </span>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold text-slate-800">{entry.actorName}</span>
                  <span className="text-sm text-slate-600">{entry.message}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span>{timeAgo(entry.createdAt)}</span>
                  <span>·</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                    {humanize(entry.type.replace(".", " "))}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
