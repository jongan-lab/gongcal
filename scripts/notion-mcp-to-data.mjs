// Claude의 Notion 커넥터(notion-query-data-sources, view 모드)로 받은 결과 파일들을 site/data.json으로 바꾼다.
// 노션 API 토큰 없이 Claude 예약 작업이 동기화할 때 쓴다. 결과 형식은 sync-notion.mjs와 같다.
// 실행: node scripts/notion-mcp-to-data.mjs <결과.json> [<결과.json> ...]
//   각 파일은 {"results":[...], "has_more":...} 형태. 세부 사항 DB와 기업 DB의 모든 페이지를 넘긴다.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "site", "data.json");
const files = process.argv.slice(2);
if (!files.length) { console.error("결과 파일 경로를 넘겨 주세요."); process.exit(1); }

const pageId = (u) => { const m = String(u || "").replace(/-/g, "").match(/([0-9a-f]{32})(?:[?#]|$)/i); return m ? m[1].toLowerCase() : null; };
const arr = (v) => { if (Array.isArray(v)) return v; if (typeof v !== "string" || !v) return []; try { const a = JSON.parse(v); return Array.isArray(a) ? a : []; } catch { return []; } };
const str = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));
const dateOf = (v) => { v = str(v); return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null; };
const clean = (v) => { v = str(v); if (/^(rollupResult|formulaResult):\/\//.test(v) || v === "<omitted />") return ""; return v.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim(); };
// 외부 URL만 싣는다 (노션에 직접 올린 파일은 임시 주소라 제외)
const fileLinks = (v) => arr(v).flatMap((f) => { try { const raw = String(f).startsWith("file://") ? decodeURIComponent(String(f).slice(7)) : String(f); const src = raw[0] === "{" ? JSON.parse(raw).source : raw; return /^https?:\/\//i.test(src) ? [src] : []; } catch { return []; } });
const noDash = (a) => a.filter((x) => x !== "-");

const rows = [], companies = {};
for (const f of files) {
  let j = JSON.parse(readFileSync(f, "utf8"));
  if (Array.isArray(j) && j[0] && typeof j[0].text === "string") j = JSON.parse(j[0].text);
  for (const r of j.results || []) {
    const id = pageId(r.url);
    if (!id) continue;
    if ("기업명" in r && !("채용년도" in r)) {
      companies[id] = { name: str(r["기업명"]).trim(), kind: str(r["기업 유형"]), links: fileLinks(r["채용 링크"]) };
      continue;
    }
    const g = (n, p) => dateOf(r["date:" + n + ":" + p]);
    rows.push({
      id, co: arr(r["공기업 관련 정보"]).map(pageId).filter(Boolean)[0] || null, title: str(r["채용년도"]),
      season: str(r["채용 시기"]), type: str(r["필기 유형"]), ncs: arr(r["NCS 과목"]),
      ncsQ: str(r["NCS문항/시험시간"]), majorQ: str(r["전공문항/시험시간"]),
      elec: noDash(arr(r["전기 과목"])), mech: noDash(arr(r["기계 과목"])),
      etc: arr(r["기타 직무 과목"]).concat(arr(r["기타 과목"])),
      ratio: arr(r["필기 배수"]).join(", ") || str(r["적부/배수"]),
      hire: clean(r["직렬별 채용 인원"]), brief: clean(r["간략한 채용 정리"]),
      note: clean(r["기타 특이사항"]), examNote: clean(r["필기 특이사항"]),
      links: fileLinks(r["채용 공고 (PDF / URL / IMG)"]),
      d: {
        docStart: g("서류 접수 일자", "start"), docEnd: g("서류 접수 일자", "end") || g("서류 접수 일자", "start"),
        guide: g("자소서 가이드 제공일", "start"),
        exam: g("필기 응시 일자", "start"), examEnd: g("필기 응시 일자", "end"),
        examRes: g("필기 합격 발표", "start"),
        int1: g("1차 면접 일자", "start"), int1End: g("1차 면접 일자", "end"),
        int1Res: g("1차 합격 발표", "start"),
        int2: g("2차 면접 일자", "start"), int2End: g("2차 면접 일자", "end"),
        final: g("2차 합격 발표", "start"),
      },
    });
  }
}
// 같은 페이지가 두 번 들어와도 한 번만
const uniq = [...new Map(rows.map((r) => [r.id, r])).values()].sort((a, b) => (a.id < b.id ? -1 : 1));
const used = new Set(uniq.map((r) => r.co).filter(Boolean));
for (const id of Object.keys(companies)) if (!used.has(id)) delete companies[id];

let prev = null;
try { prev = JSON.parse(readFileSync(OUT, "utf8")); } catch {}
// 조회가 중간에 끊겨 일부만 받은 경우 공개 데이터를 덮어쓰지 않는다
if (prev && prev.rows && uniq.length < prev.rows.length * 0.8) {
  console.error(`공고가 ${prev.rows.length}건 → ${uniq.length}건으로 크게 줄었어요. 조회 누락일 수 있어 저장하지 않습니다.`);
  process.exit(2);
}
const missing = uniq.filter((r) => r.co && !companies[r.co]).length;
if (missing) {
  console.error(`기업 정보를 찾지 못한 공고가 ${missing}건이에요. 기업 DB 결과 파일이 모두 들어갔는지 확인하세요.`);
  process.exit(3);
}
const payload = { rows: uniq, companies };
if (prev && JSON.stringify({ rows: prev.rows, companies: prev.companies }) === JSON.stringify(payload)) {
  console.log(`변경 없음 (공고 ${uniq.length}건, 기업 ${Object.keys(companies).length}곳)`);
} else {
  writeFileSync(OUT, JSON.stringify({ updatedAt: new Date().toISOString(), ...payload }));
  const before = new Set((prev?.rows || []).map((r) => r.id));
  const added = uniq.filter((r) => !before.has(r.id)).length;
  console.log(`data.json 갱신 (공고 ${uniq.length}건, 기업 ${Object.keys(companies).length}곳, 새 공고 ${added}건)`);
}
