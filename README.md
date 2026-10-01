# Gaze Attention Project Page

"Gaze Attention: Query-Adaptive Visual Routing for Efficient Multimodal LLMs" (CoLM 2026) 논문의 프로젝트 페이지 소스입니다. 빌드 과정 없이 `index.html`을 그대로 GitHub Pages에 올리면 됩니다.

## 폴더 구성

- `index.html`: 페이지 본문.
- `css/gaze-attention.css`: 스타일. 색상은 파일 맨 위 `:root` 변수에서 바꿉니다 (기본 색 `--primary-color: #3b78c4`).
- `js/gaze-viewer.js`: TL;DR와 "Watch the Gaze Shift"의 인터랙티브 뷰어, Motivation의 attention map.
- `js/gaze-demo-data.js`: 뷰어가 읽는 데이터 (생성 파일, 직접 수정하지 않음).
- `js/charts.js`: Results의 차트와 툴팁. 숫자는 논문의 표와 그림 값을 그대로 옮긴 것입니다.
- `js/page.js`: 탭, 아코디언, nav pill.
- `assets/`: 그림, 로고, 뷰어용 이미지 (생성 파일).
- `tests/`, `package.json`, `playwright.config.js`, `.htmlvalidate.json`: 검사 도구.

## 뷰어가 보여주는 것

뷰어는 TL;DR에 하나만 있습니다. 답변과 attention은 모델이 답변을 생성하는 동안 기록한 값이고, layer 15 하나만 보여줍니다.

- Gaze Attention: 생성 중인 단어마다 선택된 2개의 gaze region에 대한 attention을 보여줍니다.
- Dense attention: dense attention 모델의 head 하나(head 10)의 attention (전체 visual token).
- Motivation 섹션의 그림: Gaze Attention 쪽은 고정된 head(layer 15, head 6)입니다.

모델은 이미지를 정사각형으로 리사이즈해서 받으므로, 32×32 토큰 격자는 이미지 전체에 걸쳐 있습니다. 가로로 긴 이미지에서는 region이 직사각형으로 보입니다.

attention 값은 논문 그림과 같이 프레임마다 log-scale로 정규화해서 표시합니다.

## 미리 보기

```bash
python3 -m http.server 8000
# http://localhost:8000
```

`index.html`을 브라우저에서 바로 열어도 동작합니다. 폰트(Google Fonts)와 수식(MathJax)은 CDN에서 불러옵니다.

## 검사

```bash
npm install
npx playwright install chromium
npm run check
```

HTML 구조 검사, Prettier 포맷 검사, desktop/mobile 렌더링 검사(깨진 이미지, 가로 overflow, 뷰어·탭·아코디언 동작)를 차례로 실행합니다. html-validate는 Node 22 이상이 필요합니다.

## 생성 파일

`assets/`와 `js/gaze-demo-data.js`는 생성 파일입니다. 작업 폴더에서 이 폴더 옆에 있는 `tools/`(페이지에는 포함되지 않음)가 만듭니다.

- `tools/build_assets.py`: 논문 그림(PDF), 그림 원본(PPTX), decode-time 기록을 읽어서 `assets/`와 뷰어 데이터를 만듭니다. 모델은 돌리지 않습니다.
- `tools/capture_new_images.sh`: 나중에 추가한 예시 이미지의 decode-time 기록을 만듭니다 (GPU 필요). 단어와 물체를 잇는 phrase 목록은 `tools/phrase_plans/`에 있습니다.

```bash
python3 ../tools/build_assets.py                # 전체
python3 ../tools/build_assets.py --only demo    # 뷰어 데이터만
```
