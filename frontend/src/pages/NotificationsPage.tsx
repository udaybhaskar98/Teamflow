import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../context/ToastContext";
import { notificationApi } from "../lib/api";
import { timeAgo } from "../lib/utils";
import { useAsyncData } from "../lib/useAsyncData";
import type { Notification } from "../types";
import { Icon, type IconName } from "../components/Icon";
import { Button, EmptyState, ErrorBanner, LoadingBlock } from "../components/ui";

function iconFor(notification: Notification): IconName {
  if (notification.entityType === "ORGANIZATION") return "building";
  if (notification.type === "TASK_COMMENT") return "comment";
  if (notification.type === "TASK_STATUS_CHANGED") return "activity";
  return "check";
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [marking, setMarking] = useState(false);
  const { data, loading, error, reload } = useAsyncData(
    () => notificationApi.list(unreadOnly),
    [unreadOnly]
  );

  const targetFor = (notification: Notification): string | null => {
    if (notification.entityType === "ORGANIZATION") {
      return `/organizations/${notification.entityId}`;
    }
    if (notification.entityType === "TASK" && notification.projectId) {
      return `/projects/${notification.projectId}/board?task=${notification.entityId}`;
    }
    return null;
  };

  const openNotification = async (notification: Notification) => {
    const target = targetFor(notification);
    if (!notification.readAt) {
      await notificationApi.markRead(notification.id).catch(() => undefined);
    }
    if (target) navigate(target);
    else reload();
  };

  const markRead = async (notification: Notification) => {
    try {
      await notificationApi.markRead(notification.id);
      reload();
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Could not mark as read", "error");
    }
  };

  const markAll = async () => {
    setMarking(true);
    try {
      const result = await notificationApi.markAllRead();
      notify(`${result.updated} notification${result.updated === 1 ? "" : "s"} marked read`, "success");
      reload();
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Could not mark notifications", "error");
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Notifications</h1>
          <p className="mt-1 text-sm text-slate-500">Assignments, comments, and status changes that involve you.</p>
        </div>
        <Button variant="secondary" onClick={markAll} loading={marking}>
          <Icon name="check" className="h-4 w-4" />
          Mark all read
        </Button>
      </div>

      <div className="mb-4 flex rounded-lg border border-slate-200 bg-white p-0.5 w-fit">
        <button
          type="button"
          onClick={() => setUnreadOnly(false)}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
            !unreadOnly ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          All
        </button>
        <button
          type="button"
          onClick={() => setUnreadOnly(true)}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
            unreadOnly ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Unread
        </button>
      </div>

      {error && <ErrorBanner message={error} onRetry={reload} />}
      {loading && !data && <LoadingBlock label="Loading notifications" />}
      {data && data.length === 0 && (
        <EmptyState
          icon="bell"
          title={unreadOnly ? "You're all caught up" : "No notifications yet"}
          description={
            unreadOnly
              ? "There are no unread notifications."
              : "When you are assigned a task or someone comments on your work, it will show up here."
          }
        />
      )}
      {data && data.length > 0 && (
        <div className="card divide-y divide-slate-100 overflow-hidden">
          {data.map((notification) => (
            <div
              key={notification.id}
              className={`flex items-start gap-3 px-4 py-4 transition sm:px-5 ${
                notification.readAt ? "bg-white" : "bg-brand-50/40"
              }`}
            >
              <div
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  notification.readAt ? "bg-slate-100 text-slate-500" : "bg-brand-100 text-brand-700"
                }`}
              >
                <Icon name={iconFor(notification)} className="h-4 w-4" />
              </div>
              <button
                type="button"
                onClick={() => openNotification(notification)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-800">{notification.title}</p>
                  {!notification.readAt && <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />}
                </div>
                <p className="mt-0.5 text-sm text-slate-600">{notification.message}</p>
                <p className="mt-1 text-xs text-slate-400">{timeAgo(notification.createdAt)}</p>
              </button>
              {!notification.readAt && (
                <button
                  type="button"
                  onClick={() => markRead(notification)}
                  className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-brand-600"
                  title="Mark as read"
                  aria-label="Mark as read"
                >
                  <Icon name="check" className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
