// 노션 '공기업 세부 사항 DB'와 '공기업 관련 정보' DB를 읽어 site/data.json을 만든다.
// 외부 공개용이라 화면에 필요한 항목만 골라 담는다(커트라인·작성 상태·노션 링크 등은 제외).
// 실행: NOTION_TOKEN=secret_xxx node scripts/sync-notion.mjs
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "site", "data.json");

const TOKEN = process.env.NOTION_TOKEN;
const ROWS_DB = process.env.NOTION_ROWS_DB || "262622693e638106bbe5e88730201f29"; // 공기업 세부 사항 DB
const CO_DB = process.env.NOTION_CO_DB || "262622693e6381abb684d12a0a2a4876";     // 공기업 관련 정보
const API = "https://api.notion.com/v1";
const VERSION = "2025-09-03";

if (!TOKEN) {
  console.error("NOTION_TOKEN 환경 변수가 없습니다.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function notion(path, body) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API + path, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + TOKEN,
        "Notion-Version": VERSION,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) return res.json();
    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < 5) {
      const wait = Number(res.headers.get("retry-after")) * 1000 || 1500 * (attempt + 1);
      await sleep(wait);
      continue;
    }
    const text = await res.text();
    if (res.status === 404) {
      throw new Error(
        `노션에서 ${path} 를 찾지 못했어요. DB를 Integration에 연결(공유)했는지 확인하세요.\n${text}`
      );
    }
    throw new Error(`Notion API ${res.status} ${path}\n${text}`);
  }
}

async function queryAll(databaseId) {
  const db = await notion(`/databases/${databaseId}`);
  const ds = db.data_sources && db.data_sources[0];
  if (!ds) throw new Error(`${databaseId} 에 데이터 소스가 없습니다.`);
  const pages = [];
  let cursor;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const res = await notion(`/data_sources/${ds.id}/query`, body);
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);
  return pages.filter((p) => !p.in_trash && !p.archived);
}

/* ---------- property readers ---------- */
const plain = (rich) => (rich || []).map((t) => t.plain_text).join("").trim();
const compact = (id) => String(id || "").replace(/-/g, "").toLowerCase();

function text(prop) {
  if (!prop) return "";
  switch (prop.type) {
    case "title": return plain(prop.title);
    case "rich_text": return plain(prop.rich_text);
    case "select": return prop.select ? prop.select.name : "";
    case "status": return prop.status ? prop.status.name : "";
    case "url": return prop.url || "";
    case "number": return prop.number == null ? "" : String(prop.number);
    case "multi_select": return prop.multi_select.map((o) => o.name).join(", ");
    case "formula": {
      const f = prop.formula;
      return f[f.type] == null ? "" : String(f[f.type]);
    }
    default: return "";
  }
}
const list = (prop) => (prop && prop.type === "multi_select" ? prop.multi_select.map((o) => o.name) : []);
const relation = (prop) => (prop && prop.type === "relation" ? prop.relation.map((r) => compact(r.id)) : []);
function date(prop) {
  const d = prop && prop.type === "date" && prop.date;
  if (!d || !d.start) return { start: null, end: null };
  return { start: d.start.slice(0, 10), end: d.end ? d.end.slice(0, 10) : null };
}
// 노션에 직접 업로드된 파일은 1시간 뒤 만료되는 임시 주소라 외부 링크만 싣는다.
function links(prop) {
  if (!prop) return [];
  if (prop.type === "url") return prop.url ? [prop.url] : [];
  if (prop.type !== "files") return [];
  return prop.files
    .map((f) => (f.type === "external" ? f.external.url : null))
    .filter((u) => typeof u === "string" && /^https?:\/\//i.test(u));
}

/* ---------- normalize ---------- */
function normalizeRow(page) {
  const p = page.properties;
  const g = (name) => date(p[name]);
  const doc = g("서류 접수 일자"), exam = g("필기 응시 일자"), int1 = g("1차 면접 일자"), int2 = g("2차 면접 일자");
  const noDash = (arr) => arr.filter((x) => x !== "-");
  return {
    id: compact(page.id),
    co: relation(p["공기업 관련 정보"])[0] || null,
    title: text(p["채용년도"]),
    season: text(p["채용 시기"]),
    type: text(p["필기 유형"]),
    ncs: list(p["NCS 과목"]),
    ncsQ: text(p["NCS문항/시험시간"]),
    majorQ: text(p["전공문항/시험시간"]),
    elec: noDash(list(p["전기 과목"])),
    mech: noDash(list(p["기계 과목"])),
    etc: list(p["기타 직무 과목"]).concat(list(p["기타 과목"])),
    ratio: list(p["필기 배수"]).join(", ") || text(p["적부/배수"]),
    hire: text(p["직렬별 채용 인원"]),
    brief: text(p["간략한 채용 정리"]),
    note: text(p["기타 특이사항"]),
    examNote: text(p["필기 특이사항"]),
    links: links(p["채용 공고 (PDF / URL / IMG)"]),
    d: {
      docStart: doc.start, docEnd: doc.end || doc.start,
      guide: g("자소서 가이드 제공일").start,
      exam: exam.start, examEnd: exam.end,
      examRes: g("필기 합격 발표").start,
      int1: int1.start, int1End: int1.end,
      int1Res: g("1차 합격 발표").start,
      int2: int2.start, int2End: int2.end,
      final: g("2차 합격 발표").start,
    },
  };
}
function normalizeCompany(page) {
  const p = page.properties;
  return {
    id: compact(page.id),
    name: text(p["기업명"]),
    kind: text(p["기업 유형"]),
    links: links(p["채용 링크"]),
  };
}

/* ---------- main ---------- */
const [coPages, rowPages] = await Promise.all([queryAll(CO_DB), queryAll(ROWS_DB)]);
const companies = {};
for (const pg of coPages) {
  const c = normalizeCompany(pg);
  companies[c.id] = { name: c.name, kind: c.kind, links: c.links };
}
const rows = rowPages.map(normalizeRow).sort((a, b) => (a.id < b.id ? -1 : 1));

// 쓰는 기업만 남겨 공개 데이터를 줄인다.
const used = new Set(rows.map((r) => r.co).filter(Boolean));
for (const id of Object.keys(companies)) if (!used.has(id)) delete companies[id];

const payload = { rows, companies };
let prev = null;
try { prev = JSON.parse(await readFile(OUT, "utf8")); } catch {}
const same = prev && JSON.stringify({ rows: prev.rows, companies: prev.companies }) === JSON.stringify(payload);
if (same) {
  console.log(`변경 없음 (공고 ${rows.length}건, 기업 ${Object.keys(companies).length}곳)`);
} else {
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify({ updatedAt: new Date().toISOString(), ...payload }));
  console.log(`data.json 갱신 (공고 ${rows.length}건, 기업 ${Object.keys(companies).length}곳)`);
}
