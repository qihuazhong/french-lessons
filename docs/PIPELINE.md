# Pipeline — building a new lesson end-to-end

All commands assume **repo root as the working directory**. Pick a short slug
(e.g. `france`, `dommage`) and reuse it in every file name below.

## Prerequisites

```bash
python3 -m pip install yt-dlp faster-whisper youtube-transcript-api
brew install ffmpeg
# optional but recommended for yt-dlp video downloads:
#   brew install deno     (YouTube nsig/JS runtime)
```

Whisper runs locally with `faster-whisper`; the scripts decode audio through
numpy (PyAV in this Anaconda env is too old — do not call `transcribe(path)`
directly on m4a/mp4 files, decode to a numpy array or wav first).

## Step 1 — identify the video, fetch captions

```bash
curl -s "https://www.youtube.com/oembed?url=<URL>&format=json" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['title'],'—',d['author_name'])"
```

```python
# python3 -  → saves content/<slug>/transcript.json + transcript.txt
from youtube_transcript_api import YouTubeTranscriptApi
import json
api = YouTubeTranscriptApi()
print([ (t.language_code, t.is_generated) for t in api.list('VIDEO_ID') ])
tr = api.fetch('VIDEO_ID', languages=['fr'])
data = [{'start': s.start, 'dur': s.duration, 'text': s.text} for s in tr]
json.dump(data, open('content/<slug>/transcript.json', 'w'), ensure_ascii=False, indent=1)
```

Notes: **manual captions** (some videos) = accurate text + timings → clip spans
can come straight from segments. **Auto captions** = usable timings, messy
text → expect the whisper/word-timing curation in step 6.

## Step 2 — download the video (local copy for the page)

```bash
yt-dlp -f 18 --extractor-args "youtube:player_client=android" \
  -o "video_src-<slug>/lesson_video.%(ext)s" --no-playlist "<URL>"
```

`-f 18` = 360p h264+aac, the sweet spot (widely available, Plays anywhere).
If 403: install `deno` and retry without the extractor args; check available
formats with `yt-dlp -F ...`.

## Step 3 — whisper word-timings pass (background, logged)

```bash
ffmpeg -y -loglevel error -i video_src-<slug>/lesson_video.mp4 -ac 1 -ar 16000 /tmp/full_<slug>.wav
# launch in background, print progress every 25 segments (see git history for the exact script)
# output: /tmp/whisper_full_<slug>.json  (segments + per-word {w,s,e})
```

Whisper `small`, CPU, int8 is enough; use `medium` for tie-breaking disputed
cuts (downloads ~1.5 GB once). Tip: `beam_size=5, condition_on_previous_text=False`
settled several caption/ASR disputes.

## Step 4 — author the content parts

Copy `content/france/src/` (newest, has C1) → `content/<slug>/src/`, replace
content following **docs/CONVENTIONS.md**. Keep all 5 parts, the
`[[SAY2:]]`/`[[SAY:]]` placeholders, and one `data-lv` block per level per
section.

## Step 5 — build the page

```bash
python3 tools/build_page.py content/<slug>/src lecon-<slug>.html
```

## Step 6 — conjugation tooltips

```bash
cp content/dommage/add_conjugations_dommage.py content/<slug>/add_conjugations_<slug>.py
# edit PAGE + VERBS, then:
python3 content/<slug>/add_conjugations_<slug>.py
```

## Step 7 — map button texts to spoken spans

```bash
python3 tools/map_spans.py lecon-<slug>.html /tmp/whisper_full_<slug>.json /tmp/map_<slug>.json
```

Review the report (`OK` ≥0.85 / `~` / `LOW`). For every LOW item, look up the
phrase in the whisper words (small helper: print `word@start` for a 5–10 s
window around the neighbourhood) or, if the phrase is a lyric/quote the pass
skipped, **re-transcribe just that window** with `beam_size=5` — the focused
pass usually recovers it. Write the final curated table to
`content/<slug>/clip_overrides.json` (all buttons, `[start, end]` seconds).

## Step 8 — cut the audio clips + video spans

```bash
python3 tools/cut_clips.py lecon-<slug>.html audio-<slug> \
  content/<slug>/transcript.json video_src-<slug>/lesson_video.mp4 \
  content/<slug>/clip_overrides.json content/<slug>/spans.json 64k
# (last arg = bitrate; songs sound better at 96k)
python3 tools/add_youtube.py lecon-<slug>.html content/<slug>/clip_overrides.json
```

`cut_clips` rewrites every `.say` button: `data-audio` + a report; it always
passes `-vn` (mp4 sources otherwise leak the video track into the m4a).

## Step 9 — register + regenerate the navigation

Append an entry to `lessons.json` (schema in CONVENTIONS §6), then:

```bash
python3 tools/add_lessons_nav.py
```

Regenerates `index.html`, the review page `progres.html` (embedded catalog =
all vocab rows + expression cards with `data-say`; users add cards explicitly
from lesson pages — 🔊 click or « + Ajouter … » button), and re-injects the
side-panel + footer navs on all pages (idempotent).

## Step 10 — validate

```bash
python3 - <<'EOF'   # HTML well-formedness + spec JSON validity (adapted from earlier checks)
# quick: python html.parser stack check + json.loads each <script type="application/json">
EOF
node --check <(python3 -c "import re;print(re.search(r'<script>(.*?)</script>', open('lecon-<slug>.html').read(), re.S).group(1))")
cd tools && npm i jsdom && node test_exos.js   # exercise engine smoke test (24 assertions)
cd tools && node test_srs.js                   # révisions Anki + retrait/merge + Google (76 assertions)
```

Spot-play a few clips: `afplay audio-<slug>/v001.m4a` — and click around in the
browser (level switch, one exercise per type, video jumps).

## Step 11 — deploy

```bash
git add -A && git commit -m "Leçon N : …" && git push
# if SSH is not set up:
git -c credential.helper='!gh auth git-credential' push
```

GitHub Pages rebuilds in ~1–2 min. Verify:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://qihuazhong.github.io/french-lessons/lecon-<slug>.html
```

## Troubleshooting playbook

| Symptom | Cause / fix |
|---|---|
| YouTube 403 on video download | missing JS runtime → `brew install deno`; or use `--extractor-args "youtube:player_client=android"` |
| Whisper “skips” a montage/quote segment | focused re-transcription of that window (`-ss/-to` + `beam_size=5`); captions still carry the text + segment times |
| Two ASRs disagree on a word | run `medium` on the exact window; prefer the manual caption when it exists |
| Clips suddenly 10× bigger / have a video track | `-vn` missing in a custom ffmpeg call |
| `add_youtube` injected 0 buttons | its regex expects `data-audio="…/vNNN.m4a"` — keep clip dirs named `audio-*` |
| Buttons play wrong clips after edits | ids are DOM-ordered: re-run cut pipeline after adding/removing buttons |
| Page 404 right after push | Pages is still building; wait and re-check (`.nojekyll` is in place) |
| Injection anchors match in the wrong section | scope replacements to the target `<section id="…">` substring |
| Review deck missing items | deck keys come from `data-say` attrs — run `python3 tools/build_review.py` after content edits |

## Historical scripts (archival — do not reuse)

`content/opinions/`: `add_audio.py`, `add_audio_parle.py`, `apply_text_updates.py`,
`apply_exercices_opinions.py`, `align_clips.py`, `map_clips.py`; and
`content/ai/`: `align_ai_texts.py`. These document how lessons 1–2 were
retrofitted (audio buttons, verbatim text alignment, interactive exercises).
The current pipeline above supersedes them.
