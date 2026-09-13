import { describe, expect, it } from "vitest";
import { applyPatch, clone, decode, encode } from "./domain";
import { actorParams } from "./actor-stats";
const make = () => ({actors:{_data:{"@c":1,"@a":[null,{_actorId:1,_classId:1,_level:2,_hp:20,_mp:10,_paramPlus:{"@c":3,"@a":[0,0,7,0,0,0,0,0]},_equips:{"@a":[]}}]}},ref:{"@r":3}});
const db = {Classes:[null,{params:Array.from({length:8},()=>[0,10,30])}]};
describe("actor stat edits",()=>{
 it("sets the requested base stat, preserving equipment, references, and other parameters",()=>{
  const raw=make(),before=clone(raw);
  applyPatch(raw,{kind:"actor",id:1,field:"atk",value:200},{},db);
  const actor=raw.actors._data["@a"][1]!;
  expect(actor._paramPlus["@a"][2]).toBe(170);
  expect(actorParams(actor,db)[2].value).toBe(200);
  expect(decode(encode(raw))).toEqual(raw);
  actor._paramPlus["@a"][2]=7;
  expect(raw).toEqual(before);
 });
 it("can lower a stat below level growth via a negative permanent bonus",()=>{
  const raw=make();applyPatch(raw,{kind:"actor",id:1,field:"def",value:5},{},db);
  expect(raw.actors._data["@a"][1]!._paramPlus["@a"][3]).toBe(-25);
 });
 it("supports all eight base attributes and current HP/MP",()=>{
  const raw=make();for(const field of ["mhp","mmp","atk","def","mat","mdf","agi","luk","hp","mp"]){applyPatch(raw,{kind:"actor",id:1,field,value:123},{},db);}
  expect(actorParams(raw.actors._data["@a"][1],db).every(p=>p.value===123)).toBe(true);
  expect(raw.actors._data["@a"][1]!._hp).toBe(123);
 });
 it("rejects invalid actors, metadata fields, bounds and missing growth tables",()=>{
  for(const patch of [{id:5,field:"atk",value:1},{id:1,field:"__proto__",value:1},{id:1,field:"atk",value:1000},{id:1,field:"hp",value:-1},{id:1,field:"mat",value:2.5}]){
    const raw=make(),before=clone(raw);expect(()=>applyPatch(raw,{kind:"actor",...patch},{},db)).toThrow();expect(raw).toEqual(before);
  }
  expect(()=>applyPatch(make(),{kind:"actor",id:1,field:"atk",value:100},{},{})).toThrow();
 });
});
