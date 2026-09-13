// Editing the permanent bonus preserves level growth, equipment and JsonEx metadata.
export const PARAMS = [
  { key: "mhp", name: "最大 HP", max: 9999, min: 1 },
  { key: "mmp", name: "最大 MP", max: 9999, min: 0 },
  { key: "atk", name: "攻击", max: 999, min: 1 },
  { key: "def", name: "防御", max: 999, min: 1 },
  { key: "mat", name: "法攻", max: 999, min: 1 },
  { key: "mdf", name: "法防", max: 999, min: 1 },
  { key: "agi", name: "敏捷", max: 999, min: 1 },
  { key: "luk", name: "幸运", max: 999, min: 1 },
];
const array = (v: any): any[] => Array.isArray(v) ? v : v?.["@a"];
export function actorById(raw: any, id: number) {
  const actors = array(raw.actors?._data);
  const matches = actors?.filter(a => a?._actorId === id);
  if (matches?.length !== 1) throw Error("角色不存在或角色 ID 重复");
  return matches[0];
}
export function actorParams(actor: any, db: any) {
  const plus = array(actor._paramPlus);
  return PARAMS.map((p, paramId) => {
    const growth = db.Classes?.[actor._classId]?.params?.[paramId]?.[actor._level];
    const bonus = plus?.[paramId];
    const editable = Number.isSafeInteger(growth) && Number.isSafeInteger(bonus);
    return { ...p, paramId, growth, bonus, editable, value: editable ? growth + bonus : null };
  });
}
export function patchActor(raw: any, id: number, field: unknown, value: unknown, db: any) {
  const actor = actorById(raw, id);
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw Error("角色属性必须为安全整数");
  if (field === "hp" || field === "mp") {
    if (value < 0 || value > 9999) throw Error("当前 HP/MP 必须在 0–9999");
    actor[field === "hp" ? "_hp" : "_mp"] = value;
    return;
  }
  const p = actorParams(actor, db).find(p => p.key === field);
  if (!p?.editable) throw Error("属性不可编辑或职业成长数据缺失");
  if (value < p.min || value > p.max) throw Error(`${p.name}必须在 ${p.min}–${p.max}`);
  array(actor._paramPlus)[p.paramId] = value - p.growth;
}
