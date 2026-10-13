"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCheck,
  ChevronRight,
  ClipboardList,
  Clock3,
  History,
  LogOut,
  Mic,
  Plus,
  Settings,
  Square,
  Upload,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import ChromaGrid from "@/components/chroma-grid";
type View = "today" | "staff" | "history" | "settings";
type Status =
  "Pending" | "In progress" | "Completed" | "Not completed" | "Needs attention";
type Task = {
  id: number | string;
  name: string;
  initials: string;
  title: string;
  department: string;
  due: string;
  assignedAt: string;
  status: Status;
  delivery: string;
  instructions: string | null;
  hasRecording: boolean;
  hasVideo: boolean;
};
type Staff = {
  id: number | string;
  staffCode: string;
  name: string;
  initials: string;
  department: string;
  departmentId?: string;
  role: string;
  language: "English" | "Tamil";
  phone: string;
  address?: string | null;
  photoUrl?: string | null;
  active: boolean;
};
const defaultDepartments = ["All"];
const supportedWhatsAppRecordingTypes = [
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "audio/aac",
  "audio/webm;codecs=opus",
  "audio/webm",
];
const recordingExtension = (mimeType: string) => {
  if (mimeType.startsWith("audio/ogg")) return "ogg";
  if (mimeType === "audio/mp4") return "m4a";
  if (mimeType === "audio/webm") return "webm";
  return "aac";
};
function taskFromApi(task: {
  id: string;
  name: string;
  initials: string;
  title: string;
  department: string;
  dueAt: string;
  assignedAt: string;
  status: string;
  instructions: string | null;
  hasRecording: boolean;
  hasVideo: boolean;
  deliveryStatus: string;
  deliveryUpdatedAt: string | null;
  staffResponse: string | null;
}): Task {
  const status: Status =
    task.staffResponse === "whatsapp_not_yet"
      ? "Not completed"
      : task.status === "completed"
        ? "Completed"
        : ["accepted", "in_progress"].includes(task.status)
          ? "In progress"
          : ["declined", "cancelled"].includes(task.status)
            ? "Needs attention"
            : "Pending";
  const deliveryStatus = task.deliveryStatus.replace(/_/g, " ");
  const deliveryTime = task.deliveryUpdatedAt
    ? ` ${new Date(task.deliveryUpdatedAt).toLocaleTimeString("en-IN", {
        hour: "numeric",
        minute: "2-digit",
      })}`
    : "";
  return {
    id: task.id,
    name: task.name,
    initials: task.initials,
    title: task.title,
    department: task.department,
    due: new Date(task.dueAt).toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
    }),
    assignedAt: task.assignedAt,
    status,
    delivery: `${deliveryStatus[0]?.toUpperCase() || ""}${deliveryStatus.slice(1)}${deliveryTime}`,
    instructions: task.instructions,
    hasRecording: task.hasRecording,
    hasVideo: task.hasVideo,
  };
}
export default function Dashboard({
  csrf,
  expiresAt,
}: {
  csrf: string;
  expiresAt: number;
}) {
  const [view, setView] = useState<View>("today"),
    [tasks, setTasks] = useState<Task[]>([]),
    [staff, setStaff] = useState<Staff[]>([]),
    [departments, setDepartments] = useState(defaultDepartments),
    [filter, setFilter] = useState("All"),
    [assignOpen, setAssignOpen] = useState(false),
    [staffOpen, setStaffOpen] = useState(false),
    [selectedTask, setSelectedTask] = useState<Task | null>(null),
    [toast, setToast] = useState("");
  const todayTasks = useMemo(() => {
      const today = new Date().toLocaleDateString("en-CA");
      return tasks.filter(
        (task) =>
          new Date(task.assignedAt).toLocaleDateString("en-CA") === today,
      );
    }, [tasks]),
    visible = useMemo(
      () =>
        filter === "All"
          ? todayTasks
          : todayTasks.filter((task) => task.department === filter),
      [filter, todayTasks],
    );
  const counts = {
    pending: todayTasks.filter((t) => t.status === "Pending").length,
    progress: todayTasks.filter((t) => t.status === "In progress").length,
    done: todayTasks.filter((t) => t.status === "Completed").length,
    attention: todayTasks.filter(
      (t) => t.status === "Needs attention" || t.status === "Not completed",
    ).length,
  };
  useEffect(() => {
    void fetch("/api/auth/rotate", { method: "POST" });
    void fetch("/api/admin/staff")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data?.staff) {
          setStaff(data.staff);
        }
      })
      .catch(() => undefined);
    void fetch("/api/admin/departments", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data?.departments) {
          setDepartments([
            "All",
            ...data.departments.map(
              (department: { name: string }) => department.name,
            ),
          ]);
        }
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/admin/assignments", {
          cache: "no-store",
        });
        const data = await response.json();
        if (active && response.ok) setTasks(data.assignments.map(taskFromApi));
      } catch {
        // Preserve the last known state through temporary network failures.
      }
    };
    void load();
    const timer = setInterval(load, 10_000);
    const refresh = () => void load();
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2800);
    return () => clearTimeout(t);
  }, [toast]);
  const meta = {
    today: [
      new Intl.DateTimeFormat("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
        .format(new Date())
        .toUpperCase(),
      "Today’s overview",
      "Here’s how today’s work is moving.",
    ],
    staff: [
      "YOUR TEAM",
      "Staff",
      "Keep everyone’s details and preferences up to date.",
    ],
    history: [
      "PAST WORK",
      "Task history",
      "A simple record of what was assigned and completed.",
    ],
    settings: [
      "RESTAURANT SETUP",
      "Settings",
      "Manage departments, messaging, and daily task preferences.",
    ],
  }[view];
  function addTask(task: Task) {
    setTasks((v) => [task, ...v]);
    setAssignOpen(false);
    setToast("Task assigned — preparing WhatsApp message");
  }
  function addStaff(member: Staff) {
    setStaff((v) => [member, ...v]);
    setStaffOpen(false);
    setToast(`${member.name} added to the team`);
  }
  return (
    <main className="shell">
      <SessionExpiry expiresAt={expiresAt} />
      <header className="topbar">
        <div className="wrap topbar-inner">
          <div className="brand">
            <div className="logo">GB</div>
            <div>
              Ganesh Bhavan<small>DAILY TASKS</small>
            </div>
          </div>
          <Logout csrf={csrf} avatar />
        </div>
      </header>
      <div className="wrap">
        <section className="heading">
          <div>
            <div className="eyebrow">{meta[0]}</div>
            <h1>{meta[1]}</h1>
            <div className="sub">{meta[2]}</div>
          </div>
          <div className="heading-actions">
            <Logout csrf={csrf} />
            {view === "today" && (
              <button
                className="btn btn-primary"
                onClick={() => setAssignOpen(true)}
              >
                <Plus size={19} />
                <span>Assign task</span>
              </button>
            )}
            {view === "staff" && (
              <button
                className="btn btn-primary"
                onClick={() => setStaffOpen(true)}
              >
                <Plus size={19} />
                <span>Add staff</span>
              </button>
            )}
          </div>
        </section>
        {view === "today" && (
          <Today
            tasks={visible}
            counts={counts}
            filter={filter}
            setFilter={setFilter}
            departments={departments}
            onOpenTask={setSelectedTask}
          />
        )}{" "}
        {view === "staff" && <StaffPage staff={staff} />}{" "}
        {view === "history" && (
          <HistoryPage tasks={tasks} onOpenTask={setSelectedTask} />
        )}{" "}
        {view === "settings" && (
          <SettingsPage
            departments={departments}
            setDepartments={setDepartments}
            notify={setToast}
          />
        )}
      </div>
      <nav className="bottom">
        <div className="nav">
          <Nav
            active={view === "today"}
            onClick={() => setView("today")}
            icon={<ClipboardList size={20} />}
            label="Today"
          />
          <Nav
            active={view === "staff"}
            onClick={() => setView("staff")}
            icon={<UsersRound size={20} />}
            label="Staff"
          />
          <Nav
            active={view === "history"}
            onClick={() => setView("history")}
            icon={<History size={20} />}
            label="History"
          />
          <Nav
            active={view === "settings"}
            onClick={() => setView("settings")}
            icon={<Settings size={20} />}
            label="Settings"
          />
        </div>
      </nav>
      {assignOpen && (
        <AssignSheet
          staff={staff.filter((s) => s.active)}
          departments={departments.slice(1)}
          onClose={() => setAssignOpen(false)}
          onSubmit={addTask}
        />
      )}{" "}
      {staffOpen && (
        <StaffSheet
          departments={departments.slice(1)}
          onClose={() => setStaffOpen(false)}
          onSubmit={addStaff}
        />
      )}{" "}
      {selectedTask && (
        <TaskDetailsSheet
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
        />
      )}
      {toast && (
        <div className="toast">
          <Check size={16} />
          {toast}
        </div>
      )}
    </main>
  );
}
function Logout({ csrf, avatar }: { csrf: string; avatar?: boolean }) {
  return (
    <form
      action="/logout"
      method="post"
      onSubmit={() => localStorage.removeItem("gb_authenticated")}
    >
      <input type="hidden" name="csrf" value={csrf} />
      <button
        className={
          avatar ? "btn btn-secondary logout-compact" : "btn btn-secondary"
        }
        type="submit"
        aria-label="Sign out"
        title="Sign out"
      >
        {avatar && <LogOut size={17} aria-hidden="true" />}
        <span>Sign out</span>
      </button>
    </form>
  );
}
function SessionExpiry({ expiresAt }: { expiresAt: number }) {
  useEffect(() => {
    localStorage.setItem("gb_authenticated", "true");

    const expire = () => {
      localStorage.removeItem("gb_authenticated");
      window.location.replace("/login?error=expired");
    };
    const checkExpiry = () => {
      if (Date.now() >= expiresAt) expire();
    };
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      expire();
      return;
    }

    const timer = window.setTimeout(expire, remaining);
    window.addEventListener("focus", checkExpiry);
    document.addEventListener("visibilitychange", checkExpiry);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", checkExpiry);
      document.removeEventListener("visibilitychange", checkExpiry);
    };
  }, [expiresAt]);

  return null;
}
function Nav({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button className={active ? "active" : ""} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}
function Today({
  tasks,
  counts,
  filter,
  setFilter,
  departments,
  onOpenTask,
}: {
  tasks: Task[];
  counts: {
    pending: number;
    progress: number;
    done: number;
    attention: number;
  };
  filter: string;
  setFilter: (v: string) => void;
  departments: string[];
  onOpenTask: (task: Task) => void;
}) {
  const attentionTasks = tasks.filter(
    (task) =>
      task.status === "Needs attention" || task.status === "Not completed",
  );
  return (
    <>
      <div className="filters">
        {departments.map((d) => (
          <button
            key={d}
            className={`chip ${filter === d ? "active" : ""}`}
            onClick={() => setFilter(d)}
          >
            {d}
          </button>
        ))}
      </div>
      <section className="stats">
        <Stat label="Pending" value={counts.pending} />
        <Stat label="In progress" value={counts.progress} tone="green" />
        <Stat label="Completed" value={counts.done} tone="green" />
        <Stat label="Needs attention" value={counts.attention} tone="amber" />
      </section>
      <div className="grid">
        <section>
          <div className="section-title">
            <h2>Today’s tasks</h2>
            <span className="link">{tasks.length} tasks</span>
          </div>
          {tasks.length ? (
            tasks.map((t) => (
              <TaskCard key={t.id} task={t} onOpen={() => onOpenTask(t)} />
            ))
          ) : (
            <div className="card empty">No tasks in this department today.</div>
          )}
        </section>
        <aside className="side">
          <div className="section-title">
            <h2>Needs attention</h2>
            <span className="link">{attentionTasks.length} items</span>
          </div>
          <div className="card attention-list">
            {attentionTasks.length ? (
              attentionTasks.map((task) => (
                <Alert
                  key={task.id}
                  title={task.title}
                  detail={`${task.name} · ${task.status}`}
                />
              ))
            ) : (
              <div className="empty">Nothing needs attention.</div>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
function StaffPage({ staff }: { staff: Staff[] }) {
  return (
    <section>
      <div className="mini-stats">
        <div className="card">
          <strong>{staff.filter((s) => s.active).length}</strong>
          <span>Active staff</span>
        </div>
        <div className="card">
          <strong>
            {
              new Set(staff.filter((s) => s.active).map((s) => s.department))
                .size
            }
          </strong>
          <span>Departments</span>
        </div>
      </div>
      <div className="section-title page-section">
        <h2>Your team</h2>
        <span className="link">{staff.length} people</span>
      </div>
      <div>
        {staff.length ? (
          <ChromaGrid
            items={staff.map((s) => ({
              id: s.id,
              staffCode: s.staffCode,
              image: s.photoUrl,
              initials: s.initials,
              name: s.name,
              category: s.department,
              role: s.role,
              phone: s.phone,
              address: s.address,
              active: s.active,
            }))}
          />
        ) : (
          <div className="card empty">
            No staff members have been added yet.
          </div>
        )}
      </div>
    </section>
  );
}
function HistoryPage({
  tasks,
  onOpenTask,
}: {
  tasks: Task[];
  onOpenTask: (task: Task) => void;
}) {
  const grouped = useMemo(() => {
    const weeks = new Map<string, Map<string, Task[]>>();
    for (const task of tasks) {
      const date = new Date(task.assignedAt),
        monday = new Date(date);
      monday.setHours(0, 0, 0, 0);
      monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
      const week = `Week of ${monday.toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
        })}`,
        day = date.toLocaleDateString("en-IN", {
          weekday: "long",
          day: "numeric",
          month: "short",
        });
      if (!weeks.has(week)) weeks.set(week, new Map());
      const days = weeks.get(week)!;
      days.set(day, [...(days.get(day) || []), task]);
    }
    return weeks;
  }, [tasks]);
  return (
    <section>
      <div className="section-title page-section">
        <h2>Last 8 days</h2>
        <span className="link">Grouped by week and date</span>
      </div>
      {tasks.length ? (
        [...grouped].map(([week, days]) => (
          <div key={week} className="history-list card">
            <h3>{week}</h3>
            {[...days].map(([day, dayTasks]) => (
              <div key={day}>
                <p className="meta">{day}</p>
                {dayTasks.map((t) => (
                  <button
                    className="history-row"
                    key={t.id}
                    type="button"
                    onClick={() => onOpenTask(t)}
                  >
                    <div className="person-avatar">{t.initials}</div>
                    <div>
                      <strong>{t.title}</strong>
                      <p>
                        {t.name} · {t.department} · Due {t.due}
                      </p>
                    </div>
                    <span
                      className={`status ${t.status === "Completed" ? "complete" : t.status === "In progress" ? "progress" : t.status === "Not completed" || t.status === "Needs attention" ? "attention" : "pending"}`}
                    >
                      {t.status}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        ))
      ) : (
        <div className="history-list card empty">
          No assignments have been recorded yet.
        </div>
      )}
    </section>
  );
}
function SettingsPage({
  departments,
  setDepartments,
  notify,
}: {
  departments: string[];
  setDepartments: (v: string[]) => void;
  notify: (v: string) => void;
}) {
  const [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function add() {
    const value = name.trim();
    if (!value || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/departments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: value }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Department could not be added");
      setDepartments([...departments, body.department.name]);
      setName("");
      notify("Department saved");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Department could not be added",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-grid">
      <section className="card settings-card">
        <div className="settings-icon">
          <UserRound size={20} />
        </div>
        <h2>Departments</h2>
        <p>Keep task assignment quick and familiar.</p>
        <div className="department-list">
          {departments.slice(1).map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="inline-add">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New department"
            minLength={2}
            maxLength={100}
            onKeyDown={(event) => {
              if (event.key === "Enter") void add();
            }}
          />
          <button
            className="btn btn-secondary"
            onClick={() => void add()}
            disabled={busy}
          >
            {busy ? "Saving…" : "Add"}
          </button>
        </div>
        {error && <div className="error">{error}</div>}
      </section>
      <section className="card settings-card">
        <div className="settings-icon yellow">
          <Clock3 size={20} />
        </div>
        <h2>Task preferences</h2>
        <label>
          Default recording limit
          <select defaultValue="120">
            <option value="60">1 minute</option>
            <option value="120">2 minutes</option>
            <option value="180">3 minutes</option>
          </select>
        </label>
        <label className="toggle-row">
          <span>
            <b>Gentle reminders</b>
            <small>One reminder before a task is overdue</small>
          </span>
          <input type="checkbox" defaultChecked />
        </label>
        <button
          className="btn btn-primary"
          onClick={() => notify("Settings saved")}
        >
          Save preferences
        </button>
      </section>
      <ManagementAccess notify={notify} />
      <section className="card settings-card integration-card">
        <span className="eyebrow">WHATSAPP</span>
        <h2>Development mode</h2>
        <p>
          Real messages remain safely disabled until approved Meta templates and
          production credentials are configured.
        </p>
        <span className="status attention">Setup needed</span>
      </section>
    </div>
  );
}
type ManagementMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
};
function ManagementAccess({ notify }: { notify: (value: string) => void }) {
  const [members, setMembers] = useState<ManagementMember[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    void fetch("/api/admin/management", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => data?.members && setMembers(data.members))
      .catch(() => undefined);
  }, []);
  async function approve(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const response = await fetch("/api/admin/management", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: String(data.get("name") || ""),
          email: String(data.get("email") || ""),
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Access could not be added");
      setMembers((current) => [...current, body.member]);
      form.reset();
      notify("Management access approved");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Access could not be added",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card settings-card integration-card">
      <span className="eyebrow">GOOGLE ACCESS</span>
      <h2>Management members</h2>
      <p>
        Only approved Google email addresses can open this restaurant’s
        dashboard.
      </p>
      <div className="department-list">
        {members.map((member) => (
          <span key={member.id}>
            {member.name} · {member.email} · {member.role}
          </span>
        ))}
      </div>
      <form className="form" onSubmit={approve}>
        <div className="row">
          <div className="field">
            <label>Name</label>
            <input
              name="name"
              required
              minLength={2}
              placeholder="Manager name"
            />
          </div>
          <div className="field">
            <label>Google email</label>
            <input
              name="email"
              type="email"
              required
              placeholder="manager@gmail.com"
            />
          </div>
        </div>
        {error && <div className="error">{error}</div>}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Approving…" : "Approve management access"}
        </button>
      </form>
    </section>
  );
}
function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  const icon =
    label === "Completed" ? (
      <Check size={17} />
    ) : label === "In progress" ? (
      <Clock3 size={17} />
    ) : label === "Needs attention" ? (
      <AlertTriangle size={17} />
    ) : (
      <ClipboardList size={17} />
    );
  return (
    <div className={`stat stat-${tone || "neutral"}`}>
      <div className="stat-top">
        <span>{label}</span>
        <i className="stat-icon">{icon}</i>
      </div>
      <strong>{value}</strong>
      <small>
        {label === "Completed"
          ? "Nicely done!"
          : label === "Needs attention"
            ? "Take a look"
            : "For today"}
      </small>
    </div>
  );
}
function TaskCard({ task: t, onOpen }: { task: Task; onOpen: () => void }) {
  return (
    <button className="card task task-button" type="button" onClick={onOpen}>
      <div className="task-head">
        <div className="person">
          <div className="person-avatar">{t.initials}</div>
          <div>
            <h3>{t.title}</h3>
            <div className="meta">
              <span>{t.name}</span>
              <span>•</span>
              <span>{t.department}</span>
            </div>
          </div>
        </div>
        <span
          className={`status ${t.status === "In progress" ? "progress" : t.status === "Completed" ? "complete" : t.status === "Not completed" || t.status === "Needs attention" ? "attention" : "pending"}`}
        >
          {t.status}
        </span>
      </div>
      <div className="task-foot">
        <div className="delivery">
          {t.delivery.includes("Preparing") ? (
            <Clock3 size={14} />
          ) : (
            <CheckCheck size={14} />
          )}{" "}
          {t.delivery}
        </div>
        <div className="meta">
          <Clock3 size={14} />
          <b>Due {t.due}</b>
          <ChevronRight size={16} />
        </div>
      </div>
    </button>
  );
}
function TaskDetailsSheet({
  task,
  onClose,
}: {
  task: Task;
  onClose: () => void;
}) {
  return (
    <Sheet
      title={task.title}
      eyebrow="ASSIGNMENT DETAILS"
      onClose={onClose}
      compact
    >
      <div className="form task-details">
        <div className="card task-detail-status">
          <span className="meta">Task status</span>
          <strong>{task.status}</strong>
          <span className="meta">WhatsApp: {task.delivery}</span>
        </div>
        <div className="field">
          <label>Assigned to</label>
          <p>
            {task.name} · {task.department}
          </p>
        </div>
        <div className="field">
          <label>Due</label>
          <p>{task.due}</p>
        </div>
        {task.instructions && (
          <div className="field">
            <label>Instructions</label>
            <p>{task.instructions}</p>
          </div>
        )}
        {task.hasRecording && (
          <p className="meta">Voice instructions are attached to this task.</p>
        )}
        {(task.hasRecording || task.hasVideo) && <TaskVideo taskId={task.id} />}
      </div>
    </Sheet>
  );
}
function TaskVideo({ taskId }: { taskId: Task["id"] }) {
  const [unavailable, setUnavailable] = useState(false);
  if (unavailable)
    return (
      <p className="meta">
        This video is still being prepared or is unavailable for this earlier
        task.
      </p>
    );
  return (
    <video
      controls
      playsInline
      preload="metadata"
      src={`/api/admin/assignments/${taskId}/video`}
      onError={() => setUnavailable(true)}
    />
  );
}
function Alert({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="alert-row">
      <div className="alert-icon">
        <AlertTriangle size={17} />
      </div>
      <div>
        <h4>{title}</h4>
        <p>{detail}</p>
      </div>
    </div>
  );
}
function StaffSheet({
  departments,
  onClose,
  onSubmit,
}: {
  departments: string[];
  onClose: () => void;
  onSubmit: (s: Staff) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    form.set("consent", "true");
    try {
      const response = await fetch("/api/admin/staff", {
        method: "POST",
        body: form,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not add staff");
      onSubmit(body.staff);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add staff");
      setBusy(false);
    }
  }
  return (
    <Sheet title="Add staff member" eyebrow="YOUR TEAM" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="field">
          <label>Name</label>
          <input name="name" required placeholder="Full name" />
        </div>
        <div className="field">
          <label>WhatsApp number</label>
          <input
            name="phone"
            type="tel"
            pattern="\+[1-9][0-9]{7,14}"
            required
            placeholder="+919876543210"
          />
        </div>
        <div className="field">
          <label>Work category</label>
          <input
            name="workCategory"
            required
            list="work-categories"
            placeholder="e.g. Kitchen, Service, Cleaning"
          />
          <datalist id="work-categories">
            {departments.map((d) => (
              <option value={d} key={d} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label>Role (optional)</label>
          <input name="role" placeholder="e.g. Cook" />
        </div>
        <div className="field">
          <label>Address (optional)</label>
          <textarea name="address" rows={3} placeholder="Home address" />
        </div>
        <div className="field">
          <label>Photo (optional)</label>
          <input name="photo" type="file" accept="image/*" />
        </div>
        <div className="field">
          <label>Preferred language</label>
          <select name="language">
            <option value="en">English</option>
            <option value="ta">Tamil</option>
          </select>
        </div>
        <label className="consent">
          <input type="checkbox" required /> Staff member has consented to
          receive WhatsApp task messages.
        </label>
        {error && <div className="error">{error}</div>}
        <button className="btn btn-primary submit" disabled={busy}>
          {busy ? "Adding…" : "Add staff member"}
        </button>
      </form>
    </Sheet>
  );
}
function AssignSheet({
  staff,
  departments,
  onClose,
  onSubmit,
}: {
  staff: Staff[];
  departments: string[];
  onClose: () => void;
  onSubmit: (t: Task) => void;
}) {
  const assignableDepartments = useMemo(
      () => departments.filter((department) => department !== "All"),
      [departments],
    ),
    defaultDepartment =
      assignableDepartments.find(
        (department) => department.toLowerCase() === "kitchen",
      ) ||
      assignableDepartments[0] ||
      "",
    [selectedDepartment, setSelectedDepartment] = useState(defaultDepartment),
    filteredStaff = useMemo(
      () =>
        staff.filter(
          (person) =>
            person.department.toLowerCase() ===
            selectedDepartment.toLowerCase(),
        ),
      [selectedDepartment, staff],
    ),
    [selectedStaffId, setSelectedStaffId] = useState(
      String(
        staff.find(
          (person) =>
            person.department.toLowerCase() === defaultDepartment.toLowerCase(),
        )?.id || "",
      ),
    ),
    defaultDue = useMemo(() => {
      const due = new Date(Date.now() + 3 * 60 * 60 * 1000),
        local = new Date(due.getTime() - due.getTimezoneOffset() * 60_000);
      return {
        date: local.toISOString().slice(0, 10),
        time: local.toISOString().slice(11, 16),
      };
    }, []),
    [recording, setRecording] = useState(false),
    [seconds, setSeconds] = useState(0),
    [audio, setAudio] = useState<string | null>(null),
    [audioBlob, setAudioBlob] = useState<Blob | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null),
    recorder = useRef<MediaRecorder | null>(null),
    chunks = useRef<Blob[]>([]);
  useEffect(() => {
    if (!assignableDepartments.includes(selectedDepartment))
      setSelectedDepartment(defaultDepartment);
  }, [assignableDepartments, defaultDepartment, selectedDepartment]);
  useEffect(() => {
    if (!filteredStaff.some((person) => String(person.id) === selectedStaffId))
      setSelectedStaffId(String(filteredStaff[0]?.id || ""));
  }, [filteredStaff, selectedStaffId]);
  async function toggle() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks.current = [];
      const mimeType = supportedWhatsAppRecordingTypes.find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      if (!mimeType) {
        stream.getTracks().forEach((t) => t.stop());
        setError("This browser cannot record audio in a supported format.");
        return;
      }
      const r = new MediaRecorder(stream, { mimeType });
      recorder.current = r;
      r.ondataavailable = (e) => chunks.current.push(e.data);
      r.onstop = () => {
        const blob = new Blob(chunks.current, { type: r.mimeType });
        setAudioBlob(blob);
        setAudio(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        if (timer.current) clearInterval(timer.current);
      };
      r.start();
      setSeconds(0);
      setRecording(true);
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError(
        "Microphone access is unavailable. Upload an audio file instead.",
      );
    }
  }
  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      if (audio) URL.revokeObjectURL(audio);
    },
    [audio],
  );
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const d = new FormData(e.currentTarget),
      person = staff.find((s) => String(s.id) === d.get("staff"));
    const title = String(d.get("title") || "").trim();
    if (!person || (!title && !audioBlob)) {
      setError("Add a task title or record voice instructions.");
      return;
    }
    if (typeof person.id === "string") {
      try {
        setBusy(true);
        let recordingId: string | undefined;
        if (audioBlob) {
          const media = new FormData();
          media.set(
            "file",
            audioBlob,
            `instructions.${recordingExtension(audioBlob.type.split(";", 1)[0])}`,
          );
          const uploaded = await fetch("/api/admin/media", {
            method: "POST",
            body: media,
          });
          const uploadBody = await uploaded.json();
          if (!uploaded.ok)
            throw new Error(uploadBody.error || "Recording upload failed");
          recordingId = uploadBody.id;
        }
        const date = String(d.get("date")),
          time = String(d.get("time"));
        const response = await fetch("/api/admin/assignments", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            staffId: person.id,
            departmentId: person.departmentId,
            dueAt: `${date}T${time}:00+05:30`,
            title: title || undefined,
            recordingId,
          }),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Task creation failed");
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Could not assign this task",
        );
        setBusy(false);
        return;
      }
    }
    onSubmit({
      id: Date.now(),
      name: person?.name || "Staff",
      initials: person?.initials || "GB",
      title: title || "Voice instructions",
      department: String(d.get("department")),
      due: new Date(`2000-01-01T${d.get("time")}`).toLocaleTimeString("en-IN", {
        hour: "numeric",
        minute: "2-digit",
      }),
      assignedAt: new Date().toISOString(),
      status: "Pending",
      delivery: audio ? "Preparing video" : "Queued",
      instructions: null,
      hasRecording: Boolean(audioBlob),
      hasVideo: false,
    });
  }
  return (
    <Sheet title="Assign a task" eyebrow="NEW ASSIGNMENT" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="row">
          <div className="field">
            <label>Department</label>
            <select
              name="department"
              value={selectedDepartment}
              onChange={(event) => setSelectedDepartment(event.target.value)}
            >
              {assignableDepartments.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Staff member</label>
            <select
              name="staff"
              value={selectedStaffId}
              onChange={(event) => setSelectedStaffId(event.target.value)}
              disabled={!filteredStaff.length}
            >
              {!filteredStaff.length && (
                <option value="">No staff in this department</option>
              )}
              {filteredStaff.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label>Due date</label>
            <input
              type="date"
              name="date"
              defaultValue={defaultDue.date}
              required
            />
          </div>
          <div className="field">
            <label>Due time</label>
            <input
              type="time"
              name="time"
              defaultValue={defaultDue.time}
              required
            />
          </div>
        </div>
        <div className="field">
          <label>
            Task title <small>(optional with recording)</small>
          </label>
          <input name="title" placeholder="e.g. Check evening stock" />
        </div>
        <div className="record">
          <button
            type="button"
            className={`record-circle ${recording ? "live" : ""}`}
            onClick={toggle}
          >
            {recording ? (
              <Square size={20} fill="currentColor" />
            ) : (
              <Mic size={22} />
            )}
          </button>
          <b>
            {recording
              ? `Recording · ${formatTime(seconds)}`
              : audio
                ? `Recording ready · ${formatTime(seconds)}`
                : "Record instructions"}
          </b>
          <p>
            {recording
              ? "Tap stop when you’re done"
              : audio
                ? "Preview below or record again"
                : "Speak in the language your staff understands"}
          </p>
          {audio && <audio controls src={audio} />}
          <label className="upload-audio">
            <Upload size={15} /> Upload audio
            <input
              type="file"
              accept="audio/aac,audio/mp4,audio/mpeg,audio/amr,audio/ogg,audio/opus,audio/webm,.m4a,.mp3,.aac,.amr,.ogg,.opus,.webm"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  const mimeType = f.type.split(";", 1)[0];
                  if (
                    ![
                      "audio/aac",
                      "audio/mp4",
                      "audio/mpeg",
                      "audio/amr",
                      "audio/ogg",
                      "audio/opus",
                      "audio/webm",
                    ].includes(mimeType)
                  ) {
                    setError(
                      "Upload an M4A, MP3, AAC, AMR, OGG, OPUS, or WebM recording.",
                    );
                    e.currentTarget.value = "";
                    return;
                  }
                  setError("");
                  setAudioBlob(f);
                  setAudio(URL.createObjectURL(f));
                }
              }}
            />
          </label>
          {error && <div className="error-text">{error}</div>}
        </div>
        <button
          className="btn btn-primary submit"
          disabled={busy || !filteredStaff.length}
        >
          {busy ? "Uploading & assigning…" : "Assign & send"}{" "}
          <ChevronRight size={18} />
        </button>
      </form>
    </Sheet>
  );
}
function Sheet({
  title,
  eyebrow,
  onClose,
  children,
  compact = false,
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="modal-bg" role="dialog" aria-modal="true">
      <section className={`sheet${compact ? " sheet-compact" : ""}`}>
        <div className="sheet-head">
          <div>
            <div className="eyebrow">{eyebrow}</div>
            <h2>{title}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </section>
    </div>
  );
}
const formatTime = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
