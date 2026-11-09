import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { userApi } from "../lib/api";
import { formatDate } from "../lib/utils";
import { useAsyncData } from "../lib/useAsyncData";
import { Icon } from "../components/Icon";
import { Avatar, Button, ErrorBanner, FormError, LoadingBlock } from "../components/ui";

export function ProfilePage() {
  const { user } = useAuth();
  const { notify } = useToast();
  const { data, loading, error, reload } = useAsyncData(() => userApi.me(), []);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setName(data.name);
      setTitle(data.title ?? "");
      setBio(data.bio ?? "");
    }
  }, [data]);

  if (loading && !data) return <LoadingBlock label="Loading profile" />;
  if (error) return <ErrorBanner message={error} onRetry={reload} />;
  if (!data) return null;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await userApi.updateMe({
        name: name.trim(),
        title: title.trim() || null,
        bio: bio.trim() || null
      });
      notify("Profile updated", "success");
      reload();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not update profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Profile</h1>
        <p className="mt-1 text-sm text-slate-500">Manage how you appear to your teammates.</p>
      </div>

      <div className="card mb-5 flex flex-wrap items-center gap-4 p-5 sm:p-6">
        <Avatar name={data.name} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold text-slate-900">{data.name}</p>
          <p className="text-sm text-slate-500">{data.title || "No title set"}</p>
          <p className="text-xs text-slate-400">{data.email}</p>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Member since {formatDate(data.createdAt)}
        </div>
      </div>

      <section className="card p-5 sm:p-6">
        <h2 className="text-base font-semibold text-slate-900">Personal information</h2>
        <form onSubmit={save} className="mt-5 space-y-4">
          <FormError message={formError} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="profile-name">
                Full name
              </label>
              <input
                id="profile-name"
                className="input"
                required
                minLength={2}
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="profile-title">
                Job title
              </label>
              <input
                id="profile-title"
                className="input"
                maxLength={100}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Product designer"
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="profile-email">
              Email
            </label>
            <input id="profile-email" className="input bg-slate-50 text-slate-500" value={data.email} disabled />
            <p className="mt-1 text-xs text-slate-400">
              Email is managed by the authentication service and cannot be changed here.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="profile-bio">
              Bio
            </label>
            <textarea
              id="profile-bio"
              className="input min-h-28 resize-y"
              maxLength={500}
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              placeholder="A short introduction for your teammates"
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" loading={saving}>
              <Icon name="check" className="h-4 w-4" />
              Save profile
            </Button>
          </div>
        </form>
      </section>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
        Signed in as <span className="font-semibold text-slate-700">{user?.email}</span>. Your session uses a
        short-lived JWT bearer token stored in this browser.
      </div>
    </div>
  );
}
