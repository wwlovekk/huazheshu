import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Bell,
  BellOff,
  Cake,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Coffee,
  FolderOpen,
  GraduationCap,
  Heart,
  Leaf,
  Pencil,
  Pin,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type {
  AppState,
  Command,
  CrossOff,
  DateRange,
  Note,
  SchedulePlan,
  SpecialDate,
  Task,
} from "../../shared/types";
import {
  addDays,
  addMonths,
  dateKey,
  daysBetween,
  localDate,
  monthStart,
  pad,
  shortDate,
  weekdays,
} from "../../shared/dates";
import {
  nextRest,
  overdueTasks,
  planOn,
  resolveDay,
  tasksOn,
} from "../../shared/engine";
import {
  allFestivals,
  festivalsOn,
  holidaySources,
  lunarLabel,
  nextSpecial,
  specialOn,
  upcomingEvents,
} from "../../shared/holidays";
import { PaperNoteSheet, QuickTaskInput } from "./PaperInputs";

type Dispatch = (command: Command) => Promise<void>;
type Modal =
  | {
      kind: "entry";
      tab?: "task" | "note" | "special";
      task?: Task;
      note?: Note;
      special?: SpecialDate;
    }
  | { kind: "range"; range?: DateRange }
  | { kind: "override"; date: string }
  | { kind: "settings" }
  | null;
const uid = () => crypto.randomUUID(),
  stamp = () => new Date().toISOString();
const repeatLabels = {
  none: "不重复",
  daily: "每天",
  weekly: "每周",
  monthly: "每月",
  yearly: "每年",
  duty: "按工作 在校日",
};
function IconButton({
  label,
  onClick,
  children,
  className = "",
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      className={`icon-btn ${className}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function Empty({
  icon,
  children,
  action,
}: {
  icon: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon}
      <p>{children}</p>
      {action}
    </div>
  );
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Toggle({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="toggle-row">
      <span>{children}</span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

export default function App() {
  const [state, setState] = useState<AppState | null>(null),
    [route, setRoute] = useState<"calendar" | "notes" | "schedule">("calendar"),
    [scheduleTab, setScheduleTab] = useState<"plan" | "special">("plan");
  const [today, setToday] = useState(dateKey()),
    [selected, setSelected] = useState(dateKey()),
    [month, setMonth] = useState(monthStart(dateKey())),
    [modal, setModal] = useState<Modal>(null),
    [query, setQuery] = useState(""),
    [toast, setToast] = useState(""),
    [animated, setAnimated] = useState(""),
    [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchOpenRef = useRef(false);
  searchOpenRef.current = searchOpen;
  function openSearch() {
    if (searchOpenRef.current) searchRef.current?.focus();
    else setSearchOpen(true);
  }
  useEffect(() => {
    if (!window.huazheshu) {
      setToast("请从 Windows 客户端启动划着数");
      return;
    }
    window.huazheshu
      .getState()
      .then(setState)
      .catch((e) => setToast(String(e)));
    const unsubscribe = window.huazheshu.onState(setState);
    const nav = window.huazheshu.onNavigate((d) => {
      setRoute("calendar");
      if (d === "new") setModal({ kind: "entry" });
      else {
        setSelected(d);
        setMonth(monthStart(d));
      }
    });
    const timer = setInterval(() => setToday(dateKey()), 10000);
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openSearch();
      }
      if (e.key === "Escape") {
        if (searchOpenRef.current) setSearchOpen(false);
        else setModal(null);
        setQuery("");
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      unsubscribe();
      nav();
      clearInterval(timer);
      document.removeEventListener("keydown", key);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    document.documentElement.dataset.reduceMotion = state?.settings.reduceMotion
      ? "true"
      : "false";
  }, [state?.settings.reduceMotion]);
  async function dispatch(command: Command) {
    try {
      setState(await window.huazheshu.command(command));
    } catch (error) {
      setToast(cleanError(error));
      throw error;
    }
  }
  function run(command: Command) {
    void dispatch(command).catch(() => {});
  }
  function chooseDate(date: string) {
    setSelected(date);
    setMonth(monthStart(date));
    setRoute("calendar");
  }
  function cross(date: string, points?: [number, number][]) {
    if (date >= today) return;
    setAnimated(date);
    run({ type: "cross.toggle", date, points });
  }
  const results = useMemo(() => {
    if (!state || !query.trim()) return [];
    const q = query.trim().toLocaleLowerCase();
    return [
      ...state.notes
        .filter((n) => (n.title + " " + n.body).toLocaleLowerCase().includes(q))
        .map((n) => ({
          id: n.id,
          title: n.title,
          subtitle: "备忘" + (n.date ? "  " + shortDate(n.date) : ""),
          open: () => {
            setModal({ kind: "entry", tab: "note", note: n });
            setQuery("");
          },
        })),
      ...state.tasks
        .filter((t) => (t.title + " " + t.body).toLocaleLowerCase().includes(q))
        .map((t) => ({
          id: t.id,
          title: t.title,
          subtitle: "待办" + (t.date ? "  " + shortDate(t.date) : ""),
          open: () => {
            setModal({ kind: "entry", tab: "task", task: t });
            setQuery("");
          },
        })),
      ...state.specials
        .filter((s) => s.title.toLocaleLowerCase().includes(q))
        .map((s) => ({
          id: s.id,
          title: s.title,
          subtitle: "重要日期",
          open: () => {
            setModal({ kind: "entry", tab: "special", special: s });
            setQuery("");
          },
        })),
    ].slice(0, 12);
  }, [state, query]);
  if (!state)
    return (
      <div className="loading">
        <Leaf size={36} />
        <strong>划着数</strong>
        <span>{toast || "正在载入"}</span>
      </div>
    );
  const rest = nextRest(state, today),
    restIn = rest ? daysBetween(today, rest) : null,
    events = upcomingEvents(state.specials, today, 4),
    yesterday = addDays(today, -1);
  return (
    <>
      <div className={`desktop-shell route-${route}`}>
        <aside className="sidebar" aria-label="侧边栏">
          <button
            className="brand"
            onClick={() => chooseDate(today)}
            aria-label="划着数首页"
          >
            <span className="brand-mark">
              <CalendarDays size={25} />
              <i />
            </span>
            <span>
              划着数<small>ONE DAY AT A TIME</small>
            </span>
          </button>
          <nav className="primary-nav" aria-label="主导航">
            {(["calendar", "notes", "schedule"] as const).map((key, i) => (
              <button
                key={key}
                className={route === key ? "nav-active" : ""}
                aria-current={route === key ? "page" : undefined}
                onClick={() => setRoute(key)}
              >
                {["日历", "备忘", "排期"][i]}
              </button>
            ))}
          </nav>
          <div
            className="rest-countdown"
            title={
              restIn === 0
                ? "今天休息"
                : restIn !== null
                  ? `距下次休息还有 ${restIn} 天`
                  : "暂未安排下次休息"
            }
          >
            <CalendarDays size={12} />
            <span>
              {restIn === 0 ? (
                "今天休息"
              ) : restIn !== null ? (
                <>
                  距下次休息还有 <b>{restIn}</b> 天
                </>
              ) : (
                "暂未安排休息"
              )}
            </span>
          </div>
          <div className="sidebar-bottom">
            <section className="sidebar-upcoming" aria-label="期待的小事">
              <div className="sidebar-section-heading">
                <h2>期待的小事</h2>
                <button
                  className="icon-btn"
                  aria-label="管理重要日期"
                  onClick={() => {
                    setRoute("schedule");
                    setScheduleTab("special");
                  }}
                >
                  <Plus size={13} />
                </button>
              </div>
              {events.map((event) => (
                <button
                  className="upcoming-row"
                  key={event.id + event.date}
                  onClick={() => chooseDate(event.date)}
                >
                  <span>
                    {event.title}
                    <small>{shortDate(event.date)}</small>
                  </span>
                  <em>
                    {daysBetween(today, event.date) === 0
                      ? "今天"
                      : `${daysBetween(today, event.date)} 天`}
                  </em>
                </button>
              ))}
            </section>
            <div className="sidebar-utilities">
              <button className="sidebar-action" onClick={openSearch}>
                <Search size={14} />
                <span>搜索</span>
                <kbd>Ctrl K</kbd>
              </button>
              <button
                className="sidebar-action"
                onClick={() => setModal({ kind: "settings" })}
              >
                <Settings2 size={14} />
                <span>设置</span>
              </button>
            </div>
          </div>
        </aside>
        <main
          className={`workspace ${route === "calendar" ? "calendar-workspace" : "subview-workspace"}`}
        >
          {route === "calendar" && (
            <>
              <div className="calendar-toolbar">
                <h1>
                  {localDate(month).getFullYear()}年{" "}
                  {localDate(month).getMonth() + 1}月
                </h1>
                <div className="calendar-tools">
                  <div className="month-switch">
                    <IconButton
                      label="上个月"
                      onClick={() => setMonth(addMonths(month, -1))}
                    >
                      <ChevronLeft size={15} />
                    </IconButton>
                    <button
                      className="text-btn today-link"
                      onClick={() => chooseDate(today)}
                    >
                      今天
                    </button>
                    <IconButton
                      label="下个月"
                      onClick={() => setMonth(addMonths(month, 1))}
                    >
                      <ChevronRight size={15} />
                    </IconButton>
                  </div>
                  <button
                    className="text-btn yesterday-toggle"
                    aria-label={
                      state.crosses.some((c) => c.id === yesterday)
                        ? "撤销昨天的划线"
                        : "划掉昨天"
                    }
                    onClick={() => cross(yesterday)}
                  >
                    {state.crosses.some((c) => c.id === yesterday) ? (
                      <RotateCcw size={12} />
                    ) : (
                      <Pencil size={12} />
                    )}
                    {state.crosses.some((c) => c.id === yesterday)
                      ? "撤销昨日划线"
                      : "划掉昨天"}
                  </button>
                  <button
                    className="btn record-button"
                    onClick={() => setModal({ kind: "entry" })}
                  >
                    <Plus size={14} />
                    记一笔
                  </button>
                </div>
              </div>
              {!resolveDay(state, month).officialKnown && (
                <div className="inline-notice">
                  本年度国家调休数据尚未收录 当前显示你的个人排期
                </div>
              )}
              <MonthGrid
                state={state}
                month={month}
                today={today}
                selected={selected}
                onSelect={setSelected}
                onCross={cross}
                animated={animated}
              />
              <div className="calendar-footer">
                <div className="legend">
                  <span>
                    <i className="legend-dot rest-dot" />
                    休息
                  </span>
                  <span className="ink-legend">
                    <i />
                    已划过
                  </span>
                </div>
                <button
                  className="text-btn"
                  onClick={() => setModal({ kind: "override", date: selected })}
                >
                  <Pencil size={12} />
                  修改这天的安排
                </button>
              </div>
            </>
          )}
          {route === "notes" && (
            <NotesPage
              state={state}
              dispatch={dispatch}
              onAdd={() => setModal({ kind: "entry", tab: "note" })}
            />
          )}
          {route === "schedule" && (
            <>
              <div className="page-title">
                <h1>排期</h1>
                <button
                  className="btn"
                  onClick={() => setModal({ kind: "entry" })}
                >
                  <Plus size={14} />
                  记一笔
                </button>
              </div>
              <div className="segmented page-tabs">
                <button
                  className={scheduleTab === "plan" ? "active" : ""}
                  onClick={() => setScheduleTab("plan")}
                >
                  我的作息
                </button>
                <button
                  className={scheduleTab === "special" ? "active" : ""}
                  onClick={() => setScheduleTab("special")}
                >
                  重要日期
                </button>
              </div>
              <div className="subview-scroll">
                {scheduleTab === "plan" ? (
                  <SchedulePage
                    state={state}
                    today={today}
                    dispatch={dispatch}
                    onRange={(range) => setModal({ kind: "range", range })}
                    onOverride={(date) => setModal({ kind: "override", date })}
                  />
                ) : (
                  <SpecialPage
                    state={state}
                    today={today}
                    dispatch={dispatch}
                    onEdit={(special) =>
                      setModal({ kind: "entry", tab: "special", special })
                    }
                  />
                )}
              </div>
            </>
          )}
        </main>
        {route === "calendar" && (
          <DayPanel
            state={state}
            selected={selected}
            today={today}
            dispatch={dispatch}
            onEdit={(task) => setModal({ kind: "entry", task })}
            onNote={(note) => setModal({ kind: "entry", tab: "note", note })}
            onAdd={(tab) => setModal({ kind: "entry", tab })}
            onCross={() => cross(selected)}
            onOverride={() => setModal({ kind: "override", date: selected })}
          />
        )}
      </div>
      {modal && (
        <ModalFrame
          title={
            modal.kind === "settings"
              ? "偏好与数据"
              : modal.kind === "range"
                ? "区间安排"
                : modal.kind === "override"
                  ? `${shortDate(modal.date)}的安排`
                  : "记一笔"
          }
          onClose={() => setModal(null)}
          wide={modal.kind === "settings"}
        >
          {modal.kind === "entry" && (
            <EntryForm
              key={
                modal.task?.id ?? modal.note?.id ?? modal.special?.id ?? "new"
              }
              modal={modal}
              date={selected}
              dispatch={dispatch}
              onClose={() => setModal(null)}
            />
          )}
          {modal.kind === "range" && (
            <RangeForm
              range={modal.range}
              date={selected}
              dispatch={dispatch}
              onClose={() => setModal(null)}
            />
          )}
          {modal.kind === "override" && (
            <OverrideForm
              state={state}
              date={modal.date}
              dispatch={dispatch}
              onClose={() => setModal(null)}
            />
          )}
          {modal.kind === "settings" && (
            <SettingsPanel
              state={state}
              dispatch={dispatch}
              message={setToast}
              onBeforeRestore={() => setRoute("calendar")}
            />
          )}
        </ModalFrame>
      )}
      {searchOpen && (
        <ModalFrame
          title="搜索"
          onClose={() => {
            setSearchOpen(false);
            setQuery("");
          }}
        >
          <div className="search-field">
            <Search size={17} />
            <input
              ref={searchRef}
              aria-label="搜索备忘与事项"
              placeholder="搜索备忘与事项"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <kbd>Ctrl K</kbd>
          </div>
          <div className="search-results">
            {query.trim() ? (
              results.length ? (
                results.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => {
                      result.open();
                      setSearchOpen(false);
                    }}
                  >
                    <span>
                      {result.title}
                      <small>{result.subtitle}</small>
                    </span>
                    <ArrowRight size={14} />
                  </button>
                ))
              ) : (
                <p className="search-empty">还没有匹配的记录</p>
              )
            ) : (
              <p className="search-empty">输入关键词查找备忘 待办和重要日期</p>
            )}
          </div>
        </ModalFrame>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button aria-label="关闭消息" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
    </>
  );
}

function MonthGrid({
  state,
  month,
  today,
  selected,
  onSelect,
  onCross,
  animated,
}: {
  state: AppState;
  month: string;
  today: string;
  selected: string;
  onSelect: (d: string) => void;
  onCross: (d: string, p?: [number, number][]) => void;
  animated: string;
}) {
  const start = addDays(month, -((localDate(month).getDay() + 6) % 7)),
    [drag, setDrag] = useState<{
      date: string;
      points: [number, number][];
    } | null>(null),
    gesture = useRef<{
      date: string;
      points: [number, number][];
      startX: number;
      startY: number;
    } | null>(null),
    suppress = useRef(false);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return (
    <>
      <div className="weekday-grid">
        {["一", "二", "三", "四", "五", "六", "日"].map((d, i) => (
          <span className={i >= 5 ? "weekend-label" : ""} key={d}>
            {d}
          </span>
        ))}
      </div>
      <div className="month-grid" role="group" aria-label="月历">
        {cells.map((date) => {
          const info = resolveDay(state, date),
            outside = date.slice(0, 7) !== month.slice(0, 7),
            cross = state.crosses.find((c) => c.id === date),
            tasks = tasksOn(state, date),
            notes = state.notes.filter((n) => n.date === date),
            specials = state.specials.filter((s) => specialOn(s, date)),
            event = info.festivals[0] || specials[0]?.title;
          const currentPoints =
            drag?.date === date ? drag.points : cross?.points;
          return (
            <button
              key={date}
              data-date={date}
              aria-label={`${date} ${info.label}${event ? " " + event : ""}`}
              aria-pressed={selected === date}
              className={`day-cell ${localDate(date).getDay() === 0 ? "sunday" : ""} ${outside ? "outside" : ""} ${selected === date ? "selected" : ""} ${date === today ? "today" : ""} ${info.kind === "rest" ? "rest-day" : ""} ${cross ? "crossed" : ""}`}
              onClick={() => {
                if (suppress.current) {
                  suppress.current = false;
                  return;
                }
                onSelect(date);
              }}
              onPointerDown={(e) => {
                if (e.button !== 0 || date >= today || cross) return;
                const rect = e.currentTarget.getBoundingClientRect();
                gesture.current = {
                  date,
                  points: [
                    [
                      Math.max(
                        0,
                        Math.min(
                          100,
                          ((e.clientX - rect.left) / rect.width) * 100,
                        ),
                      ),
                      Math.max(
                        0,
                        Math.min(
                          100,
                          ((e.clientY - rect.top) / rect.height) * 100,
                        ),
                      ),
                    ],
                  ],
                  startX: e.clientX,
                  startY: e.clientY,
                };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const g = gesture.current;
                if (!g || g.date !== date || g.points.length >= 128) return;
                if (Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < 12)
                  return;
                const rect = e.currentTarget.getBoundingClientRect();
                g.points.push([
                  Math.max(
                    0,
                    Math.min(100, ((e.clientX - rect.left) / rect.width) * 100),
                  ),
                  Math.max(
                    0,
                    Math.min(100, ((e.clientY - rect.top) / rect.height) * 100),
                  ),
                ]);
                setDrag({ date, points: [...g.points] });
              }}
              onPointerUp={(e) => {
                const g = gesture.current;
                gesture.current = null;
                setDrag(null);
                if (e.currentTarget.hasPointerCapture(e.pointerId))
                  e.currentTarget.releasePointerCapture(e.pointerId);
                if (g && g.points.length > 1) {
                  suppress.current = true;
                  onCross(date, g.points);
                }
              }}
              onPointerCancel={() => {
                gesture.current = null;
                setDrag(null);
              }}
            >
              <div className="day-cell-top">
                <span className="day-number">{Number(date.slice(-2))}</span>
                <span className="day-kind">
                  {info.kind === "rest"
                    ? "休"
                    : planOn(state, date).identity === "student"
                      ? "课"
                      : "班"}
                </span>
              </div>
              <span className={`lunar ${event ? "festival" : ""}`}>
                {lunarLabel(date)}
              </span>
              {date === today && (
                <svg
                  className="today-underline"
                  viewBox="0 0 34 7"
                  aria-hidden="true"
                >
                  <path d="M 2 4 Q 16 1 31 3" />
                </svg>
              )}
              {event && (
                <span className="day-event" title={event}>
                  {event}
                </span>
              )}
              <div
                className="cell-items"
                aria-label={`${tasks.length} 项待办 ${notes.length} 条备忘`}
              >
                {(tasks.length > 0 || notes.length > 0) && (
                  <span
                    className="calendar-entry-dot"
                    title={[
                      ...tasks.map((task) => task.title),
                      ...notes.map((note) => note.title),
                    ].join(" ")}
                  />
                )}
              </div>
              {currentPoints && (
                <CrossOffStroke date={date} animate={animated === date} />
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}
const crossPaths = [
  "M 22 88 Q 56 54, 88 12",
  "M 25 85 Q 58 50, 86 15",
  "M 20 90 Q 52 56, 89 10",
  "M 24 87 Q 55 48, 85 14",
];
function CrossOffStroke({ date, animate }: { date: string; animate: boolean }) {
  return (
    <svg
      className={`cross-svg ${animate ? "animate-ink" : ""}`}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={crossPaths[Number(date.slice(-2)) % 4]} pathLength="1" />
    </svg>
  );
}

function TaskRow({
  task,
  date,
  dispatch,
  onEdit,
}: {
  task: Task;
  date: string;
  dispatch: Dispatch;
  onEdit: () => void;
}) {
  const done = task.completedDates.includes(date);
  return (
    <div className={`task-row ${done ? "done" : ""}`}>
      <button
        className="task-check"
        aria-label={`${done ? "取消完成" : "完成"} ${task.title}`}
        aria-pressed={done}
        onClick={() =>
          void dispatch({ type: "task.toggle", id: task.id, date }).catch(
            () => {},
          )
        }
      >
        {done && <Check size={13} />}
      </button>
      <button className="task-content" onClick={onEdit}>
        <span>{task.title}</span>
        <small>
          {task.date ? task.time : "随时"}
          {task.repeat !== "none" && `  ${repeatLabels[task.repeat]}`}
          {task.remind && <Bell size={10} />}
        </small>
      </button>
    </div>
  );
}
function DayPanel({
  state,
  selected,
  today,
  dispatch,
  onEdit,
  onNote,
  onAdd,
  onCross,
  onOverride,
}: {
  state: AppState;
  selected: string;
  today: string;
  dispatch: Dispatch;
  onEdit: (task: Task) => void;
  onNote: (note: Note) => void;
  onAdd: (tab: "task" | "note") => void;
  onCross: () => void;
  onOverride: () => void;
}) {
  const day = resolveDay(state, selected),
    tasks = tasksOn(state, selected),
    notes = state.notes.filter((note) => note.date === selected),
    floating = state.tasks.filter((task) => !task.date),
    overdue = overdueTasks(state, today),
    done = tasks.filter((task) =>
      task.completedDates.includes(selected),
    ).length,
    crossed = state.crosses.some((cross) => cross.id === selected);
  return (
    <aside className="day-panel">
      <header className="day-panel-heading">
        <h2>
          {shortDate(selected)} 星期{weekdays[localDate(selected).getDay()]}
        </h2>
        <div className="day-panel-meta">
          <p>农历{lunarLabel(selected, true)}</p>
          <button
            className="day-status"
            title={day.source}
            onClick={onOverride}
          >
            {day.label}
            <Pencil size={10} />
          </button>
        </div>
      </header>
      <section className="tasks-area" aria-label="当天待办">
        <div className="side-heading">
          <h3>
            待办事项{" "}
            <span>
              {done}/{tasks.length}
            </span>
          </h3>
          <IconButton label="新增待办" onClick={() => onAdd("task")}>
            <Plus size={15} />
          </IconButton>
        </div>
        <div className="task-scroll">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              date={selected}
              dispatch={dispatch}
              onEdit={() => onEdit(task)}
            />
          ))}
          {selected === today && floating.length > 0 && (
            <div className="secondary-tasks">
              <h4>
                有空时做 <span>{floating.length}</span>
              </h4>
              {floating.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  date="undated"
                  dispatch={dispatch}
                  onEdit={() => onEdit(task)}
                />
              ))}
            </div>
          )}
          {selected === today && overdue.length > 0 && (
            <div className="secondary-tasks overdue">
              <h4>
                还没完成 <span>{overdue.length}</span>
              </h4>
              {overdue.map(({ task, date }) => (
                <div key={task.id}>
                  <small className="overdue-date">{shortDate(date)}</small>
                  <TaskRow
                    task={task}
                    date={date}
                    dispatch={dispatch}
                    onEdit={() => onEdit(task)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
        <QuickTaskInput key={selected} date={selected} dispatch={dispatch} />
        {selected < today && (
          <button className="text-btn cross-selected" onClick={onCross}>
            {crossed ? <RotateCcw size={12} /> : <Pencil size={12} />}
            {crossed ? "撤销这天的划线" : "划掉这一天"}
          </button>
        )}
        {state.deliveries.some((delivery) => delivery.failed) && (
          <p className="inline-notice">
            有提醒未能显示 请在设置中测试 Windows 通知
          </p>
        )}
      </section>
      <PaperNoteSheet
        key={selected}
        notes={notes}
        date={selected}
        dispatch={dispatch}
        onEdit={onNote}
        onAdd={() => onAdd("note")}
      />
    </aside>
  );
}

function ModalFrame({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null),
    returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    returnFocus.current = document.activeElement as HTMLElement;
    const el = ref.current;
    const focus =
      el?.querySelector<HTMLElement>(
        "input:not([type=checkbox]),textarea,select",
      ) ?? el?.querySelector<HTMLElement>("button");
    focus?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !el || !el.contains(document.activeElement))
        return;
      const all = Array.from(
        el.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]",
        ),
      );
      const first = all[0],
        last = all.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      returnFocus.current?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <IconButton label="关闭" onClick={onClose}>
            <X size={19} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}
function EntryForm({
  modal,
  date,
  dispatch,
  onClose,
}: {
  modal: Extract<Modal, { kind: "entry" }>;
  date: string;
  dispatch: Dispatch;
  onClose: () => void;
}) {
  const [tab, setTab] = useState(modal.tab ?? (modal.task ? "task" : "task")),
    [title, setTitle] = useState(
      modal.task?.title ?? modal.note?.title ?? modal.special?.title ?? "",
    ),
    [body, setBody] = useState(modal.task?.body ?? modal.note?.body ?? ""),
    [entryDate, setEntryDate] = useState(
      modal.task
        ? (modal.task.date ?? "")
        : modal.note
          ? (modal.note.date ?? "")
          : date,
    ),
    [time, setTime] = useState(
      modal.task?.time ?? modal.special?.time ?? "09:00",
    ),
    [repeat, setRepeat] = useState<Task["repeat"]>(
      modal.task?.repeat ?? "none",
    ),
    [endDate, setEndDate] = useState(modal.task?.endDate ?? ""),
    [remind, setRemind] = useState(
      modal.task?.remind ?? modal.special?.remind ?? true,
    ),
    [pinned, setPinned] = useState(modal.note?.pinned ?? false),
    [calendar, setCalendar] = useState<SpecialDate["calendar"]>(
      modal.special?.calendar ?? "solar",
    ),
    [specialKind, setSpecialKind] = useState<SpecialDate["kind"]>(
      modal.special?.kind ?? "birthday",
    ),
    [specialMonth, setSpecialMonth] = useState(
      modal.special?.month ?? localDate(date).getMonth() + 1,
    ),
    [specialDay, setSpecialDay] = useState(
      modal.special?.day ?? localDate(date).getDate(),
    ),
    [leap, setLeap] = useState(modal.special?.leap ?? false),
    [leads, setLeads] = useState<number[]>(modal.special?.leadDays ?? [0, 1]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const editing = !!(modal.task || modal.note || modal.special);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const now = stamp();
    try {
      if (tab === "task")
        await dispatch({
          type: "task.save",
          value: {
            id: modal.task?.id ?? uid(),
            title,
            body,
            date: entryDate || null,
            time,
            repeat: entryDate ? repeat : "none",
            endDate: entryDate && repeat !== "none" && endDate ? endDate : null,
            remind: !!entryDate && remind,
            completedDates: modal.task?.completedDates ?? [],
            createdAt: modal.task?.createdAt ?? now,
            updatedAt: now,
          },
        });
      if (tab === "note")
        await dispatch({
          type: "note.save",
          value: {
            id: modal.note?.id ?? uid(),
            title,
            body,
            date: entryDate || null,
            pinned,
            createdAt: modal.note?.createdAt ?? now,
            updatedAt: now,
          },
        });
      if (tab === "special")
        await dispatch({
          type: "special.save",
          value: {
            id: modal.special?.id ?? uid(),
            title,
            kind: specialKind,
            calendar,
            month: specialMonth,
            day: specialDay,
            leap: calendar === "lunar" && leap,
            remind,
            leadDays: leads.length ? leads : [0],
            time,
          },
        });
      onClose();
    } catch (e) {
      setError(cleanError(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!confirm("删除这条记录此操作无法撤销")) return;
    setBusy(true);
    try {
      if (modal.task)
        await dispatch({ type: "task.delete", id: modal.task.id });
      if (modal.note)
        await dispatch({ type: "note.delete", id: modal.note.id });
      if (modal.special)
        await dispatch({ type: "special.delete", id: modal.special.id });
      onClose();
    } catch (e) {
      setError(cleanError(e));
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="entry-form">
      {!editing && (
        <div className="segmented">
          <button
            type="button"
            className={tab === "task" ? "active" : ""}
            onClick={() => setTab("task")}
          >
            <CheckCheck size={15} />
            待办
          </button>
          <button
            type="button"
            className={tab === "note" ? "active" : ""}
            onClick={() => setTab("note")}
          >
            <Pencil size={14} />
            备忘
          </button>
          <button
            type="button"
            className={tab === "special" ? "active" : ""}
            onClick={() => setTab("special")}
          >
            <Heart size={14} />
            重要日期
          </button>
        </div>
      )}
      <Field label={tab === "special" ? "想记住的日子" : "标题"}>
        <input
          autoFocus
          aria-label="标题"
          required
          maxLength={200}
          value={title}
          placeholder={tab === "special" ? "比如妈妈的生日" : "比如买日用品"}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      {tab !== "special" && (
        <>
          <Field label="补充几句">
            <textarea
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="细节灵感或者想对自己说的话"
            />
          </Field>
          <Field label="日期" hint="留空时保存为不指定日期的记录">
            <input
              type="date"
              min="1900-01-01"
              max="2100-12-31"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
            />
          </Field>
        </>
      )}
      {tab === "task" && (
        <>
          <div className="form-row">
            <Field label="时间">
              <input
                type="time"
                required
                value={time}
                onChange={(e) => setTime(e.target.value)}
                disabled={!entryDate}
              />
            </Field>
            <Field label="重复">
              <select
                value={repeat}
                onChange={(e) => setRepeat(e.target.value as Task["repeat"])}
                disabled={!entryDate}
              >
                {Object.entries(repeatLabels).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {repeat !== "none" && entryDate && (
            <Field label="重复到可留空">
              <input
                type="date"
                min={entryDate}
                max="2100-12-31"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </Field>
          )}
          <Toggle checked={remind && !!entryDate} onChange={setRemind}>
            到时间提醒我
          </Toggle>
          {modal.task?.date &&
            !modal.task.completedDates.includes(modal.task.date) && (
              <button
                type="button"
                className="btn"
                onClick={() =>
                  void dispatch({
                    type: "snooze",
                    taskId: modal.task!.id,
                    date:
                      modal.task!.repeat === "none" ? modal.task!.date! : date,
                  })
                    .then(onClose)
                    .catch((e) => setError(cleanError(e)))
                }
              >
                <Clock3 size={14} />
                十分钟后再提醒
              </button>
            )}
        </>
      )}
      {tab === "note" && (
        <Toggle checked={pinned} onChange={setPinned}>
          置顶这条备忘
        </Toggle>
      )}
      {tab === "special" && (
        <>
          <div className="form-row">
            <Field label="日期类型">
              <select
                value={specialKind}
                onChange={(e) =>
                  setSpecialKind(e.target.value as SpecialDate["kind"])
                }
              >
                <option value="birthday">生日</option>
                <option value="anniversary">纪念日</option>
              </select>
            </Field>
            <Field label="历法">
              <select
                value={calendar}
                onChange={(e) =>
                  setCalendar(e.target.value as SpecialDate["calendar"])
                }
              >
                <option value="solar">公历</option>
                <option value="lunar">农历</option>
              </select>
            </Field>
          </div>
          <div className="form-row">
            <Field label="月份">
              <select
                value={specialMonth}
                onChange={(e) => setSpecialMonth(Number(e.target.value))}
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option value={i + 1} key={i}>
                    {i + 1} 月
                  </option>
                ))}
              </select>
            </Field>
            <Field label="日期">
              <input
                type="number"
                required
                min={1}
                max={calendar === "lunar" ? 30 : 31}
                value={specialDay}
                onChange={(e) => setSpecialDay(Number(e.target.value))}
              />
            </Field>
          </div>
          {calendar === "lunar" && (
            <>
              <Toggle checked={leap} onChange={setLeap}>
                这是闰月生日 纪念日
              </Toggle>
              <p className="field-hint">
                没有对应闰月的年份按同名普通月份提醒缺少的日期取月末
              </p>
            </>
          )}
          <Toggle checked={remind} onChange={setRemind}>
            每年提醒我
          </Toggle>
          {remind && (
            <>
              <Field label="提醒时间">
                <input
                  type="time"
                  required
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </Field>
              <div className="field">
                <span>提前提醒</span>
                <div className="choice-row">
                  {[0, 1, 3, 7].map((n) => (
                    <button
                      type="button"
                      key={n}
                      className={`choice ${leads.includes(n) ? "chosen" : ""}`}
                      onClick={() =>
                        setLeads(
                          leads.includes(n)
                            ? leads.filter((v) => v !== n)
                            : [...leads, n],
                        )
                      }
                    >
                      {n ? `提前 ${n} 天` : "当天"}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-footer">
        {editing ? (
          <button
            type="button"
            disabled={busy}
            className="text-btn danger"
            onClick={() => void remove()}
          >
            <Trash2 size={14} />
            删除
          </button>
        ) : (
          <span />
        )}
        <button
          className="btn primary"
          disabled={busy || !title.trim()}
          type="submit"
        >
          {busy ? "正在保存" : "好记下了"}
          <Check size={15} />
        </button>
      </div>
    </form>
  );
}
function cleanError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  try {
    const start = message.indexOf("["),
      issues = JSON.parse(message.slice(start));
    if (Array.isArray(issues)) return issues.map((i) => i.message).join("");
  } catch {}
  return message.replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    "",
  );
}

function NotesPage({
  state,
  dispatch,
  onAdd,
}: {
  state: AppState;
  dispatch: Dispatch;
  onAdd: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(
      state.notes[0]?.id ?? null,
    ),
    [filter, setFilter] = useState(""),
    [draft, setDraft] = useState<Note | null>(null),
    [saveStatus, setSaveStatus] = useState("所有修改已保存");
  const notes = [...state.notes]
    .filter((n) =>
      (n.title + n.body).toLowerCase().includes(filter.toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        b.updatedAt.localeCompare(a.updatedAt),
    );
  const selectedNote = state.notes.find((n) => n.id === selected);
  useEffect(() => {
    if (!selectedNote && notes.length) setSelected(notes[0].id);
  }, [state.notes.length, selected]);
  useEffect(() => {
    setDraft(selectedNote ? { ...selectedNote } : null);
    setSaveStatus("所有修改已保存");
  }, [selected]);
  useEffect(() => {
    if (!draft || !selectedNote) return;
    if (
      draft.title === selectedNote.title &&
      draft.body === selectedNote.body &&
      draft.date === selectedNote.date
    )
      return;
    setSaveStatus("正在保存");
    const timer = setTimeout(() => {
      if (!draft.title.trim()) {
        setSaveStatus("请填写标题后保存");
        return;
      }
      void dispatch({ type: "note.save", value: draft })
        .then(() => setSaveStatus("所有修改已保存"))
        .catch(() => setSaveStatus("保存失败请重试"));
    }, 500);
    return () => clearTimeout(timer);
  }, [draft]);
  // Flush the active draft before switching or leaving the notes page.
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  const persistDraft = () => {
    const d = latestDraft.current;
    if (
      d?.title.trim() &&
      (d.title !== selectedNote?.title ||
        d.body !== selectedNote?.body ||
        d.date !== selectedNote?.date)
    )
      void dispatch({ type: "note.save", value: d }).catch(() => {});
  };
  useEffect(
    () => () => {
      const d = latestDraft.current;
      if (d?.title.trim())
        void window.huazheshu
          .command({ type: "note.save", value: d })
          .catch(() => {});
    },
    [],
  );
  function changeNote(id: string) {
    persistDraft();
    setSelected(id);
  }
  return (
    <>
      <div className="page-title">
        <h1>备忘</h1>
      </div>
      <div className="notes-layout">
        <section className="notes-list">
          <div className="section-heading">
            <h2>
              我的备忘 <span className="count">{state.notes.length}</span>
            </h2>
            <IconButton label="新建备忘" onClick={onAdd}>
              <Plus size={18} />
            </IconButton>
          </div>
          <div className="local-search">
            <Search size={15} />
            <input
              aria-label="筛选备忘"
              placeholder="找一条备忘"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          {notes.length ? (
            notes.map((n) => (
              <button
                key={n.id}
                className={`note-card ${selected === n.id ? "active" : ""}`}
                onClick={() => changeNote(n.id)}
              >
                <div>
                  <strong>{n.title}</strong>
                  {n.pinned && <Pin size={14} />}
                </div>
                <p>{n.body || "还没有写正文"}</p>
                <small>
                  {n.date
                    ? shortDate(n.date)
                    : shortDate(dateKey(new Date(n.updatedAt)))}
                </small>
              </button>
            ))
          ) : (
            <Empty
              icon={<Pencil size={26} />}
              action={
                <button className="btn" onClick={onAdd}>
                  <Plus size={14} />
                  新建备忘
                </button>
              }
            >
              暂无备忘
            </Empty>
          )}
        </section>
        <section className="note-editor">
          {draft && selectedNote ? (
            <>
              <div className="editor-tools">
                <span className="eyebrow">
                  <span className="online-dot" />
                  {saveStatus}
                </span>
                <div className="inline-actions">
                  <IconButton
                    label={selectedNote.pinned ? "取消置顶" : "置顶备忘"}
                    onClick={() =>
                      void dispatch({
                        type: "note.save",
                        value: { ...draft, pinned: !selectedNote.pinned },
                      })
                        .then(() =>
                          setDraft((d) =>
                            d ? { ...d, pinned: !selectedNote.pinned } : d,
                          ),
                        )
                        .catch(() => {})
                    }
                  >
                    <Pin
                      size={17}
                      fill={selectedNote.pinned ? "currentColor" : "none"}
                    />
                  </IconButton>
                  <IconButton
                    label="删除备忘"
                    onClick={() => {
                      if (confirm("删除这条备忘"))
                        void dispatch({
                          type: "note.delete",
                          id: selectedNote.id,
                        })
                          .then(() => {
                            latestDraft.current = null;
                            setSelected(null);
                            setDraft(null);
                          })
                          .catch(() => {});
                    }}
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </div>
              </div>
              <input
                className="editor-title"
                aria-label="备忘标题"
                maxLength={200}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
              <div className="editor-date">
                <CalendarDays size={14} />
                <input
                  aria-label="备忘关联日期"
                  type="date"
                  min="1900-01-01"
                  max="2100-12-31"
                  value={draft.date ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, date: e.target.value || null })
                  }
                />
                <span>可留空</span>
              </div>
              <textarea
                className="editor-body"
                aria-label="备忘正文"
                placeholder="从这里开始写下你的想法"
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              />
            </>
          ) : (
            <Empty
              icon={<Leaf size={34} />}
              action={
                <button className="btn primary" onClick={onAdd}>
                  <Plus size={14} />
                  写一条备忘
                </button>
              }
            >
              选择一条备忘开始编辑
            </Empty>
          )}
        </section>
      </div>
    </>
  );
}
function SchedulePage({
  state,
  today,
  dispatch,
  onRange,
  onOverride,
}: {
  state: AppState;
  today: string;
  dispatch: Dispatch;
  onRange: (r?: DateRange) => void;
  onOverride: (d: string) => void;
}) {
  const current = planOn(state, today),
    [draft, setDraft] = useState<SchedulePlan>({
      ...current,
      id: uid(),
      effectiveFrom: today,
    }),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false);
  const set = <K extends keyof SchedulePlan>(
    key: K,
    value: SchedulePlan[K],
  ) => {
    setSaved(false);
    setDraft((d) => ({ ...d, [key]: value }));
  };
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await dispatch({
        type: "plan.save",
        value: { ...draft, id: uid(), updatedAt: stamp() },
      });
      setSaved(true);
    } catch (e) {
      setError(cleanError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="schedule-layout">
      <section className="surface schedule-form">
        <div className="section-heading">
          <div>
            <h2>我的作息规则</h2>
          </div>
          <CalendarDays size={23} />
        </div>
        <form onSubmit={submit}>
          <Field label="生活状态">
            <div className="identity-options">
              {(
                [
                  ["worker", "打工人", <Coffee size={18} />],
                  ["student", "学生", <GraduationCap size={18} />],
                  ["custom", "自定义", <Leaf size={18} />],
                ] as const
              ).map(([identity, label, icon]) => (
                <button
                  key={identity}
                  type="button"
                  className={draft.identity === identity ? "chosen" : ""}
                  onClick={() => set("identity", identity)}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="规则名称">
            <input
              required
              maxLength={200}
              value={draft.label}
              onChange={(e) => set("label", e.target.value)}
            />
          </Field>
          <Field label="安排方式">
            <div className="segmented">
              <button
                type="button"
                className={draft.mode === "weekly" ? "active" : ""}
                onClick={() => {
                  set("mode", "weekly");
                  set("followOfficial", true);
                }}
              >
                每周固定
              </button>
              <button
                type="button"
                className={draft.mode === "cycle" ? "active" : ""}
                onClick={() => {
                  set("mode", "cycle");
                  set("followOfficial", false);
                }}
              >
                循环排班
              </button>
            </div>
          </Field>
          {draft.mode === "weekly" ? (
            <div className="field">
              <span>
                {draft.identity === "student"
                  ? "每周哪些天在校"
                  : "每周哪些天忙碌"}
              </span>
              <div className="week-choices">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={draft.weekdays.includes(d)}
                    className={draft.weekdays.includes(d) ? "chosen" : ""}
                    onClick={() =>
                      set(
                        "weekdays",
                        draft.weekdays.includes(d)
                          ? draft.weekdays.filter((v) => v !== d)
                          : [...draft.weekdays, d],
                      )
                    }
                  >
                    周{weekdays[d]}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="field">
                <span>先选一个常用循环</span>
                <div className="choice-row">
                  <button
                    type="button"
                    className="choice"
                    onClick={() =>
                      set("cycle", [
                        "duty",
                        "duty",
                        "duty",
                        "duty",
                        "rest",
                        "rest",
                      ])
                    }
                  >
                    上四休二
                  </button>
                  <button
                    type="button"
                    className="choice"
                    onClick={() =>
                      set("cycle", [
                        "duty",
                        "duty",
                        "duty",
                        "duty",
                        "duty",
                        "rest",
                        "rest",
                      ])
                    }
                  >
                    上五休二
                  </button>
                  <button
                    type="button"
                    className="choice"
                    onClick={() =>
                      set("cycle", [
                        "duty",
                        "duty",
                        "duty",
                        "duty",
                        "duty",
                        "duty",
                        "rest",
                        "duty",
                        "duty",
                        "duty",
                        "duty",
                        "duty",
                        "rest",
                        "rest",
                      ])
                    }
                  >
                    大小周
                  </button>
                </div>
              </div>
              <Field label="循环起始日" hint="所选日期对应下面循环的第 1 天">
                <input
                  type="date"
                  required
                  min="1900-01-01"
                  max="2100-12-31"
                  value={draft.anchor}
                  onChange={(e) => set("anchor", e.target.value)}
                />
              </Field>
              <div className="field">
                <span>点一下切换忙碌 休息</span>
                <div className="cycle-choices">
                  {draft.cycle.map((kind, i) => (
                    <button
                      type="button"
                      className={kind === "duty" ? "duty" : "rest"}
                      key={i}
                      aria-label={`循环第${i + 1}天 ${kind === "duty" ? "忙碌" : "休息"}`}
                      onClick={() =>
                        set(
                          "cycle",
                          draft.cycle.map((v, j) =>
                            j === i ? (v === "duty" ? "rest" : "duty") : v,
                          ),
                        )
                      }
                    >
                      <small>{i + 1}</small>
                      {kind === "duty" ? "班" : "休"}
                    </button>
                  ))}
                </div>
                <div className="inline-actions">
                  <button
                    type="button"
                    className="text-btn"
                    onClick={() => set("cycle", [...draft.cycle, "rest"])}
                    disabled={draft.cycle.length >= 366}
                  >
                    <Plus size={13} />
                    加一天
                  </button>
                  <button
                    type="button"
                    className="text-btn"
                    onClick={() => set("cycle", draft.cycle.slice(0, -1))}
                    disabled={draft.cycle.length <= 1}
                  >
                    减一天
                  </button>
                </div>
              </div>
            </>
          )}
          {draft.identity === "student" && (
            <div className="form-row">
              <Field label="学期开始可留空">
                <input
                  type="date"
                  min="1900-01-01"
                  max="2100-12-31"
                  value={draft.termStart ?? ""}
                  onChange={(e) => set("termStart", e.target.value || null)}
                />
              </Field>
              <Field label="学期结束可留空">
                <input
                  type="date"
                  min={draft.termStart ?? "1900-01-01"}
                  max="2100-12-31"
                  value={draft.termEnd ?? ""}
                  onChange={(e) => set("termEnd", e.target.value || null)}
                />
              </Field>
            </div>
          )}
          <Toggle
            checked={draft.followOfficial}
            onChange={(v) => set("followOfficial", v)}
          >
            跟随国家放假与调休
          </Toggle>
          <Field label="从哪一天生效" hint="此前的规则仍保留用于查看过去的安排">
            <input
              type="date"
              min="1900-01-01"
              max="2100-12-31"
              required
              value={draft.effectiveFrom}
              onChange={(e) => set("effectiveFrom", e.target.value)}
            />
          </Field>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="btn primary full-width"
            disabled={busy}
            type="submit"
          >
            {saved ? (
              <>
                <Check size={15} />
                作息已保存
              </>
            ) : (
              <>
                保存我的作息
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </form>
      </section>
      <div className="schedule-right">
        <section className="surface">
          <div className="section-heading">
            <div>
              <h2>接下来两周</h2>
            </div>
          </div>
          <div className="schedule-preview">
            {Array.from({ length: 14 }, (_, i) => {
              const date = addDays(today, i),
                info = resolveDay(state, date);
              return (
                <button
                  key={date}
                  onClick={() => onOverride(date)}
                  className={info.kind === "rest" ? "rest" : ""}
                >
                  <small>
                    {i === 0
                      ? "今天"
                      : "周" + weekdays[localDate(date).getDay()]}
                  </small>
                  <strong>{Number(date.slice(-2))}</strong>
                  <span>{info.label}</span>
                </button>
              );
            })}
          </div>
          <p className="field-hint">
            这里显示已保存的实际安排点某一天可单独修改
          </p>
        </section>
        <section className="surface">
          <div className="section-heading">
            <div>
              <h2>假期与特别安排</h2>
            </div>
            <IconButton label="新增假期区间" onClick={() => onRange()}>
              <Plus size={18} />
            </IconButton>
          </div>
          {state.ranges.length ? (
            [...state.ranges]
              .sort((a, b) => a.from.localeCompare(b.from))
              .map((r) => (
                <div className="arrangement-row" key={r.id}>
                  <div
                    className={`round-symbol ${r.kind === "rest" ? "olive-bg" : ""}`}
                  >
                    {r.kind === "rest" ? (
                      <Coffee size={17} />
                    ) : (
                      <CalendarDays size={17} />
                    )}
                  </div>
                  <button
                    className="arrangement-content"
                    onClick={() => onRange(r)}
                  >
                    <strong>{r.label}</strong>
                    <small>
                      {r.from} → {r.to}
                    </small>
                  </button>
                  <IconButton
                    label={`删除 ${r.label}`}
                    onClick={() => {
                      if (confirm(`删除${r.label}的区间安排`))
                        void dispatch({ type: "range.delete", id: r.id }).catch(
                          () => {},
                        );
                    }}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              ))
          ) : (
            <Empty
              icon={<Coffee size={25} />}
              action={
                <button className="btn" onClick={() => onRange()}>
                  <Plus size={14} />
                  添加寒暑假 年假
                </button>
              }
            >
              暂无假期安排
            </Empty>
          )}
        </section>
        {state.overrides.length > 0 && (
          <section className="surface">
            <div className="section-heading">
              <h2>单日修改</h2>
            </div>
            {[...state.overrides]
              .sort((a, b) => b.id.localeCompare(a.id))
              .map((o) => (
                <div className="arrangement-row" key={o.id}>
                  <button
                    className="arrangement-content"
                    onClick={() => onOverride(o.id)}
                  >
                    <strong>{o.label}</strong>
                    <small>{o.id}</small>
                  </button>
                  <IconButton
                    label={`恢复 ${o.id} 默认安排`}
                    onClick={() =>
                      void dispatch({
                        type: "override.delete",
                        id: o.id,
                      }).catch(() => {})
                    }
                  >
                    <RotateCcw size={15} />
                  </IconButton>
                </div>
              ))}
          </section>
        )}
        <details className="rule-details">
          <summary>规则优先级与历史{state.plans.length} 个版本</summary>
          <p>
            单日修改 ＞ 自定义区间 ＞ 已启用的国家调休 ＞
            基础作息区间重叠时最后保存的生效
          </p>
          {[...state.plans]
            .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
            .map((p) => (
              <p key={p.id}>
                {p.label}{" "}
                {p.effectiveFrom === "1900-01-01"
                  ? "初始默认"
                  : p.effectiveFrom + " 起"}{" "}
                {p.mode === "weekly" ? "每周固定" : "循环排班"}
              </p>
            ))}
        </details>
      </div>
    </div>
  );
}
function RangeForm({
  range,
  date,
  dispatch,
  onClose,
}: {
  range?: DateRange;
  date: string;
  dispatch: Dispatch;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(range?.label ?? ""),
    [from, setFrom] = useState(range?.from ?? date),
    [to, setTo] = useState(range?.to ?? date),
    [kind, setKind] = useState<"duty" | "rest">(range?.kind ?? "rest"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="entry-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await dispatch({
            type: "range.save",
            value: {
              id: range?.id ?? uid(),
              label,
              from,
              to,
              kind,
              updatedAt: stamp(),
            },
          });
          onClose();
        } catch (e) {
          setError(cleanError(e));
          setBusy(false);
        }
      }}
    >
      <Field label="这段日子的名字">
        <input
          required
          maxLength={200}
          value={label}
          placeholder="比如寒假年假考试周"
          onChange={(e) => setLabel(e.target.value)}
        />
      </Field>
      <div className="form-row">
        <Field label="开始日期">
          <input
            type="date"
            required
            min="1900-01-01"
            max="2100-12-31"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="结束日期">
          <input
            type="date"
            required
            min={from}
            max="2100-12-31"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
      </div>
      <Field label="整段时间的状态">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "duty" | "rest")}
        >
          <option value="rest">休息 放假</option>
          <option value="duty">工作 在校</option>
        </select>
      </Field>
      <p className="field-hint">
        包含起止当天覆盖这段时间的周制轮班与国家调休学期内仍按每周作息时请使用我的作息中的学期日期
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button disabled={busy} className="btn primary full-width" type="submit">
        保存安排
        <Check size={15} />
      </button>
    </form>
  );
}
function OverrideForm({
  state,
  date,
  dispatch,
  onClose,
}: {
  state: AppState;
  date: string;
  dispatch: Dispatch;
  onClose: () => void;
}) {
  const current = resolveDay(state, date),
    [label, setLabel] = useState(current.label),
    [kind, setKind] = useState(current.kind),
    [error, setError] = useState("");
  return (
    <form
      className="entry-form"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await dispatch({
            type: "override.save",
            value: { id: date, label, kind },
          });
          onClose();
        } catch (e) {
          setError(cleanError(e));
        }
      }}
    >
      <p className="field-hint">只修改 {date}其他日期继续按原来的规则</p>
      <Field label="状态">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "duty" | "rest")}
        >
          <option value="rest">休息 放假</option>
          <option value="duty">工作 在校</option>
        </select>
      </Field>
      <Field label="给这天起个名字">
        <input
          required
          maxLength={200}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="比如调休请假临时加班"
        />
      </Field>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="form-footer">
        {state.overrides.some((o) => o.id === date) ? (
          <button
            type="button"
            className="text-btn"
            onClick={() =>
              void dispatch({ type: "override.delete", id: date })
                .then(onClose)
                .catch((e) => setError(cleanError(e)))
            }
          >
            <RotateCcw size={14} />
            恢复默认规则
          </button>
        ) : (
          <span />
        )}
        <button className="btn primary" type="submit">
          保存安排
          <Check size={14} />
        </button>
      </div>
    </form>
  );
}
function SpecialPage({
  state,
  today,
  dispatch,
  onEdit,
}: {
  state: AppState;
  today: string;
  dispatch: Dispatch;
  onEdit: (s?: SpecialDate) => void;
}) {
  return (
    <div className="special-layout">
      <section>
        <div className="section-heading">
          <div>
            <h2>生日与纪念日</h2>
          </div>
          <button className="btn primary" onClick={() => onEdit()}>
            <Plus size={15} />
            添加日期
          </button>
        </div>
        {state.specials.length ? (
          <div className="personal-grid">
            {state.specials.map((s) => {
              const next = nextSpecial(s, today);
              return (
                <button
                  className="personal-card"
                  key={s.id}
                  onClick={() => onEdit(s)}
                >
                  <div className="personal-top">
                    <span className="round-symbol olive-bg">
                      {s.kind === "birthday" ? (
                        <Cake size={21} />
                      ) : (
                        <Heart size={20} />
                      )}
                    </span>
                    {s.remind ? <Bell size={16} /> : <BellOff size={16} />}
                  </div>
                  <h3>{s.title}</h3>
                  <p>
                    {s.calendar === "lunar" ? "农历" : "公历"}
                    {s.leap ? "闰" : ""}
                    {s.month}月{s.day}日
                  </p>
                  <div>
                    <strong>{next ? daysBetween(today, next) : "—"}</strong>
                    <span>{next === today ? "就是今天" : "天后"}</span>
                    <small>{next ? shortDate(next) : ""}</small>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="surface">
            <Empty
              icon={<Heart size={35} />}
              action={
                <button className="btn" onClick={() => onEdit()}>
                  <Plus size={15} />
                  记住一个重要日期
                </button>
              }
            >
              暂无生日或纪念日
            </Empty>
          </div>
        )}
      </section>
      <aside className="surface festivals-panel">
        <div className="section-heading">
          <div>
            <h2>一年里的节日</h2>
          </div>
          <Sparkles size={20} />
        </div>
        <p className="field-hint">
          节日会一直显示在日历上勾选后在节日前一天提醒你
        </p>
        <Toggle
          checked={state.settings.festivalReminders}
          onChange={(v) =>
            void dispatch({
              type: "settings.save",
              value: { ...state.settings, festivalReminders: v },
            }).catch(() => {})
          }
        >
          开启公共节日提醒
        </Toggle>
        {allFestivals.map((f) => (
          <label className="festival-toggle" key={f.id}>
            <span>{f.title}</span>
            <input
              type="checkbox"
              checked={!state.settings.disabledFestivals.includes(f.id)}
              disabled={!state.settings.festivalReminders}
              onChange={(e) =>
                void dispatch({
                  type: "settings.save",
                  value: {
                    ...state.settings,
                    disabledFestivals: e.target.checked
                      ? state.settings.disabledFestivals.filter(
                          (id) => id !== f.id,
                        )
                      : [...state.settings.disabledFestivals, f.id],
                  },
                }).catch(() => {})
              }
            />
          </label>
        ))}
      </aside>
    </div>
  );
}
function SettingsPanel({
  state,
  dispatch,
  message,
  onBeforeRestore,
}: {
  state: AppState;
  dispatch: Dispatch;
  message: (s: string) => void;
  onBeforeRestore: () => void;
}) {
  const [info, setInfo] = useState<{
      version: string;
      dataPath: string;
      platform: string;
    } | null>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    window.huazheshu
      .getAppInfo()
      .then(setInfo)
      .catch(() => {});
  }, []);
  const update = (value: Partial<AppState["settings"]>) =>
    void dispatch({
      type: "settings.save",
      value: { ...state.settings, ...value },
    }).catch(() => {});
  return (
    <div className="settings-panel">
      <section>
        <h3>日常偏好</h3>
        <Toggle
          checked={state.settings.startAtLogin}
          onChange={(v) => update({ startAtLogin: v })}
        >
          开机后在托盘启动
        </Toggle>
        <Toggle
          checked={state.settings.reduceMotion}
          onChange={(v) => update({ reduceMotion: v })}
        >
          减少界面动效
        </Toggle>
        <p className="field-hint">
          也会跟随 Windows
          的减少动画设置关闭窗口后保留托盘提醒从托盘选择退出会停止提醒
        </p>
      </section>
      <section>
        <h3>提醒</h3>
        <Toggle
          checked={state.settings.festivalReminders}
          onChange={(v) => update({ festivalReminders: v })}
        >
          节日前一天提醒我
        </Toggle>
        <Field label="公共节日提醒时间">
          <input
            type="time"
            required
            value={state.settings.festivalTime}
            onChange={(e) => {
              if (e.target.value) update({ festivalTime: e.target.value });
            }}
          />
        </Field>
        <button
          className="btn"
          onClick={() =>
            void window.huazheshu
              .testNotification()
              .then((ok) =>
                message(
                  ok
                    ? "已发送测试通知请查看 Windows 通知中心"
                    : "当前系统暂不支持通知",
                ),
              )
              .catch((e) => message(cleanError(e)))
          }
        >
          <Bell size={15} />
          发送一条测试提醒
        </button>
        <p className="field-hint">
          若未看到通知请检查 Windows
          的通知权限和勿扰设置错过的提醒会保留在日历中
        </p>
        {state.deliveries.length > 0 && (
          <details className="rule-details">
            <summary>最近的提醒记录{state.deliveries.length}</summary>
            {state.deliveries
              .slice(-15)
              .reverse()
              .map((d) => (
                <p key={d.id}>
                  {d.title} {shortDate(dateKey(new Date(d.deliveredAt)))}{" "}
                  {new Date(d.deliveredAt).toLocaleTimeString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {d.failed ? "  发送失败" : "  已发送"}
                </p>
              ))}
          </details>
        )}
      </section>
      <section>
        <h3>数据与备份</h3>
        <p>所有记录仅保存在这台电脑无需注册每日首次启动自动备份保留最近七份</p>
        <div className="backup-actions">
          <button
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const path = await window.huazheshu.exportBackup();
                if (path) message("备份已导出" + path);
              } catch (e) {
                message(cleanError(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <ArrowDownToLine size={15} />
            导出备份
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                onBeforeRestore();
                const result = await window.huazheshu.importBackup();
                if (!result.cancelled) message("备份已恢复原有数据已自动备份");
              } catch (e) {
                message(cleanError(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <ArrowUpFromLine size={15} />
            恢复备份
          </button>
          <button
            className="btn"
            onClick={() =>
              void window.huazheshu
                .openDataFolder()
                .catch((e) => message(cleanError(e)))
            }
          >
            <FolderOpen size={15} />
            数据文件夹
          </button>
        </div>
        {info && <code className="data-path">{info.dataPath}</code>}
      </section>
      <section>
        <h3>关于划着数</h3>
        <p>版本 {info?.version ?? "0.2.0"} 本地优先 免费使用</p>
        <p className="field-hint">
          内置中国大陆 2026—2027
          年国家放假调休其他年份会提示未收录节日当天与个人实际休假分别计算新版安装会保留记录重要数据也建议定期导出备份
        </p>
        <p className="field-hint">
          视觉参考 SQSP Weekly使用 ReactElectronSQLiteLucide 和 lunar-typescript
          等开源项目源码中附有来源及许可说明
        </p>
      </section>
    </div>
  );
}
