import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { matchesSearch, isNamed } from "./search";
const tabs = ["总览", "背包", "变量", "开关", "角色", "高级"];
function integer(v: string) {
  if (!/^-?\d+$/.test(v.trim())) throw Error("请输入完整整数，不能为空");
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw Error("数值超出安全整数范围");
  return n;
}
function App() {
  const [profile, setProfile] = useState<any>(),
    [doc, setDoc] = useState<any>(),
    [tab, setTab] = useState("总览"),
    [q, setQ] = useState(""),
    [page, setPage] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [exported, setExported] = useState(""),
    [hideUnnamed, setHideUnnamed] = useState(() => localStorage.getItem("hideUnnamedSwitches") !== "false"),
    [drafts, setDrafts] = useState(0);
  const signature = JSON.stringify(doc?.changes || []);
  const unexported = !!doc?.changes.length && signature !== exported;
  const running = React.useRef(false);
  React.useEffect(() => {
    const f = (e: BeforeUnloadEvent) => {
      if (unexported || drafts || busy) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    addEventListener("beforeunload", f);
    return () => removeEventListener("beforeunload", f);
  }, [unexported, drafts, busy]);
  const run = async (fn: () => Promise<any>) => {
    if (running.current) return;
    running.current = true;
    try {
      setBusy(true);
      setError("");
      return await fn();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
      running.current = false;
    }
  };
  const discard = () =>
    !unexported || confirm("当前存档有尚未导出的修改，确定放弃吗？");
  const pick = () => {
    if (discard())
      run(async () => {
        const p = await window.saveLab.pickGame();
        if (p) {
          setProfile(p);
          setDoc(null);
          setDrafts(0);
          setExported("");
        }
      });
  };
  const open = (n: string) => {
    if (doc?.name === n || !discard()) return;
    run(async () => {
      setDoc(await window.saveLab.openSave(profile.game, n));
      setDrafts(0);
      setExported("");
      setPage(0);
    });
  };
  const patch = async (p: any) =>
    setDoc(await window.saveLab.patch(doc.sessionId, p));
  const data = useMemo(
    () =>
      doc
        ? tab === "背包"
          ? doc.inventory
          : tab === "变量"
            ? doc.variables
            : tab === "开关"
              ? doc.switches
              : tab === "角色"
                ? doc.actors
                : []
        : [],
    [doc, tab],
  );
  const filtered = data.filter(
      (x: any) => matchesSearch(x, q) && (tab !== "开关" || !hideUnnamed || isNamed(x)),
    ),
    visible = filtered.slice(page * 100, page * 100 + 100);
  return (
    <main>
      <header>
        <button disabled={busy || drafts > 0} onClick={pick}>
          选择游戏目录
        </button>
        <div>
          <b>{profile?.title || "RPG Maker 存档实验室"}</b>
          <small>
            {profile
              ? `${profile.engine}　${profile.game}`
              : "请选择 RPG Maker 游戏目录"}
          </small>
        </div>
        {doc && (
          <>
            <button
              disabled={busy || drafts > 0 || !doc.canUndo}
              onClick={() =>
                run(async () =>
                  setDoc(await window.saveLab.undo(doc.sessionId)),
                )
              }
            >
              撤销
            </button>
            <button
              className="primary"
              disabled={busy || drafts > 0}
              onClick={() =>
                run(async () => {
                  const r = await window.saveLab.exportCopy(
                    doc.sessionId,
                    doc.name,
                  );
                  if (r) {
                    setExported(signature);
                    alert("已导出：" + r.target);
                  }
                })
              }
            >
              导出副本
            </button>
          </>
        )}
      </header>
      {error && <div className="error">{error}</div>}
      <div className="layout">
        <aside>
          <h3>存档</h3>
          {profile?.files.map((n: string) => (
            <button
              disabled={busy || drafts > 0}
              className={doc?.name === n ? "active" : ""}
              onClick={() => open(n)}
              key={n}
            >
              {n}
            </button>
          ))}
          <p>
            仅列出 file*{profile?.extension || ".rpgsave"}；不会覆盖游戏存档。
          </p>
        </aside>
        <section>
          {doc ? (
            <>
              <nav>
                {tabs.map((x) => (
                  <button
                    disabled={busy || drafts > 0}
                    className={tab === x ? "active" : ""}
                    onClick={() => {
                      setTab(x);
                      setQ("");
                      setPage(0);
                    }}
                    key={x}
                  >
                    {x}
                  </button>
                ))}
              </nav>
              {["背包", "变量", "开关", "角色"].includes(tab) && (
                <input
                  className="search"
                  disabled={busy || drafts > 0}
                  placeholder="搜索 ID、名称或 key 片段"
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(0);
                  }}
                />
              )}
              {tab === "开关" && <label className="filter-option">
                <input type="checkbox" checked={hideUnnamed} disabled={busy || drafts > 0}
                  onChange={e => {setHideUnnamed(e.target.checked); localStorage.setItem("hideUnnamedSwitches", String(e.target.checked)); setPage(0);}} />
                隐藏未命名开关
              </label>}
              {["背包", "变量", "开关", "角色"].includes(tab) && <p className="result-count">找到 {filtered.length} 项 · 支持名称 / key 片段匹配，多个关键词用空格分隔</p>}
              {tab === "角色" && <div className="actor-list">
                <p>基础值 = 当前等级成长值 + 永久加成。输入目标基础值后点击应用；装备、状态和增益由游戏另外叠加。</p>
                <p>当前 HP/MP 超过游戏实际最大值时，游戏可能自动限制；修改 HP 不会自动清除死亡等状态。</p>
                {visible.map((a: any) => <article className="actor-card" key={a.id}>
                  <h3>#{a.id} {a.name || "（未命名）"} <small>Lv.{a.level}</small></h3>
                  <div className="actor-grid">
                    {[{key:"hp",name:"当前 HP",value:a.hp},{key:"mp",name:"当前 MP",value:a.mp}].map(p => <Editor key={p.key} label={p.name} value={p.value} disabled={busy} dirtyCount={setDrafts}
                      save={v => run(() => patch({kind:"actor",id:a.id,field:p.key,value:integer(v)}))} />)}
                    {a.params.map((p: any) => <Editor key={p.key} label={`${p.name} (${p.key})`} value={p.value ?? "不可用"} disabled={busy || !p.editable} dirtyCount={setDrafts}
                      note={p.editable ? `等级成长 ${p.growth} · 永久加成 ${p.bonus} · 基础值范围 ${p.min}–${p.max}` : "缺少职业成长数据"}
                      save={v => run(() => patch({kind:"actor",id:a.id,field:p.key,value:integer(v)}))} />)}
                  </div>
                </article>)}
              </div>}
              {tab === "总览" && (
                <div className="cards">
                  <Editor
                    label="金币"
                    value={doc.gold}
                    disabled={busy}
                    dirtyCount={setDrafts}
                    save={(v) =>
                      run(() => patch({ kind: "gold", value: integer(v) }))
                    }
                  />
                  <article>
                    <label>当前位置</label>
                    <strong>
                      #{doc.map.id} {doc.map.name}
                    </strong>
                  </article>
                  <article>
                    <label>待导出修改</label>
                    <strong>{doc.changes.length} 项</strong>
                  </article>
                </div>
              )}
              {tab === "高级" && (
                <>
                  <h3>原始 JSON（只读）</h3>
                  <p>
                    保留 JsonEx 的 @、@c、@a、@r 元数据；此视图不允许直接修改。
                  </p>
                  <pre>{JSON.stringify(doc.raw, null, 2)}</pre>
                </>
              )}
              {["背包", "变量", "开关"].includes(tab) && (
                <>
                  <div className="table">
                    {visible.map((x: any) => (
                      <div className="row" key={(x.kind || tab) + x.id}>
                        <span>#{x.id}</span>
                        <div><b>{x.name || "（未命名）"}</b><small className="field-key">{x.key}</small></div>
                        {tab === "角色" ? (
                          <span>
                            Lv.{x.level}　HP {x.hp}　MP {x.mp}
                          </span>
                        ) : tab === "开关" ? (
                          <select
                            disabled={busy}
                            value={String(x.value)}
                            onChange={(e) =>
                              run(() =>
                                patch({
                                  kind: "switch",
                                  id: x.id,
                                  value: e.target.value === "true",
                                }),
                              )
                            }
                          >
                            <option value="true">开启</option>
                            <option value="false">关闭</option>
                          </select>
                        ) : (
                          <Editor
                            value={x.count ?? x.value}
                            disabled={busy}
                            dirtyCount={setDrafts}
                            save={(v) =>
                              run(() =>
                                patch({
                                  kind: x.kind || "variable",
                                  id: x.id,
                                  value:
                                    typeof (x.count ?? x.value) === "number"
                                      ? integer(v)
                                      : v,
                                }),
                              )
                            }
                            note={
                              x.limit
                                ? `${x.limit.source || "插件限定范围"} ${x.limit.min ?? 0}–${x.limit.max}${x.kind ? "；运行时覆盖未知" : ""}`
                                : ""
                            }
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  {filtered.length > 100 && (
                    <div className="pager">
                      <button
                        disabled={busy || drafts > 0 || !page}
                        onClick={() => setPage(page - 1)}
                      >
                        上一页
                      </button>
                      <span>
                        {page + 1} / {Math.ceil(filtered.length / 100)}
                      </span>
                      <button
                        disabled={busy || drafts > 0 || (page + 1) * 100 >= filtered.length}
                        onClick={() => setPage(page + 1)}
                      >
                        下一页
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="empty">选择左侧存档开始查看和修改</div>
          )}
        </section>
        <aside className="diff">
          <h3>修改差异</h3>
          {doc?.changes.map((d: any) => (
            <div key={d.path}>
              <code>{d.path}</code>
              <del>{JSON.stringify(d.before)}</del>
              <ins>{JSON.stringify(d.after)}</ins>
            </div>
          ))}
          {doc && !doc.changes.length && <p>尚无修改</p>}
        </aside>
      </div>
    </main>
  );
}
function Editor({
  label,
  value,
  save,
  note,
  disabled,
  dirtyCount,
}: {
  label?: string;
  value: any;
  save: (v: string) => Promise<any>;
  note?: string;
  disabled?: boolean;
  dirtyCount: React.Dispatch<React.SetStateAction<number>>;
}) {
  const [draft, setDraft] = useState(String(value)),
    [saving, setSaving] = useState(false),
    dirty = draft !== String(value);
  React.useEffect(() => setDraft(String(value)), [value]);
  React.useEffect(() => {
    if (dirty) dirtyCount((n) => n + 1);
    return () => {
      if (dirty) dirtyCount((n) => Math.max(0, n - 1));
    };
  }, [dirty, dirtyCount]);
  const apply = async () => {
    try {
      setSaving(true);
      await save(draft);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className={dirty ? "edit draft" : "edit"}>
      {label && <label>{label}</label>}
      <div className="editline">
        <input
          aria-label={label}
          disabled={disabled || saving}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && dirty && apply()}
        />
        <button disabled={disabled || saving || !dirty} onClick={apply}>
          应用
        </button>
        {dirty && (
          <button
            disabled={disabled || saving}
            onClick={() => setDraft(String(value))}
          >
            取消
          </button>
        )}
      </div>
      {note && <small>{note}</small>}
      {dirty && <small>未应用；点击应用提交，或取消恢复。</small>}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
