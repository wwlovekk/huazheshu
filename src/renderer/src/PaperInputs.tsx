import { useEffect, useRef, useState, type FormEvent } from "react";
import { Pencil, Plus } from "lucide-react";
import type { Command, Note } from "../../shared/types";

type Dispatch = (command: Command) => Promise<void>;

export function QuickTaskInput({
  date,
  dispatch,
}: {
  date: string;
  dispatch: Dispatch;
}) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const composing = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || busy || composing.current) return;
    setBusy(true);
    const now = new Date().toISOString();
    try {
      await dispatch({
        type: "task.save",
        value: {
          id: crypto.randomUUID(),
          title: title.trim(),
          body: "",
          date,
          time: "09:00",
          remind: true,
          repeat: "none",
          endDate: null,
          completedDates: [],
          createdAt: now,
          updatedAt: now,
        },
      });
      setTitle("");
    } catch {
      /* The shared dispatch displays the existing error message. */
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="task-quick-add" onSubmit={submit}>
      <span className="quick-task-square" aria-hidden="true" />
      <input
        aria-label="快捷添加待办"
        placeholder="写下今天要做的事..."
        maxLength={200}
        value={title}
        readOnly={busy}
        onChange={(event) => setTitle(event.target.value)}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
        }}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            (event.nativeEvent.isComposing ||
              event.nativeEvent.keyCode === 229 ||
              composing.current)
          )
            event.preventDefault();
        }}
      />
    </form>
  );
}

export function PaperNoteSheet({
  notes,
  date,
  dispatch,
  onEdit,
  onAdd,
}: {
  notes: Note[];
  date: string;
  dispatch: Dispatch;
  onEdit: (note: Note) => void;
  onAdd: () => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const draftId = useRef(crypto.randomUUID());
  const note = notes.find((item) => item.id === activeId) ?? notes[0];
  return (
    <section className="sticky-note" aria-label="随手记便签">
      <div className="sticky-heading">
        <h3>随手记</h3>
        <div className="inline-actions">
          {note && (
            <button
              className="icon-btn"
              aria-label="编辑当前备忘"
              title="编辑标题和日期"
              onClick={() => {
                void window.huazheshu
                  .getState()
                  .then((current) =>
                    onEdit(
                      current.notes.find((item) => item.id === note.id) ?? note,
                    ),
                  )
                  .catch(() => {});
              }}
            >
              <Pencil size={13} />
            </button>
          )}
          <button
            className="icon-btn"
            aria-label="新增备忘"
            title="新增备忘"
            onClick={onAdd}
          >
            <Plus size={15} />
          </button>
        </div>
      </div>
      {notes.length > 1 && (
        <select
          className="sticky-selector"
          aria-label="切换当天备忘"
          value={note?.id ?? ""}
          onChange={(event) => setActiveId(event.target.value)}
        >
          {notes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      )}
      <DayNoteEditor
        key={`${date}:${note?.id ?? draftId.current}`}
        note={note}
        draftId={draftId.current}
        date={date}
        dispatch={dispatch}
      />
    </section>
  );
}

function DayNoteEditor({
  note,
  draftId,
  date,
  dispatch,
}: {
  note?: Note;
  draftId: string;
  date: string;
  dispatch: Dispatch;
}) {
  const [value, setValue] = useState(note?.body ?? "");
  const [status, setStatus] = useState("自动保存");
  const noteId = useRef(note?.id ?? draftId);
  const latestNote = useRef(note);
  const draft = useRef(value);
  const saved = useRef(note?.body ?? "");
  const dirty = useRef(false);
  const mounted = useRef(true);
  const dispatchRef = useRef(dispatch);
  latestNote.current = note;
  dispatchRef.current = dispatch;

  useEffect(() => {
    if (!dirty.current) {
      const body = note?.body ?? "";
      draft.current = body;
      saved.current = body;
      setValue(body);
    }
  }, [note?.body]);

  async function save(showStatus = true) {
    const body = draft.current;
    if (body === saved.current || (!latestNote.current && !body.trim())) return;
    const previous = saved.current;
    saved.current = body;
    const now = new Date().toISOString();
    const current = latestNote.current;
    const command: Command = {
      type: "note.save",
      value: {
        id: noteId.current,
        title:
          current?.title ??
          body
            .split(/\r?\n/)
            .find((line) => line.trim())
            ?.trim()
            .slice(0, 40) ??
          "随手记",
        body,
        date,
        pinned: current?.pinned ?? false,
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
      },
    };
    if (showStatus && mounted.current) setStatus("保存中");
    try {
      if (showStatus) await dispatchRef.current(command);
      else await window.huazheshu.command(command);
      if (draft.current === body) dirty.current = false;
      if (showStatus && mounted.current && !dirty.current) setStatus("已保存");
    } catch {
      if (saved.current === body) saved.current = previous;
      if (showStatus && mounted.current) setStatus("保存失败");
    }
  }
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (!dirty.current) return;
    const timer = setTimeout(() => {
      void saveRef.current();
    }, 500);
    return () => clearTimeout(timer);
  }, [value]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void saveRef.current(false);
    };
  }, []);

  return (
    <div className="sticky-editor">
      <textarea
        aria-label="当天随手记"
        placeholder="写点什么..."
        value={value}
        maxLength={200000}
        onChange={(event) => {
          draft.current = event.target.value;
          dirty.current = true;
          setValue(event.target.value);
          setStatus("保存中");
        }}
        onBlur={() => {
          void saveRef.current();
        }}
      />
      <span className="sticky-save-status" role="status">
        {status}
      </span>
    </div>
  );
}
