# 공기업 채용 달력 (수강생 열람용)

노션 '공기업 세부 사항 DB'를 1시간마다 읽어 웹 달력으로 보여줍니다.
수강생은 링크로 들어와 보기만 하고, 노션으로 가는 링크는 없습니다.

```
gongcal-web/
├─ site/                  ← 실제로 배포되는 웹페이지
│  ├─ index.html
│  ├─ data.json           ← 노션에서 자동 생성 (직접 고치지 마세요)
│  └─ robots.txt          ← 검색엔진 노출 차단
├─ scripts/sync-notion.mjs ← 노션 → data.json 변환
└─ .github/workflows/sync.yml ← 1시간마다 동기화 + 배포
```

## 처음 한 번만 하는 설정 (약 15분)

### 1. 노션 연동 키 만들기
1. https://www.notion.so/profile/integrations 접속 → **새 API 통합**
2. 이름: `채용 달력`, 워크스페이스 선택, 유형 **내부(Internal)** → 저장
3. **기능(Capabilities)** 에서 **콘텐츠 읽기만** 체크 (업데이트·삽입은 해제)
4. **내부 통합 시크릿**(`ntn_...` 로 시작)을 복사해 둡니다. 남에게 보여주지 마세요.

### 2. 노션 DB 2개를 연동에 연결
아래 두 DB 페이지에서 각각 우측 상단 `···` → **연결(Connections)** → `채용 달력` 추가
- **공기업 세부 사항 DB**
- **공기업 관련 정보**

(두 DB의 상위 페이지에 한 번만 연결해도 하위가 함께 연결됩니다.)

### 3. GitHub 저장소 만들기
1. https://github.com/new → 이름 예: `gongcal` → **Public** → Create
   (무료 계정에서 GitHub Pages는 공개 저장소에서만 됩니다. 데이터는 어차피 달력에 공개되는 내용만 담깁니다.)
2. 이 `gongcal-web` 폴더 안의 내용을 저장소에 올립니다.
   - 웹에서: 저장소 첫 화면 **uploading an existing file** → 폴더 안 파일 전부 끌어다 놓기 → Commit
   - ⚠️ `.github` 폴더는 숨김 폴더라 끌어다 놓기에서 빠질 수 있어요. 빠졌다면
     **Add file → Create new file** 에서 파일 이름을 `.github/workflows/sync.yml` 로 입력하고 내용을 붙여넣으세요.

### 4. 연동 키 등록
저장소 **Settings → Secrets and variables → Actions → New repository secret**
- Name: `NOTION_TOKEN`
- Secret: 1단계에서 복사한 `ntn_...` 값

### 5. Pages 켜기
저장소 **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 선택

### 6. 첫 실행
**Actions** 탭 → 왼쪽 `노션 동기화 및 배포` → **Run workflow**
초록 체크가 뜨면 끝입니다. 주소는 `https://<GitHub아이디>.github.io/gongcal/` 이며,
Settings → Pages 상단에도 표시됩니다. 이 주소를 수강생에게 배포하세요.

## 운영
- 노션을 고치면 **최대 1시간 안에** 달력에 반영됩니다. 급하면 Actions 탭에서 **Run workflow** 를 누르세요.
- 수강생 화면은 열려 있는 동안 15분마다 새 데이터를 확인하고, 새 공고에는 NEW 표시가 붙습니다.
- 관심 기업(★)·필터는 수강생 각자의 브라우저에만 저장됩니다.
- 노션에 **파일로 직접 업로드한 공고(PDF/이미지)** 는 노션 임시 주소라 외부에 링크하지 않습니다. 공고는 URL로 넣어 주세요.
- GitHub는 저장소에 60일간 변경이 없으면 자동 실행을 멈춥니다. 노션 데이터가 바뀔 때마다 자동 커밋이 생기므로 보통 문제없지만,
  멈췄다면 Actions 탭에서 다시 켜 주세요.

## 공개되는 항목
전형 일정, 필기 정보(유형·NCS/전공 과목·문항 수·배수·필기 특이사항), 채용 인원·간략한 채용 정리·기타 특이사항,
기업명·기업 유형, 채용 공고 링크.
**공개하지 않는 항목**: 필기 커트라인, 진행 상태, 면접·자소서 관련 내부 정보, 노션 페이지 링크 등.
항목을 바꾸려면 `scripts/sync-notion.mjs` 의 `normalizeRow` 를 수정하세요.

## 문제 해결
| 증상 | 원인 / 해결 |
|---|---|
| Actions에서 `NOTION_TOKEN 환경 변수가 없습니다` | 4단계 Secret 이름 확인 (`NOTION_TOKEN` 정확히) |
| `노션에서 ... 를 찾지 못했어요` | 2단계: 두 DB에 `채용 달력` 연결이 빠짐 |
| `401 unauthorized` | 토큰이 틀렸거나 재발급됨 → Secret 다시 등록 |
| 배포 단계에서 Pages 오류 | 5단계 Source가 GitHub Actions인지 확인 |
