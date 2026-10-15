#!/usr/bin/env python3
"""Cut authentic audio clips from the video for every .say button.

Matches each button's example sentence (data-say2) against the timestamped
transcript, cuts the best-matching segment window from video_audio.webm with
ffmpeg (loudness-normalized mono AAC), writes audio/vNNN.m4a, and injects a
data-audio="audio/vNNN.m4a" attribute into each button. Idempotent: re-running
rebuilds all clips and rewrites the attributes from scratch.

Manual corrections: add (start_seconds, end_seconds) tuples to OVERRIDES and
re-run; the report prints every auto match for eyeballing first.
"""
import difflib
import html as html_mod
import json
import os
import re
import subprocess
import sys
import unicodedata

# Usage:
#   python3 cut_clips.py [page.html] [out_dir] [transcript.json] [src_audio] [overrides.json] [spans_out.json]
PAGE = sys.argv[1] if len(sys.argv) > 1 else 'lecon-opinions-impopulaires.html'
OUT_DIR = sys.argv[2] if len(sys.argv) > 2 else 'audio'
JSON_PATH = sys.argv[3] if len(sys.argv) > 3 else 'transcript_raw.json'
SRC_AUDIO = sys.argv[4] if len(sys.argv) > 4 else 'audio_src/video_audio.webm'
OVER_JSON = sys.argv[5] if len(sys.argv) > 5 else 'clip_overrides.json'
SPANS_OUT = sys.argv[6] if len(sys.argv) > 6 else 'spans.json'
BITRATE = sys.argv[7] if len(sys.argv) > 7 else '64k'

PRE_PAD = 0.25
POST_PAD = 0.45
MAX_WINDOW = 7

OVERRIDES = {}
if os.path.exists(OVER_JSON):
    with open(OVER_JSON, encoding='utf-8') as f:
        OVERRIDES.update({k: tuple(v) for k, v in json.load(f).items()})

BTN = re.compile(r'<button class="say"[^>]*>')


def norm(s):
    s = s.lower()
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    return ' '.join(s.split())


def load_segments():
    data = json.load(open(JSON_PATH, encoding='utf-8'))
    segs = []
    for s in data:
        segs.append({'start': s['start'], 'dur': s['dur'], 'text': s['text'].strip()})
    return segs


def best_window(segs, target):
    t = norm(target)
    best = (0.0, None, None)
    n = len(segs)
    for i in range(n):
        parts = []
        for j in range(i, min(i + MAX_WINDOW, n)):
            parts.append(segs[j]['text'])
            cand = norm(' '.join(parts))
            r = difflib.SequenceMatcher(None, t, cand).ratio()
            if r > best[0]:
                best = (r, i, j)
    return best


def cut(seg_window, out_path, idx):
    i, j = seg_window
    segs = SEGMENTS
    start = max(0.0, segs[i]['start'] - PRE_PAD)
    end = segs[j]['start'] + segs[j]['dur'] + POST_PAD
    cmd = [
        'ffmpeg', '-y', '-loglevel', 'error',
        '-ss', '%.3f' % start, '-to', '%.3f' % end,
        '-i', SRC_AUDIO,
        '-af', 'highpass=f=80,loudnorm=I=-16:TP=-1.5:LRA=11',
        '-vn', '-ac', '1', '-ar', '44100', '-c:a', 'aac', '-b:a', BITRATE,
        out_path,
    ]
    subprocess.run(cmd, check=True)
    return start, end


def parse_buttons(src):
    entries = []
    for m in BTN.finditer(src):
        tag = m.group(0)
        say = re.search(r'data-say="([^"]*)"', tag)
        say2 = re.search(r'data-say2="([^"]*)"', tag)
        entries.append({
            'tag': tag,
            'say': html_mod.unescape(say.group(1)) if say else '',
            'say2': html_mod.unescape(say2.group(1)) if say2 else '',
        })
    return entries


def main():
    global SEGMENTS
    SEGMENTS = load_segments()
    os.makedirs(OUT_DIR, exist_ok=True)
    src = open(PAGE, encoding='utf-8').read()
    entries = parse_buttons(src)
    print('buttons found: %d' % len(entries), flush=True)

    report = []
    span_map = {}
    for n, e in enumerate(entries, start=1):
        vid = 'v%03d' % n
        out_path = os.path.join(OUT_DIR, vid + '.m4a')
        target = e['say2'] or e['say']
        if vid in OVERRIDES:
            start, end = OVERRIDES[vid]
            cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-ss', '%.3f' % start,
                   '-to', '%.3f' % end, '-i', SRC_AUDIO,
                   '-af', 'highpass=f=80,loudnorm=I=-16:TP=-1.5:LRA=11',
                   '-vn', '-ac', '1', '-ar', '44100', '-c:a', 'aac', '-b:a', BITRATE, out_path]
            subprocess.run(cmd, check=True)
            ratio, txt = 1.0, '[manual override]'
        else:
            ratio, i, j = best_window(SEGMENTS, target)
            if ratio < 0.55 and e['say']:
                r2, i2, j2 = best_window(SEGMENTS, e['say'])
                if r2 > ratio:
                    ratio, i, j = r2, i2, j2
            if i is None:
                print('%s SKIP no match: %s' % (vid, target[:50]), flush=True)
                continue
            start, end = cut((i, j), out_path, vid)
            txt = ' '.join(s['text'] for s in SEGMENTS[i:j + 1])
        span_map[vid] = (round(start, 3), round(end, 3))
        flag = 'OK ' if ratio >= 0.62 else 'CHECK'
        report.append((vid, flag, ratio, start, end, e['say'][:30], txt[:90]))

    print('\n=== report ===', flush=True)
    for vid, flag, ratio, start, end, say, txt in report:
        print('%s %s r=%.2f %6.2f-%6.2f | %-30s | %s' % (vid, flag, ratio, start, end, say, txt))

    def rewrite(m, counter=[0]):
        counter[0] += 1
        vid = 'v%03d' % counter[0]
        tag = m.group(0)
        say = re.search(r'data-say="([^"]*)"', tag)
        say2 = re.search(r'data-say2="([^"]*)"', tag)
        attrs = ['class="say"', 'type="button"']
        if say:
            attrs.append('data-say="%s"' % say.group(1))
        if say2:
            attrs.append('data-say2="%s"' % say2.group(1))
        attrs.append('data-audio="%s/%s.m4a"' % (OUT_DIR, vid))
        attrs.append('aria-label="Écouter"')
        attrs.append('title="Écouter (extrait de la vidéo)"')
        return '<button ' + ' '.join(attrs) + '>'

    new_src = BTN.sub(rewrite, src)
    open(PAGE, 'w', encoding='utf-8').write(new_src)
    with open(SPANS_OUT, 'w', encoding='utf-8') as f:
        json.dump(span_map, f, indent=1)
    print('\nHTML updated, clips in %s/ ; %s written' % (OUT_DIR, SPANS_OUT), flush=True)
    size = sum(os.path.getsize(os.path.join(OUT_DIR, f)) for f in os.listdir(OUT_DIR) if f.endswith('.m4a'))
    print('total audio size: %.1f KB' % (size / 1024.0), flush=True)


if __name__ == '__main__':
    main()
