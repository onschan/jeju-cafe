"""게임 데이터 설계서(마크다운 표) → src/data/generated/*.json

사용: python3 tools/data/from_tables.py            # v1 + v2 모두 생성
      python3 tools/data/from_tables.py DOC OUT    # v1만(테스트용)
원본:
  v1  docs/superpowers/specs/2026-09-17-game-data-tables.md → src/data/generated/*.json
  v2  docs/superpowers/specs/2026-09-17-gdd-v2-tables.md + guest-chain.mmd → src/data/generated/v2/*.json
표준 라이브러리만 사용. 실행은 멱등이며 파일별 항목 수를 출력한다.
"""
from __future__ import annotations

import json
import os
import re
import sys
from typing import Any

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
SPECS = os.path.join(ROOT, 'docs', 'superpowers', 'specs')
DOC = os.path.join(SPECS, '2026-09-17-game-data-tables.md')
OUT_DIR = os.path.join(ROOT, 'src', 'data', 'generated')
DOC_V2 = os.path.join(SPECS, '2026-09-17-gdd-v2-tables.md')
MMD_V2 = os.path.join(SPECS, 'guest-chain.mmd')
MENUS_V1 = os.path.join(ROOT, 'src', 'data', 'menus.json')
OUT_DIR_V2 = os.path.join(OUT_DIR, 'v2')

MINUS = '−'  # U+2212, 문서에서 음수 표기에 사용

# ---------------------------------------------------------------------------
# 셀 변환
# ---------------------------------------------------------------------------
RE_INT = re.compile(r'^[+\-−]?\d{1,3}(,\d{3})*$|^[+\-−]?\d+$')
RE_PCT = re.compile(r'^([+\-−]?\d[\d,]*(?:\.\d+)?)\s*%$')
RE_SIZE = re.compile(r'^(\d+)×(\d+)$')
RE_RANGE = re.compile(r'^(\d[\d,]*)~(\d[\d,]*)$')
RE_WEIGHTS = re.compile(r'^\d+(/\d+)+$')
RE_FLOAT = re.compile(r'^[+\-−]?\d+\.\d+$')


def _num(s: str) -> int | float:
    s = s.replace(',', '').replace(MINUS, '-').replace('+', '')
    return float(s) if '.' in s else int(s)


def conv(cell: str) -> Any:
    """표 셀 하나를 값으로. 숫자·퍼센트·null·배열·크기·범위·부호·가중치."""
    s = cell.strip()
    if s in ('', '—', '-', '–'):
        return None
    m = RE_SIZE.match(s)
    if m:
        return {'w': int(m.group(1)), 'h': int(m.group(2))}
    m = RE_RANGE.match(s)
    if m:
        return {'min': _num(m.group(1)), 'max': _num(m.group(2))}
    if RE_WEIGHTS.match(s):
        return [int(x) for x in s.split('/')]
    m = RE_PCT.match(s)
    if m:
        return _num(m.group(1))
    if RE_INT.match(s) or RE_FLOAT.match(s):
        return _num(s)
    if '·' in s:
        return [x.strip() for x in s.split('·') if x.strip()]
    return s


def raw(cell: str) -> Any:
    s = cell.strip()
    return None if s in ('', '—', '-', '–') else s


# ---------------------------------------------------------------------------
# 마크다운 파서
# ---------------------------------------------------------------------------
class Section:
    def __init__(self, level: int, title: str) -> None:
        self.level = level
        self.title = title
        self.lines: list[str] = []

    def tables(self) -> list[list[dict[str, str]]]:
        out: list[list[dict[str, str]]] = []
        block: list[str] = []
        for line in self.lines + ['']:
            if line.strip().startswith('|'):
                block.append(line)
            else:
                if block:
                    out.append(parse_table(block))
                block = []
        return out

    def table(self) -> list[dict[str, str]]:
        ts = self.tables()
        if not ts:
            raise ValueError(f'표 없음: {self.title}')
        return ts[0]

    def text_lines(self) -> list[str]:
        return [l.strip() for l in self.lines
                if l.strip() and not l.strip().startswith('|') and not re.fullmatch(r'-{3,}', l.strip())]

    def text(self) -> str:
        return '\n'.join(self.text_lines())


def split_row(line: str) -> list[str]:
    s = line.strip()
    if s.startswith('|'):
        s = s[1:]
    if s.endswith('|'):
        s = s[:-1]
    return [c.strip() for c in s.split('|')]


def parse_table(block: list[str]) -> list[dict[str, str]]:
    """GFM 표 블록(문자열 리스트) → 헤더를 키로 한 행 dict 목록(셀은 문자열 그대로)."""
    rows = [split_row(l) for l in block if l.strip()]
    if len(rows) < 2:
        return []
    header = rows[0]
    body = rows[1:]
    if body and all(re.fullmatch(r':?-+:?', c) for c in body[0] if c):
        body = body[1:]
    out = []
    for r in body:
        if len(r) != len(header):
            raise ValueError(f'셀 수 불일치({len(r)} != {len(header)}): {r}')
        out.append(dict(zip(header, r)))
    return out


def parse_doc(text: str) -> list[Section]:
    sections: list[Section] = []
    cur = Section(0, '')
    sections.append(cur)
    for line in text.splitlines():
        m = re.match(r'^(#{1,6})\s+(.*)$', line)
        if m:
            cur = Section(len(m.group(1)), m.group(2).strip())
            sections.append(cur)
        else:
            cur.lines.append(line)
    return sections


class Doc:
    def __init__(self, text: str) -> None:
        self.sections = parse_doc(text)

    def section(self, prefix: str) -> Section:
        for s in self.sections:
            if s.title.startswith(prefix):
                return s
        raise KeyError(f'절 없음: {prefix}')

    def children(self, prefix: str) -> list[Section]:
        """prefix 절 바로 아래 레벨의 하위 절들."""
        parent = self.section(prefix)
        idx = self.sections.index(parent)
        out = []
        for s in self.sections[idx + 1:]:
            if s.level <= parent.level:
                break
            if s.level == parent.level + 1:
                out.append(s)
        return out


# ---------------------------------------------------------------------------
# 공용 유틸
# ---------------------------------------------------------------------------
def split_depth0(s: str, sep: str) -> list[str]:
    """괄호 안의 구분자는 무시하고 split."""
    out, buf, depth = [], '', 0
    i = 0
    while i < len(s):
        ch = s[i]
        if ch in '(（':
            depth += 1
        elif ch in ')）':
            depth = max(0, depth - 1)
        if depth == 0 and s.startswith(sep, i):
            out.append(buf)
            buf = ''
            i += len(sep)
            continue
        buf += ch
        i += 1
    out.append(buf)
    return [x.strip() for x in out if x.strip()]


def signed(s: str) -> int:
    return int(s.replace(MINUS, '-').replace('+', '').replace(',', ''))


STAT_KO = {'맛': 'taste', '향': 'aroma', '보기': 'look', '건강': 'health', '양': 'volume', '제주다움': 'jeju', '제주': 'jeju'}
BASE_KO = {'음료': 'drink', '디저트': 'dessert', '식사': 'meal', '시그니처': 'signature', '아무거나': 'any'}
SEASON_KO = {'봄': 'spring', '여름': 'summer', '가을': 'autumn', '겨울': 'winter'}
CATEGORY_KO = {
    '커피': 'coffee', '유제품': 'dairy', '감미': 'sweet', '곡물': 'grain', '단백': 'protein', '차': 'tea',
    '과일': 'fruit', '물': 'water', '향신': 'spice', '채소': 'vegetable', '견과': 'nut', '해산물': 'seafood',
}
RE_STAT_TOKEN = re.compile(r'(맛|향|보기|건강|양|제주다움|제주)\s*([+\-−]\d+)')


def parse_stat_bonus(s: str | None) -> dict[str, int]:
    if not s:
        return {}
    return {STAT_KO[k]: signed(v) for k, v in RE_STAT_TOKEN.findall(s)}


def parse_likes(s: str) -> tuple[list[str], list[str]]:
    """'음료×맛·양' → (['drink'], ['taste','volume'])."""
    base_s, _, stats_s = s.partition('×')
    bases = []
    for b in base_s.split('·'):
        b = re.sub(r'\(.*?\)', '', b).strip()
        if b:
            bases.append(BASE_KO.get(b, b))
    stats = []
    for t in stats_s.split('·'):
        t = t.strip()
        if t in ('', '—', '-'):
            continue
        stats.append(STAT_KO.get(t, t))
    return bases, stats


def night_scenery(cell: str) -> tuple[int, int | None]:
    """'1(밤 +3)' → (1, 3), '3' → (3, None)."""
    m = re.match(r'^([+\-−]?\d+)\s*\(밤\s*\+(\d+)\)$', cell.strip())
    if m:
        return signed(m.group(1)), int(m.group(2))
    return signed(cell), None


def parse_season_bonus(cell: str) -> dict[str, int] | None:
    if raw(cell) is None:
        return None
    out = {}
    for season, val in re.findall(r'(봄|여름|가을|겨울)\s*([+\-−]\d+)', cell):
        out[SEASON_KO[season]] = signed(val)
    return out or None


def num_with_note(cell: str) -> tuple[int, str | None]:
    """'0(밭)' → (0, '밭'), '5,000' → (5000, None), '6,000 (호감 보상: …)' → (6000, '호감 보상: …')."""
    m = re.match(r'^([+\-−]?\d[\d,]*)\s*(?:\((.*)\))?$', cell.strip())
    if not m:
        raise ValueError(f'숫자 셀 아님: {cell!r}')
    return signed(m.group(1)), (m.group(2).strip() if m.group(2) else None)


# ---------------------------------------------------------------------------
# §1 오브젝트
# ---------------------------------------------------------------------------
def emit_objects(doc: Doc) -> list[dict]:
    out: list[dict] = []

    for r in doc.section('1.1 ').table():
        size = conv(r['크기'])
        out.append({
            'id': r['id'], 'name': r['이름'], 'kind': 'seat', 'w': size['w'], 'h': size['h'],
            'cost': conv(r['Cost']), 'seats': conv(r['좌석']), 'popularity': conv(r['Pop']), 'feePct': conv(r['Fee%']),
            'scenery': conv(r['Sc']), 'noise': conv(r['Nz']), 'upkeep': conv(r['Up']), 'unlockText': raw(r['해금']),
        })

    for r in doc.section('1.2 ').table():
        size = conv(r['크기'])
        out.append({
            'id': r['id'], 'name': r['이름'], 'kind': 'facility', 'w': size['w'], 'h': size['h'],
            'cost': conv(r['Cost']), 'popularity': conv(r['Pop']), 'fee': conv(r['이용료']),
            'scenery': conv(r['Sc']), 'noise': conv(r['Nz']), 'upkeep': conv(r['Up']), 'research': conv(r['연구P']),
            'unlockText': raw(r['해금']),
        })

    for r in doc.section('1.3 ').table():
        size = conv(r['크기'])
        note = raw(r['비고']) or ''
        sc = re.search(r'Sc\s*([+\-−]\d+)', note)
        nz = re.search(r'Nz\s*([+\-−]\d+)', note)
        wd = re.search(r'Wd\s*(\d+)', note)
        out.append({
            'id': r['id'], 'name': r['이름'], 'kind': 'farm', 'w': size['w'], 'h': size['h'],
            'cost': conv(r['Cost']), 'terrainText': raw(r['지형']),
            'scenery': signed(sc.group(1)) if sc else 0, 'noise': signed(nz.group(1)) if nz else 0,
            'wind': int(wd.group(1)) if wd else 0, 'upkeep': conv(r['Up']), 'note': raw(r['비고']),
        })

    for r in doc.section('1.4 ').table():
        size = conv(r['크기'])
        sc, sc_night = night_scenery(r['Sc'])
        o = {
            'id': r['id'], 'name': r['이름'], 'kind': 'path_wall', 'w': size['w'], 'h': size['h'],
            'cost': conv(r['Cost']), 'scenery': sc, 'noise': 0, 'wind': conv(r['Wd']), 'upkeep': conv(r['Up']),
            'note': raw(r['비고']),
        }
        if sc_night is not None:
            o['sceneryNight'] = sc_night
        out.append(o)

    for r in doc.section('1.5 ').table():
        cost_cell = r['Cost'].strip()
        m = re.match(r'^([\d,]+)\s*\((\d+)×(\d+)\)$', cost_cell)
        if m:
            cost, w, h = signed(m.group(1)), int(m.group(2)), int(m.group(3))
        else:
            cost, w, h = conv(cost_cell), 1, 1
        sc, sc_night = night_scenery(r['Sc'])
        o = {
            'id': r['id'], 'name': r['이름'], 'kind': 'env', 'w': w, 'h': h, 'cost': cost,
            'scenery': sc, 'noise': conv(r['Nz']), 'upkeep': 0,
            'seasonBonus': parse_season_bonus(r['계절 보너스']), 'unlockText': raw(r['해금']),
        }
        if sc_night is not None:
            o['sceneryNight'] = sc_night
        out.append(o)

    for r in doc.section('1.6 ').table():
        size = conv(r['크기'])
        out.append({
            'id': r['id'], 'name': r['이름'], 'kind': 'landmark', 'w': size['w'], 'h': size['h'],
            'cost': conv(r['Cost']), 'scenery': 0, 'noise': 0, 'upkeep': 0,
            'effectText': raw(r['효과']), 'unlockText': raw(r['해금']),
        })

    ids = [o['id'] for o in out]
    dup = {i for i in ids if ids.count(i) > 1}
    if dup:
        raise ValueError(f'오브젝트 id 중복: {sorted(dup)}')
    return out


# ---------------------------------------------------------------------------
# §2 상성
# ---------------------------------------------------------------------------
def emit_compat(doc: Doc) -> tuple[list[dict], dict]:
    sec = doc.section('2. ')
    out = []
    for r in sec.table():
        b = r['B'].strip()
        count = 1
        radius = None
        m = re.search(r'×(\d+)', b)
        if m:
            count = int(m.group(1))
            b = b.replace(m.group(0), '').strip()
        m = re.search(r'\(반경\s*(\d+)\)', b)
        if m:
            radius = int(m.group(1))
            b = b.replace(m.group(0), '').strip()
        b_ids = [x.strip() for x in b.split('/')]
        row = {
            'a': r['A'].strip(), 'b': r['B'].strip(), 'bIds': b_ids, 'bCount': count,
            'effectText': r['효과'].strip(), 'hidden': r['히든'].strip() == '히든',
        }
        if radius is not None:
            row['radius'] = radius
        out.append(row)

    meta: dict[str, Any] = {}
    m = re.search(r'반경\s*(\d+)', sec.title)
    if m:
        meta['radius'] = int(m.group(1))
    legend = sec.text()
    m = re.search(r'↑ = Pop\s*([+\-−]\d+)\s*Fee\s*([+\-−]\d+)%', legend)
    if m:
        meta['up'] = {'pop': signed(m.group(1)), 'feePct': signed(m.group(2))}
    m = re.search(r'↑↑ = ([+\-−]\d+)\s*/\s*([+\-−]\d+)%', legend)
    if m:
        meta['upup'] = {'pop': signed(m.group(1)), 'feePct': signed(m.group(2))}
    m = re.search(r'↓ = ([+\-−]\d+)\s*/\s*([+\-−]\d+)%', legend)
    if m:
        meta['down'] = {'pop': signed(m.group(1)), 'feePct': signed(m.group(2))}
    m = re.search(r'그 층 인기에도\s*±(\d+)', legend)
    if m:
        meta['segmentPopularity'] = int(m.group(1))
    meta['legendText'] = legend
    return out, meta


# ---------------------------------------------------------------------------
# §3 아이템
# ---------------------------------------------------------------------------
ITEM_IDS = {
    '제주 차 세트': 'jeju_tea_set', '감귤 잼': 'tangerine_jam', '해초 비료': 'seaweed_fertilizer', '꿀': 'honey',
    '표고버섯': 'mushroom', '꽃밭 포스터': 'flower_poster', '만화책': 'comic_book', '우유(목장)': 'ranch_milk',
    '방석': 'cushion', '파라솔': 'parasol', '초롱': 'lantern', '돌하르방 미니': 'mini_dolhareubang',
}


def emit_items(doc: Doc) -> list[dict]:
    out = []
    for r in doc.section('3. ').table():
        name = r['아이템'].strip()
        out.append({
            'id': ITEM_IDS[name], 'name': name, 'sourceText': r['획득'].strip(),
            'seat': conv(r['좌석']), 'facility': conv(r['시설']), 'farm': conv(r['농사']), 'env': conv(r['환경']),
            'majorText': raw(r['대폭인 곳']),
        })
    return out


# ---------------------------------------------------------------------------
# §4 손님층
# ---------------------------------------------------------------------------
def emit_segments(doc: Doc) -> list[dict]:
    out = []
    for r in doc.section('4. ').table():
        bases, _ = parse_likes(r['선호 베이스'] + '×')
        _, stats = parse_likes('×' + r['선호 스탯'])
        out.append({
            'id': r['id'], 'name': r['이름'], 'initialPopularity': conv(r['초기 인기']), 'budget': conv(r['예산']),
            'likesBase': bases, 'likesBaseText': r['선호 베이스'].strip(), 'likesStats': stats,
            'likesObjects': [x.strip() for x in r['선호 좌석/시설'].split('·')],
            'dislikes': [x.strip() for x in r['싫어함'].split('·')], 'unlockText': r['해금'].strip(),
        })
    return out


# ---------------------------------------------------------------------------
# §5 지역 손님
# ---------------------------------------------------------------------------
REGION_IDS = ['dongmun', 'hyeopjae', 'seongsan', 'jungmun', 'udo', 'hallasan', 'dolhareubang']
RE_GUEST_LINE = re.compile(r'^(\d+)\s+(.+)$')
RE_REGION_TITLE = re.compile(r'^5\.\d+\s+(.+?)\s*\(팝업\s*([\d,]+)(?:,\s*(.*?))?\)\s*$')


def parse_guest_line(line: str) -> dict | None:
    m = RE_GUEST_LINE.match(line.strip())
    if not m:
        return None
    no = int(m.group(1))
    parts = [p.strip() for p in m.group(2).split('/')]
    if len(parts) != 5:
        raise ValueError(f'손님 줄 필드 수 {len(parts)} != 5: {line!r}')
    name, job, one_line, likes, money = parts
    bases, stats = parse_likes(likes)
    budget, note = num_with_note(money)
    g = {
        'no': no, 'name': name, 'job': job, 'line': one_line,
        'likesBase': bases, 'likesStats': stats, 'budget': budget,
    }
    if note:
        g['budgetNote'] = note
    return g


def emit_regions_and_guests(doc: Doc) -> tuple[list[dict], list[dict]]:
    sec = doc.section('5. ')
    footer = sec.text() + '\n' + '\n'.join(s.text() for s in doc.children('5. '))
    start = decay = recover = None
    m = re.search(r'활기/식욕\s*(\d+)\s*시작,\s*팝업 주당\s*[−\-](\d+),\s*떠나면 주당\s*\+(\d+)', footer)
    if m:
        start, decay, recover = int(m.group(1)), int(m.group(2)), int(m.group(3))
    regions, guests = [], []
    subs = doc.children('5. ')
    if len(subs) != len(REGION_IDS):
        raise ValueError(f'지역 수 {len(subs)} != {len(REGION_IDS)}')
    for rid, s in zip(REGION_IDS, subs):
        m = RE_REGION_TITLE.match(s.title)
        if not m:
            raise ValueError(f'지역 제목 형식: {s.title!r}')
        region = {
            'id': rid, 'name': m.group(1).strip(), 'popupCost': signed(m.group(2)),
            'vitality': start if start is not None else 100, 'appetite': start if start is not None else 100,
            'decayPerWeek': decay if decay is not None else 8, 'recoverPerWeek': recover if recover is not None else 5,
        }
        if m.group(3):
            region['note'] = m.group(3).strip()
        regions.append(region)
        for line in s.text_lines():
            g = parse_guest_line(line)
            if g is None:
                continue
            g = {'id': f'ng{g["no"]:02d}', 'regionId': rid, **g, 'face': {'seed': g['no']}, 'acc': []}
            guests.append(g)
    return regions, guests


# ---------------------------------------------------------------------------
# §6 재료·콤보
# ---------------------------------------------------------------------------
def emit_ingredients(doc: Doc) -> list[dict]:
    out = []
    for r in doc.section('6.1 ').table():
        cat = r['분류'].strip()
        out.append({
            'id': r['id'], 'name': r['이름'], 'category': CATEGORY_KO[cat], 'categoryName': cat,
            'stats': {
                'taste': conv(r['맛']), 'aroma': conv(r['향']), 'look': conv(r['보기']),
                'health': conv(r['건강']), 'volume': conv(r['양']), 'jeju': conv(r['제주']),
            },
            'cost': conv(r['원가']), 'sourceText': r['획득'].strip(),
        })
    return out


COMBO_IDS = {
    '크리미': 'creamy', '고소함': 'nutty', '부드러움': 'smooth', '바다 향': 'sea_aroma', '톡 쏨': 'zesty',
    '신선함': 'fresh', '든든함': 'hearty', '연하게': 'light', '제주의 맛': 'jeju_taste', '달콤 씁쓸': 'bittersweet',
    '라떼': 'latte', '티 라떼': 'tea_latte', '과일 폭탄': 'fruit_bomb', '베이킹': 'baking', '건강 한 끼': 'healthy_meal',
    '향긋한 아침': 'fragrant_morning', '꿀 조합': 'honey_combo', '매콤': 'spicy', '시원함': 'cool', '따뜻함': 'warm',
}
INGREDIENT_QUALIFIER = {'꿀': 'honey', '얼음': 'ice', '고추': 'chili', '시나몬': 'cinnamon', '달걀': 'egg'}


def parse_combo_side(s: str) -> dict:
    s = s.strip()
    m = re.match(r'^(.+?)\((.+)\)$', s)
    base, qual = (m.group(1).strip(), m.group(2).strip()) if m else (s, None)
    side: dict[str, Any] = {}
    if base == '아무거나':
        side['category'] = 'any'
    elif base == '제주 재료':
        side['category'] = 'jeju'
        mm = re.match(r'제주\s*≥\s*(\d+)', qual or '')
        if mm:
            side['minJeju'] = int(mm.group(1))
        qual = None
    elif base in CATEGORY_KO:
        side['category'] = CATEGORY_KO[base]
    elif base in INGREDIENT_QUALIFIER and qual in CATEGORY_KO:
        # '달걀(단백)' → 카테고리 단백, 재료 달걀
        side['category'] = CATEGORY_KO[qual]
        side['ingredient'] = INGREDIENT_QUALIFIER[base]
        qual = None
    else:
        side['category'] = base
    if qual:
        side['ingredient'] = INGREDIENT_QUALIFIER.get(qual, qual)
    return side


def parse_combo_bonus(s: str) -> dict:
    bonus: dict[str, Any] = parse_stat_bonus(s)
    m = re.search(r'재료비\s*([+\-−]\d+)%', s)
    if m:
        bonus['costPct'] = signed(m.group(1))
    for season, val in re.findall(r'(봄|여름|가을|겨울)\s*인기\s*([+\-−]\d+)', s):
        bonus[f'{SEASON_KO[season]}Popularity'] = signed(val)
    return bonus


def emit_combos(doc: Doc) -> list[dict]:
    out = []
    for r in doc.section('6.2 ').table():
        name = r['콤보'].strip()
        a, b = [parse_combo_side(x) for x in r['조합'].split('×')]
        out.append({
            'id': COMBO_IDS[name], 'name': name, 'a': a, 'b': b, 'pairText': r['조합'].strip(),
            'bonus': parse_combo_bonus(r['보너스']), 'bonusText': r['보너스'].strip(),
        })
    return out


# ---------------------------------------------------------------------------
# §7 히든 레시피
# ---------------------------------------------------------------------------
HIDDEN_RECIPE_IDS = {
    '제주 말차 라떼': 'jeju_matcha_latte', '한라봉 에이드': 'hallabong_ade', '감귤 치즈케이크': 'tangerine_cheesecake',
    '우도 땅콩 크림 라떼': 'udo_peanut_cream_latte', '톳 크루아상': 'seaweed_croissant',
    '흑돼지 샌드위치': 'black_pork_sandwich', '고사리 파스타': 'gosari_pasta', '용천수 콜드브루': 'spring_water_coldbrew',
    '유채꽃 팬케이크': 'canola_pancake', '전복 죽': 'abalone_porridge',
}


def emit_hidden_recipes(doc: Doc) -> list[dict]:
    text = doc.section('7. ').text()
    m = re.search(r'히든 레시피\s*\d+.*?:\s*(.+?)\.\s*$', text, re.M)
    if not m:
        raise ValueError('히든 레시피 목록 없음')
    out = []
    for item in re.findall(r'([^,()]+?)\(([^)]+)\)', m.group(1)):
        name = item[0].strip()
        out.append({'id': HIDDEN_RECIPE_IDS[name], 'name': name, 'ingredients': [x.strip() for x in item[1].split('+')]})
    return out


# ---------------------------------------------------------------------------
# §8 토핑
# ---------------------------------------------------------------------------
RE_SKILL_TOKEN = re.compile(r'([가-힣]+)\s*(\+{1,3})')


def emit_toppings(doc: Doc) -> list[dict]:
    out = []
    for r in doc.section('8. ').table():
        cost, note = num_with_note(r['원가'])
        t = {
            'id': r['id'], 'name': r['이름'], 'cost': cost, 'stats': parse_stat_bonus(r['스탯']),
            'skillText': r['스킬'].strip(),
            'skills': [{'name': n, 'level': len(p)} for n, p in RE_SKILL_TOKEN.findall(r['스킬'])],
        }
        if note:
            t['costNote'] = note
        out.append(t)
    return out


# ---------------------------------------------------------------------------
# §9 직원
# ---------------------------------------------------------------------------
RECRUIT_IDS = {'동네 전단': 'flyer', '구인 사이트': 'job_site', '헤드헌터': 'headhunter', 'TV 광고(홍보 활동 연동)': 'tv_ad'}
SKILL_IDS = {
    '커피 장인': 'coffee_master', '디저트 장인': 'dessert_master', '식사 장인': 'meal_master', '손이 빠름': 'fast_hands',
    '제주 토박이': 'jeju_native', '인스타 감성': 'insta_sense', '외국어': 'foreign_language', '통역사': 'interpreter',
    '절약': 'thrift', '연구광': 'research_nerd', '인기인': 'popular', '행운': 'lucky', '튼튼함': 'sturdy',
    '철인': 'ironman', '성실': 'diligent', '세련': 'refined', '로스팅 마스터': 'roasting_master',
    '접객의 신': 'service_god', '인플루언서': 'influencer', '향토 요리': 'local_cuisine',
}


def emit_recruit_tiers(doc: Doc) -> list[dict]:
    out = []
    for r in doc.section('9.1 ').table():
        name = r['방법'].strip()
        cost = conv(r['비용'])
        pools = conv(r['등장 풀'])
        out.append({
            'id': RECRUIT_IDS[name], 'name': name,
            'cost': cost if isinstance(cost, (int, float)) else None,
            'costText': r['비용'].strip(),
            'candidates': conv(r['후보']), 'statRange': conv(r['스탯 범위']),
            'pools': pools if isinstance(pools, list) else [pools],
        })
    return out


def emit_skills(doc: Doc) -> list[dict]:
    text = doc.section('9.3 ').text()
    out = []
    for item in split_depth0(text, '·'):
        m = re.match(r'^(.+?)(?:\((.+)\))?$', item.strip())
        name = m.group(1).strip()
        out.append({'id': SKILL_IDS[name], 'name': name, 'effectText': (m.group(2) or '').strip() or None})
    return out


def parse_staff_item(item: str, pool: str, idx: int) -> dict:
    s = item.strip().replace('**', '')
    open_i = s.rfind('(')
    if open_i < 0 or not s.endswith(')'):
        raise ValueError(f'직원 항목 형식: {item!r}')
    name = s[:open_i].strip()
    inner = s[open_i + 1:-1]
    parts = [p.strip() for p in inner.split(',')]
    stats = [int(x) for x in parts[0].split('·')]
    if len(stats) != 4:
        raise ValueError(f'스탯 4개 아님: {item!r}')
    staff: dict[str, Any] = {
        'id': f'{pool.lower()}{idx:02d}', 'pool': pool, 'name': name,
        'stats': {'service': stats[0], 'cooking': stats[1], 'sense': stats[2], 'stamina': stats[3]},
        'skill': None, 'line': None,
    }
    m = re.match(r'^(.+?)\s*→\s*"(.+)"$', name)
    if m:
        staff['name'] = m.group(2)
        staff['nameNote'] = name
    rest = []
    for p in parts[1:]:
        hit = next((k for k in sorted(SKILL_IDS, key=len, reverse=True) if k in p), None)
        if hit and staff['skill'] is None:
            staff['skill'] = SKILL_IDS[hit]
            if p != hit:
                rest.append(p)
        else:
            rest.append(p)
    if rest:
        staff['line'] = rest[0]
    if len(rest) > 1:
        staff['note'] = ', '.join(rest[1:])
    return staff


def emit_staff_pool(doc: Doc) -> list[dict]:
    out = []
    for line in doc.section('9.2 ').text_lines():
        m = re.match(r'^([ABC]):\s*(.+)$', line)
        if not m:
            continue
        pool = m.group(1)
        for i, item in enumerate(split_depth0(m.group(2), '·'), 1):
            out.append(parse_staff_item(item, pool, i))
    return out


# ---------------------------------------------------------------------------
# §11 투자
# ---------------------------------------------------------------------------
def emit_investments(doc: Doc) -> list[dict]:
    out = []
    for r in doc.section('11. ').table():
        no = conv(r['#'])
        base = {'conditionText': r['조건'].strip(), 'rewardText': r['보상'].strip()}
        if isinstance(no, dict):  # 21~30, 31~40 범위 행 → 자리표시자 전개
            name = r['이름'].strip()
            m = re.match(r'^(.+?)\s*\d+\s*\((.+)\)$', name)
            if m:
                names = [f'{m.group(1).strip()}: {x.strip()}' for x in m.group(2).split('·')]
            else:
                names = [f'{name} #{i}' for i in range(1, no['max'] - no['min'] + 2)]
            if len(names) != no['max'] - no['min'] + 1:
                raise ValueError(f'투자 범위 행 이름 수 불일치: {name!r}')
            for i, n in enumerate(names):
                out.append({
                    'id': f'inv{no["min"] + i:02d}', 'no': no['min'] + i, 'name': n, 'cost': None,
                    'costRange': conv(r['비용']), 'todo': True, 'groupText': name, **base,
                })
        else:
            out.append({'id': f'inv{no:02d}', 'no': no, 'name': r['이름'].strip(), 'cost': conv(r['비용']), **base})
    return out


# ---------------------------------------------------------------------------
# §12 분위기
# ---------------------------------------------------------------------------
AURA_IDS = {
    '감성 카페': 'emotional_cafe', '동네 사랑방': 'village_parlor', '인생샷 카페': 'photo_cafe',
    '가족 나들이': 'family_outing', '조용한 서재': 'quiet_study', '바다 카페': 'sea_cafe',
    '밤의 정원': 'night_garden', '건강 스테이션': 'health_station',
}
AURA_OBJECT_ALIAS = {'초롱길': 'lantern_path', '용천수': None}


def resolve_object_id(name: str, objects: list[dict]) -> str | None:
    if name in AURA_OBJECT_ALIAS:
        return AURA_OBJECT_ALIAS[name]
    for o in objects:
        if o['name'] == name:
            return o['id']
    hits = [o for o in objects if o['name'].startswith(name)]
    if len(hits) == 1:
        return hits[0]['id']
    if hits:
        return hits[0]['id']
    raise ValueError(f'분위기 오브젝트 이름 해석 실패: {name!r}')


def emit_auras(doc: Doc, objects: list[dict]) -> list[dict]:
    sec = doc.section('12. ')
    radius = None
    m = re.search(r'반경\s*(\d+)', sec.title)
    if m:
        radius = int(m.group(1))
    mults = [float(x) for x in re.findall(r'×(\d+(?:\.\d+)?)', sec.title)]
    out = []
    for item in split_depth0(sec.text(), '·'):
        m = re.match(r'^(.+?)\((.+?)\s*→\s*(.+)\)$', item.strip())
        if not m:
            raise ValueError(f'분위기 항목 형식: {item!r}')
        name = m.group(1).strip()
        requires = []
        for req in m.group(2).split('·'):
            req = req.strip()
            mm = re.match(r'^(.+?)\s+(\d+)$', req)
            obj, cnt = (mm.group(1), int(mm.group(2))) if mm else (req, 1)
            requires.append({'name': obj, 'objectId': resolve_object_id(obj, objects), 'count': cnt})
        out.append({
            'id': AURA_IDS[name], 'name': name, 'requires': requires,
            'targets': [t.strip() for t in m.group(3).split('·')],
            'radius': radius, 'levelMult': mults,
        })
    return out


# ---------------------------------------------------------------------------
# §13 콩쿠르
# ---------------------------------------------------------------------------
def emit_contests(doc: Doc) -> list[dict]:
    out = []
    for i, r in enumerate(doc.section('13. ').table(), 1):
        w = conv(r['심사(맛/보기/제주/가격)'])
        out.append({
            'id': f'contest{i:02d}', 'name': r['이름'].strip(), 'level': conv(r['Lv']), 'prize': conv(r['상금']),
            'judge': {'taste': w[0], 'look': w[1], 'jeju': w[2], 'price': w[3]},
            'conditionText': r['조건'].strip(), 'rewardText': r['부상'].strip(),
        })
    return out


# ---------------------------------------------------------------------------
# §14 룰렛·메달
# ---------------------------------------------------------------------------
ROULETTE_IDS = ['money', 'research', 'ingredient_box', 'medal', 'item', 'samchun_visit', 'free_promo', 'miss']
MEDAL_SOURCE_IDS = ['request_success', 'contest_win', 'codex_per10', 'year_ranking', 'rare_guest_happy']


def emit_roulette(doc: Doc) -> tuple[dict, list[dict], list[dict]]:
    lines = doc.section('14. ').text_lines()
    roulette_line = next(l for l in lines if l.startswith('룰렛'))
    sources_line = next(l for l in lines if l.startswith('메달 획득'))
    shop_line = next(l for l in lines if l.startswith('메달 상점'))

    body = roulette_line.split(':', 1)[1]
    main, _, tail = body.partition('. ')
    slots = []
    for i, item in enumerate(split_depth0(main.strip().rstrip('.'), '·')):
        m = re.match(r'^(.+?)\s*(\d+)%$', item.strip())
        if not m:
            raise ValueError(f'룰렛 칸 형식: {item!r}')
        slots.append({'id': ROULETTE_IDS[i], 'label': m.group(1).strip(), 'pct': int(m.group(2))})
    if sum(s['pct'] for s in slots) != 100:
        raise ValueError('룰렛 확률 합 != 100')
    extra = re.search(r'추가 회전 메달\s*(\d+)', tail)
    roulette = {'slots': slots, 'extraSpinMedals': int(extra.group(1)) if extra else 1}

    sources = []
    for i, item in enumerate(split_depth0(sources_line.split(':', 1)[1].strip().rstrip('.'), ',')):
        m = re.match(r'^(.+?)\s+(\S+)$', item.strip())
        sources.append({'id': MEDAL_SOURCE_IDS[i], 'name': m.group(1).strip(), 'medals': conv(m.group(2))})

    shop = []
    for i, item in enumerate(split_depth0(shop_line.split(':', 1)[1].strip().rstrip('.'), '·'), 1):
        m = re.match(r'^(.+?)\s+(\d+)$', item.strip())
        if not m:
            raise ValueError(f'메달 상점 항목 형식: {item!r}')
        name = m.group(1).strip()
        entry = {'id': f'shop{i:02d}', 'name': name, 'price': int(m.group(2))}
        if name in ITEM_IDS:
            entry['itemId'] = ITEM_IDS[name]
        shop.append(entry)
    return roulette, sources, shop


# ---------------------------------------------------------------------------
# §15 이벤트
# ---------------------------------------------------------------------------
def emit_events(doc: Doc) -> list[dict]:
    out = []
    for i, r in enumerate(doc.section('15. ').table(), 1):
        prob = r['확률/월'].strip()
        m = re.match(r'^(\d+(?:\.\d+)?)%$', prob)
        out.append({
            'id': f'event{i:02d}', 'name': r['이벤트'].strip(), 'probText': prob,
            'monthProb': _num(m.group(1)) if m else None,
            'conditionText': raw(r['조건']), 'effectText': r['내용'].strip(),
        })
    return out


# ---------------------------------------------------------------------------
# §16 달력
# ---------------------------------------------------------------------------
def emit_calendar(doc: Doc) -> list[dict]:
    text = doc.section('16. ').text().rstrip('.')
    out = []
    for item in split_depth0(text, ' · '):
        m = re.match(r'^(\d+)(?:~(\d+))?월\s+(.+)$', item.strip())
        if not m:
            raise ValueError(f'달력 항목 형식: {item!r}')
        a, b = int(m.group(1)), int(m.group(2) or m.group(1))
        out.append({'months': list(range(a, b + 1)), 'items': split_depth0(m.group(3), '·'), 'text': item.strip()})
    return out


# ---------------------------------------------------------------------------
# §17 등급
# ---------------------------------------------------------------------------
def emit_ranks(doc: Doc) -> tuple[list[dict], list[dict]]:
    sec = doc.section('17. ')
    ranks = []
    for r in sec.table():
        ranks.append({
            'star': conv(r['★']), 'conditions': split_depth0(r['조건 3개'], '·'),
            'unlocks': split_depth0(r['해금'], ','), 'unlockText': r['해금'].strip(),
        })
    text = next(l for l in sec.text_lines() if l.startswith('정착'))
    body = text.split(':', 1)[1].strip().rstrip('.')
    settle = []
    for m in re.finditer(r'\((\d)→(\d)(?:\s+([^)]+))?\)\s*(.*?)(?=\s*·?\s*\(\d→\d|$)', body):
        entry = {'from': int(m.group(1)), 'to': int(m.group(2)), 'conditions': split_depth0(m.group(4).strip(' ·'), '·')}
        if m.group(3):
            entry['label'] = m.group(3).strip()
        settle.append(entry)
    return ranks, settle


# ---------------------------------------------------------------------------
# §18 필지
# ---------------------------------------------------------------------------
# 2차 피드백으로 추가한 필지의 id (1~6은 parcel{#})
PARCEL_IDS = {7: 'village_edge', 8: 'stone_hill', 9: 'orchard'}


def emit_parcels(doc: Doc) -> list[dict]:
    out = []
    for r in doc.section('18. ').table():
        price = conv(r['가격'])
        size = conv(r['크기'])
        no = conv(r['#'])
        out.append({
            'id': PARCEL_IDS.get(no, f'parcel{no}'), 'no': no, 'name': r['필지'].strip(),
            'price': price if isinstance(price, int) else 0, 'priceText': r['가격'].strip(),
            'start': not isinstance(price, int), 'w': size['w'], 'h': size['h'],
            'bonusText': raw(r['구역 보너스']), 'backgroundText': r['배경 해금'].strip(),
        })
    return out


# ---------------------------------------------------------------------------
# §19 상수
# ---------------------------------------------------------------------------
CONSTANT_KEYS = {
    '메뉴 개발 성공/대성공/실패': 'menuDevelop', '로스팅 파라미터 기본 성공률': 'roastParam', '손님 대사 확률': 'guestLine',
    '손님 사진 이벤트(포토존)': 'photoEvent', '유튜버 초대 성공': 'youtuberInvite', '폐창고 발굴': 'warehouseDig',
    '밭 조성 발굴': 'fieldDig', '히든 콤보 발견 시 팡파르': 'hiddenComboFanfare', '희귀 손님 출현': 'rareGuest',
    '라이벌 개점': 'rivalOpen', '룰렛': 'roulette', '손님층 인기 자연 감소': 'popularityDecay',
    '단골 게이지': 'regularGauge', '태풍 발생': 'typhoon', '손님 예산 초과 메뉴': 'overBudget',
    '기력 30 미만 효과': 'lowStamina', '미지급 월급 퇴사': 'unpaidQuit',
}


def emit_constants(doc: Doc) -> dict:
    out = {}
    for r in doc.section('19. ').table():
        name = r['항목'].strip()
        val = r['값'].strip()
        v = conv(val)
        out[CONSTANT_KEYS[name]] = {'name': name, 'value': v if isinstance(v, (int, float)) else None, 'text': val}
    return out


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def build(doc: Doc) -> dict[str, Any]:
    objects = emit_objects(doc)
    compat, compat_meta = emit_compat(doc)
    regions, named_guests = emit_regions_and_guests(doc)
    roulette, medal_sources, medal_shop = emit_roulette(doc)
    ranks, settle_ranks = emit_ranks(doc)
    return {
        'objects': objects, 'compat': compat, 'compat_meta': compat_meta, 'items': emit_items(doc),
        'segments': emit_segments(doc), 'named_guests': named_guests, 'regions': regions,
        'ingredients': emit_ingredients(doc), 'ingredient_combos': emit_combos(doc),
        'hidden_recipes': emit_hidden_recipes(doc), 'toppings': emit_toppings(doc),
        'staff_pool': emit_staff_pool(doc), 'skills': emit_skills(doc), 'recruit_tiers': emit_recruit_tiers(doc),
        'investments': emit_investments(doc), 'auras': emit_auras(doc, objects), 'contests': emit_contests(doc),
        'roulette': roulette, 'medal_sources': medal_sources, 'medal_shop': medal_shop, 'events': emit_events(doc),
        'calendar': emit_calendar(doc), 'ranks': ranks, 'settle_ranks': settle_ranks, 'parcels': emit_parcels(doc),
        'landmarks': [o for o in objects if o['kind'] == 'landmark'],
        'constants': emit_constants(doc),
    }


def count(v: Any) -> int:
    if isinstance(v, list):
        return len(v)
    if isinstance(v, dict):
        return len(v.get('slots', v))
    return 1


# ===========================================================================
# v2: GDD v2 데이터 표 (2026-09-17-gdd-v2-tables.md) → src/data/generated/v2/*.json
# ===========================================================================
ID_RE = r'[a-z][a-z0-9_]*'

FACILITY_CATEGORY_KO = {
    '쉼': 'rest', '편의': 'convenience', '먹거리': 'food', '즐길거리': 'fun',
    '농사': 'farm', '경관': 'scenery', '랜드마크': 'landmark',
}
TIER_KO = {'소': 'small', '중': 'medium', '대': 'large'}
SPOT_CATEGORY_KO = {'볼거리': 'sight', '먹거리': 'food', '놀거리': 'play', '자연': 'nature'}
GENDER_KO = {'남': 'm', '여': 'f'}
AGE_KO = {'청년': 'youth', '성인': 'adult', '시니어': 'senior'}
GUEST_EFFECT_KO = {
    '아이템': 'item', '자금': 'money', '홍보': 'ad', '연구': 'research', '시설 인기': 'popularity', '응모권': 'ticket',
}
TARGET_KO = {
    '전체': 'all', '여성': 'female', '남성': 'male', '청년': 'youth', '성인': 'adult', '시니어': 'senior', '단체': 'group',
}
YES_KO = {'예': True, '아니오': False}
REWARD_KO = {'자금': 'money', '연구': 'research', '응모권': 'ticket', '마일리지': 'mileage', '홍보': 'ad'}
ITEM_EFFECT_KO = {'인기': 'popularity', '가격': 'price'}
COMBO_APPLY_KO = {'A': 'a', 'B': 'b', '둘 다': 'both'}
COMBO_BONUS = {'up': {'pop': 3, 'feePct': 5}, 'upup': {'pop': 6, 'feePct': 10}, 'down': {'pop': -3, 'feePct': -5}}
COMBO_UPUP_NAMES = {'정상 전망', '천년의 그늘', '저녁 한 상', '인생샷 기념품', '바리스타 쇼'}
COMBO_DOWN_WORDS = ('소음', '시끄러운')


def _cell(r: dict[str, str], key: str) -> str:
    return r[key].strip()


def _int(cell: str) -> int:
    return signed(cell)


def _opt_int(cell: str) -> int | None:
    return None if raw(cell) is None else signed(cell)


def _list(cell: str) -> list[str]:
    if raw(cell) is None:
        return []
    return [x.strip() for x in cell.split('·') if x.strip()]


def parse_unlock_one(s: str) -> dict:
    """해금 조건 텍스트 1개 → 스키마 8종(+카테고리 count 확장)."""
    s = s.strip()
    if s == '시작':
        return {'type': 'start'}
    m = re.fullmatch(r'랭크\s*(\d+)', s)
    if m:
        return {'type': 'rank', 'rank': int(m.group(1))}
    m = re.fullmatch(rf'손님\s+({ID_RE})\s+인기\s*(\d+)', s)
    if m:
        return {'type': 'segment', 'guestId': m.group(1), 'popularity': int(m.group(2))}
    m = re.fullmatch(r'★(\d+)', s)
    if m:
        return {'type': 'star', 'star': int(m.group(1))}
    m = re.fullmatch(rf'부탁\s+({ID_RE})', s)
    if m:
        return {'type': 'quest', 'questId': m.group(1)}
    m = re.fullmatch(rf'관광지\s+({ID_RE})\s+Lv(\d+)', s)
    if m:
        return {'type': 'spot', 'spotId': m.group(1), 'level': int(m.group(2))}
    m = re.fullmatch(r'(\d+)년\s*(\d+)월', s)
    if m:
        return {'type': 'date', 'year': int(m.group(1)), 'month': int(m.group(2))}
    m = re.fullmatch(rf'({ID_RE})\s+(\d+)개', s)
    if m:
        return {'type': 'count', 'objectId': m.group(1), 'count': int(m.group(2))}
    m = re.fullmatch(r'(\S+)\s+(\d+)개', s)
    if m and m.group(1) in FACILITY_CATEGORY_KO:
        return {'type': 'count', 'category': FACILITY_CATEGORY_KO[m.group(1)], 'count': int(m.group(2))}
    raise ValueError(f'해금 조건 형식: {s!r}')


def parse_unlock(cell: str) -> dict:
    """'부탁 q_x·★4' → {'type':'all','conditions':[…]}; 단일 조건은 그대로."""
    parts = _list(cell)
    if not parts:
        raise ValueError(f'해금 조건 없음: {cell!r}')
    conds = [parse_unlock_one(p) for p in parts]
    return conds[0] if len(conds) == 1 else {'type': 'all', 'conditions': conds}


def parse_season_map(cell: str) -> dict[str, int]:
    """'봄 +12·겨울 +3' → {'spring': 12, 'winter': 3}. '—' → {}."""
    out: dict[str, int] = {}
    for season, val in re.findall(r'(봄|여름|가을|겨울)\s*([+\-−]?\d+)', cell):
        out[SEASON_KO[season]] = signed(val)
    return out


def parse_id_count_list(cell: str) -> list[dict]:
    """'tangerine_tree 2·table_out 2' → [{'objectId':…, 'count':…}]."""
    out = []
    for tok in _list(cell):
        m = re.fullmatch(rf'({ID_RE})\s+(\d+)', tok)
        if not m:
            raise ValueError(f'id 수량 형식: {tok!r}')
        out.append({'objectId': m.group(1), 'count': int(m.group(2))})
    return out


def parse_sources(cell: str) -> list[dict]:
    """아이템 획득처: '부탁 q_x·마일리지 상점·응모권 추첨·syrup_class 체험 보상'."""
    out = []
    for tok in _list(cell):
        m = re.fullmatch(rf'부탁\s+({ID_RE})', tok)
        if m:
            out.append({'type': 'quest', 'questId': m.group(1)})
        elif tok == '마일리지 상점':
            out.append({'type': 'mileage_shop'})
        elif tok == '응모권 상점':
            out.append({'type': 'ticket_shop'})
        elif tok == '응모권 추첨':
            out.append({'type': 'ticket_draw'})
        elif (m := re.fullmatch(rf'({ID_RE})(?:\s+체험 보상)?', tok)):
            out.append({'type': 'facility', 'objectId': m.group(1)})
        else:
            out.append({'type': 'other', 'text': tok})
    return out


# §1 시설 --------------------------------------------------------------------
def emit_v2_facilities(doc: Doc) -> list[dict]:
    out = []
    for r in doc.section('1.1 ').table():
        size = conv(r['크기'])
        fee_cell = _cell(r, '요금')
        fee_pct = fee = None
        if raw(fee_cell) is not None:
            m = re.fullmatch(r'([\d,]+)%', fee_cell)
            if m:
                fee_pct = signed(m.group(1))
            else:
                fee = signed(fee_cell)
        cat = _cell(r, '카테고리')
        out.append({
            'id': r['id'], 'name': _cell(r, '이름'), 'category': FACILITY_CATEGORY_KO[cat], 'categoryName': cat,
            'tier': TIER_KO[_cell(r, '티어')], 'w': size['w'], 'h': size['h'],
            'cost': _int(r['건설비']), 'buildDays': _int(r['건설 시간']), 'upkeep': _int(r['유지비']),
            'popularity': _int(r['인기']), 'feePct': fee_pct, 'fee': fee, 'feeText': raw(fee_cell),
            'scenery': _int(r['경관']), 'noise': _int(r['소음']), 'seasonBonus': parse_season_map(r['계절 보너스']),
            'unlock': parse_unlock(r['해금']), 'unlockText': _cell(r, '해금'), 'description': _cell(r, '설명'),
        })
    return out


# §2 손님 --------------------------------------------------------------------
def emit_v2_guests(doc: Doc, chains: list[dict]) -> list[dict]:
    chain_of = {g: c['chain'] for c in chains for g in c['guests']}
    out = []
    for r in doc.section('2.1 ').table():
        effect = _cell(r, '효과')
        age = _cell(r, '연령')
        gender = _cell(r, '성별')
        out.append({
            'id': r['id'], 'name': _cell(r, '이름'),
            'tags': {'gender': GENDER_KO.get(gender), 'age': AGE_KO.get(age), 'group': YES_KO[_cell(r, '단체')]},
            'effect': GUEST_EFFECT_KO[effect], 'effectName': effect, 'money': _int(r['소지금']),
            'likes': [FACILITY_CATEGORY_KO[x] for x in _list(r['선호 카테고리'])], 'likesText': _cell(r, '선호 카테고리'),
            'unlock': parse_unlock(r['해금 조건']), 'unlockText': _cell(r, '해금 조건'),
            'questId': _cell(r, '부탁 ID'), 'nextGuestId': raw(r['다음 손님']),
            'chain': chain_of.get(r['id']), 'line': _cell(r, '대사'),
        })
    return out


# §3 부탁 --------------------------------------------------------------------
def parse_quest_condition(kind: str, params: str) -> dict:
    kind = kind.strip()
    p = raw(params)
    if kind == 'none':
        return {'type': 'none', 'params': {}}
    m = re.fullmatch(rf'({ID_RE})\s+(\d+)', p or '')
    if not m:
        raise ValueError(f'부탁 파라미터 형식: {params!r}')
    ident, n = m.group(1), int(m.group(2))
    keys = {
        'menuSold': ('menuId', 'count'), 'objectPlaced': ('objectId', 'count'), 'spotLevel': ('spotId', 'level'),
        'segmentPopularity': ('guestId', 'popularity'), 'item': ('itemId', 'count'),
    }
    if kind not in keys:
        raise ValueError(f'부탁 조건 타입: {kind!r}')
    a, b = keys[kind]
    return {'type': kind, 'params': {a: ident, b: n}}


def parse_rewards(cell: str) -> list[dict]:
    out = []
    for tok in _list(cell):
        m = re.fullmatch(rf'아이템\s+({ID_RE})', tok)
        if m:
            out.append({'type': 'item', 'itemId': m.group(1)})
            continue
        m = re.fullmatch(r'(자금|연구|응모권|마일리지|홍보)\s*([+\-−]?[\d,]+)', tok)
        if not m:
            raise ValueError(f'보상 형식: {tok!r}')
        out.append({'type': REWARD_KO[m.group(1)], 'amount': signed(m.group(2))})
    return out


def emit_v2_quests(doc: Doc) -> list[dict]:
    out = []
    for r in doc.section('3.1 ').table():
        out.append({
            'id': r['id'], 'guestId': _cell(r, '의뢰 손님'), 'description': _cell(r, '내용'),
            'condition': parse_quest_condition(r['조건 타입'], r['파라미터']), 'paramsText': raw(r['파라미터']),
            'rewards': parse_rewards(r['보상']), 'rewardText': _cell(r, '보상'), 'unlockGuestId': raw(r['해금 손님']),
        })
    return out


# §4 콤보 --------------------------------------------------------------------
def combo_grade(name: str) -> str:
    if any(w in name for w in COMBO_DOWN_WORDS):
        return 'down'
    if name in COMBO_UPUP_NAMES:
        return 'upup'
    return 'up'


def emit_v2_combos(doc: Doc) -> list[dict]:
    out = []
    for r in doc.section('4.1 ').table():
        name = _cell(r, '이름')
        grade = combo_grade(name)
        target = _cell(r, '대상 손님층')
        out.append({
            'id': r['id'], 'name': name, 'a': _cell(r, '시설 A'), 'b': _cell(r, '시설 B'),
            'target': TARGET_KO[target], 'targetName': target, 'applyTo': COMBO_APPLY_KO[_cell(r, '효과')],
            'grade': grade, 'bonus': dict(COMBO_BONUS[grade]), 'hidden': YES_KO[_cell(r, '히든')],
        })
    return out


# §5 세트 --------------------------------------------------------------------
def emit_v2_sets(doc: Doc) -> list[dict]:
    out = []
    for r in doc.section('5.1 ').table():
        effect = _cell(r, '효과')
        m = re.match(r'^인기\s*×([\d./]+)\s*,\s*(.*)$', effect)
        mults = [float(x) for x in m.group(1).split('/')] if m else []
        target = _cell(r, '대상 손님층')
        out.append({
            'id': r['id'], 'name': _cell(r, '이름'), 'requires': parse_id_count_list(r['필요 시설']),
            'requiresText': _cell(r, '필요 시설'), 'target': TARGET_KO[target], 'targetName': target,
            'levelMult': mults, 'extraEffectText': m.group(2).strip() if m else None, 'effectText': effect,
        })
    return out


# §6 관광지 ------------------------------------------------------------------
def emit_v2_spots(doc: Doc) -> list[dict]:
    out = []
    for r in doc.section('6.1 ').table():
        a1, a5 = _int(r['Lv1 매력도']), _int(r['Lv5 매력도'])
        levels = []
        for lv in range(1, 6):
            appeal = a1 if lv == 1 else a5 if lv == 5 else round(a1 + (a5 - a1) * (lv - 1) / 4)
            levels.append({'level': lv, 'cost': _int(r[f'Lv{lv} 비용']), 'appeal': appeal})
        cat = _cell(r, '카테고리')
        out.append({
            'id': r['id'], 'name': _cell(r, '이름'), 'category': SPOT_CATEGORY_KO[cat], 'categoryName': cat,
            'order': _int(r['순서']), 'levels': levels, 'appealLv1': a1, 'appealLv5': a5,
            'lv2GuestId': _cell(r, 'Lv2 해금 손님'), 'lv4QuestId': _cell(r, 'Lv4 해금 부탁'),
            'nextSpotId': raw(r['다음 관광지']), 'unlock': parse_unlock(r['해금']), 'unlockText': _cell(r, '해금'),
        })
    return out


# §7~9 직원·채용·유니폼 -------------------------------------------------------
def emit_v2_staff_pool(doc: Doc) -> list[dict]:
    out = []
    for r in doc.section('7.1 ').table():
        out.append({
            'id': r['id'], 'name': _cell(r, '이름'), 'line': _cell(r, '배경 한 줄'),
            'stats': {'stamina': _int(r['체력']), 'strength': _int(r['힘']), 'skill': _int(r['기술']), 'smile': _int(r['미소'])},
            'statCap': _int(r['상한']), 'maxLevel': _int(r['최대 레벨']), 'salary': _int(r['급여']),
            'recruitTier': _int(r['채용 단계']), 'special': YES_KO[_cell(r, '특수 여부')],
        })
    return out


def emit_v2_recruit_tiers(doc: Doc) -> list[dict]:
    out = []
    for i, r in enumerate(doc.section('8.1 ').table(), 1):
        out.append({
            'id': r['id'], 'tier': i, 'name': _cell(r, '이름'), 'cost': _int(r['비용']), 'candidates': _int(r['후보 수']),
            'statRange': conv(r['스탯 범위']), 'unlock': parse_unlock(r['해금 이벤트']), 'unlockText': _cell(r, '해금 이벤트'),
        })
    return out


def emit_v2_uniforms(doc: Doc) -> list[dict]:
    out = []
    for r in doc.section('9.1 ').table():
        parts: dict[str, str] = {}
        for tok in _list(r['파츠']):
            k, _, v = tok.partition(':')
            parts[k.strip()] = v.strip()
        out.append({
            'id': r['id'], 'name': _cell(r, '이름'), 'ticketTier': _int(r['응모권 단계']),
            'effectText': _cell(r, '효과'), 'parts': parts,
        })
    return out


# §10 아이템·상점 -------------------------------------------------------------
def emit_v2_items(doc: Doc) -> list[dict]:
    out = []
    for r in doc.section('10.1 ').table():
        effect = _cell(r, '효과')
        m = re.fullmatch(r'(인기|가격)\s*([+\-−]\d+)', effect)
        if not m:
            raise ValueError(f'강화 아이템 효과 형식: {effect!r}')
        out.append({
            'id': r['id'], 'name': _cell(r, '이름'), 'sources': parse_sources(r['획득처']), 'sourceText': _cell(r, '획득처'),
            'bestFacilities': _list(r['잘 맞는 시설']),
            'effect': {'stat': ITEM_EFFECT_KO[m.group(1)], 'value': signed(m.group(2))}, 'effectText': effect,
        })
    return out


def emit_v2_special_items(doc: Doc) -> list[dict]:
    out = []
    for r in doc.section('10.2 ').table():
        out.append({
            'id': r['id'], 'name': _cell(r, '이름'), 'sources': parse_sources(r['획득처']), 'sourceText': _cell(r, '획득처'),
            'effectText': _cell(r, '효과'),
        })
    return out


def emit_v2_shop(doc: Doc, prefix: str, item_ids: set[str], uniforms: list[dict]) -> list[dict]:
    uniform_by_tier = {u['ticketTier']: u['id'] for u in uniforms}
    out = []
    for r in doc.section(prefix).table():
        entry = {'id': r['id'], 'name': _cell(r, '품목'), 'price': _int(r['가격']), 'description': _cell(r, '설명')}
        m = re.fullmatch(r'(?:ms|ts)_(.+)', r['id'])
        if m and m.group(1) in item_ids:
            entry['itemId'] = m.group(1)
        m = re.fullmatch(r'ts_uniform_(\d+)', r['id'])
        if m:
            entry['uniformId'] = uniform_by_tier[int(m.group(1))]
        out.append(entry)
    return out


# §11 가이드북 ----------------------------------------------------------------
def emit_v2_guidebooks(doc: Doc) -> list[dict]:
    out = []
    for r in doc.section('11.1 ').table():
        seeds = [{'itemId': x['objectId'], 'count': x['count']} for x in parse_id_count_list(r['씨앗'])]
        out.append({
            'id': r['id'], 'name': _cell(r, '이름'), 'unlock': parse_unlock(r['해금']), 'unlockText': _cell(r, '해금'),
            'criteriaText': _cell(r, '심사 기준'), 'prize': _int(r['1위 상금']), 'research': _int(r['연구']),
            'seeds': seeds, 'seedText': raw(r['씨앗']),
        })
    return out


# §12 이벤트 ------------------------------------------------------------------
def emit_v2_events(doc: Doc) -> list[dict]:
    out = []
    for r in doc.section('12.1 ').table():
        prob = _cell(r, '확률')
        m = re.fullmatch(r'(\d+(?:\.\d+)?)%', prob)
        if not m:
            raise ValueError(f'이벤트 확률 형식: {prob!r}')
        out.append({
            'id': r['id'], 'name': _cell(r, '이름'), 'seasonText': _cell(r, '계절/월'), 'prob': _num(m.group(1)),
            'conditionText': raw(r['조건']), 'effectText': _cell(r, '효과'), 'line': _cell(r, '대사'),
        })
    return out


# §13 경관 계절 ---------------------------------------------------------------
def emit_v2_scenery_seasons(doc: Doc) -> list[dict]:
    out = []
    for r in doc.section('13.1 ').table():
        out.append({
            'id': r['id'], 'name': _cell(r, '이름'), 'scenery': _int(r['기본 경관']),
            'seasons': {'spring': _int(r['봄']), 'summer': _int(r['여름']), 'autumn': _int(r['가을']), 'winter': _int(r['겨울'])},
        })
    return out


# §14 추가 메뉴 ---------------------------------------------------------------
def emit_v2_extra_menus(doc: Doc) -> list[dict]:
    out = []
    for r in doc.section('14.1 ').table():
        facility = raw(r['필요 시설'])
        out.append({
            'id': r['id'], 'name': _cell(r, '이름'), 'base': BASE_KO[_cell(r, '베이스')], 'price': _int(r['가격']),
            'facilityId': facility, 'hidden': facility is None, 'ingredients': _list(r['재료']),
        })
    return out


# §15 라이벌 -------------------------------------------------------------------
RIVAL_SIZE_KO = {'소': 'small', '중': 'medium', '대': 'large'}
RE_PCT_PLAIN = re.compile(r'(\d+(?:\.\d+)?)%')


def parse_judge_weights(cell: str) -> dict[str, float]:
    """'맛 0.5·향 0.3·제주 0.2' → {'taste': 0.5, 'aroma': 0.3, 'jeju': 0.2}. 합은 1이어야 한다."""
    out: dict[str, float] = {}
    for tok in _list(cell):
        m = re.fullmatch(r'(맛|향|보기|건강|양|제주다움|제주)\s*(\d+(?:\.\d+)?)', tok)
        if not m:
            raise ValueError(f'심사 가중치 형식: {tok!r}')
        out[STAT_KO[m.group(1)]] = float(m.group(2))
    if abs(sum(out.values()) - 1) > 1e-6:
        raise ValueError(f'심사 가중치 합 != 1: {cell!r}')
    return out


def _pct(cell: str) -> float:
    m = RE_PCT_PLAIN.fullmatch(cell.strip())
    if not m:
        raise ValueError(f'퍼센트 형식: {cell!r}')
    return _num(m.group(1))


def emit_v2_rivals(doc: Doc) -> list[dict]:
    out = []
    for r in doc.section('15.3 ').table():
        out.append({
            'id': r['id'], 'name': _cell(r, '이름'), 'size': RIVAL_SIZE_KO[_cell(r, '규모')], 'sizeText': _cell(r, '규모'),
            'upkeep': _int(r['유지비']), 'stealPerMonth': _int(r['뺏는 단골/월']), 'statPenalty': _pct(r['스탯 감소']),
            'judge': parse_judge_weights(r['심사 가중치']), 'bankruptMonthly': _pct(r['월 파산']), 'line': _cell(r, '대사'),
        })
    return out


# guest-chain.mmd -------------------------------------------------------------
RE_MMD_SUBGRAPH = re.compile(r'^\s*subgraph\s+(\S+)\s*$')
RE_MMD_NODE = re.compile(rf'^\s*({ID_RE})\["(.*)"\]\s*$')
RE_MMD_EDGE = re.compile(rf'^\s*({ID_RE})\s*-->\|({ID_RE})\|\s*({ID_RE})\s*$')


def parse_guest_chains(text: str) -> list[dict]:
    """mermaid `graph LR` + subgraph 블록 → [{chain, guests[], edges[{from,to,quest}]}]."""
    chains: list[dict] = []
    cur: dict | None = None
    for line in text.splitlines():
        s = line.strip()
        if not s or s.startswith('%%') or s.startswith('graph') or s.startswith('flowchart'):
            continue
        m = RE_MMD_SUBGRAPH.match(line)
        if m:
            cur = {'chain': m.group(1), 'guests': [], 'edges': []}
            chains.append(cur)
            continue
        if s == 'end':
            cur = None
            continue
        if cur is None:
            raise ValueError(f'subgraph 밖의 줄: {line!r}')
        m = RE_MMD_NODE.match(line)
        if m:
            cur['guests'].append(m.group(1))
            continue
        m = RE_MMD_EDGE.match(line)
        if m:
            cur['edges'].append({'from': m.group(1), 'to': m.group(3), 'quest': m.group(2)})
            continue
        raise ValueError(f'mermaid 줄 형식: {line!r}')
    return chains


# 교차 검증 -------------------------------------------------------------------
def load_menu_ids_v1(path: str = MENUS_V1) -> set[str]:
    with open(path, encoding='utf-8') as f:
        return {m['id'] for m in json.load(f)}


def check_v2_refs(d: dict[str, Any], menu_ids_v1: set[str], v1_object_ids: set[str] = frozenset()) -> list[str]:
    """표 사이의 id 참조를 전부 확인해 끊긴 참조 목록을 돌려준다(비어 있으면 정상)."""
    fac = {x['id'] for x in d['facilities']} | set(v1_object_ids)
    guests = {x['id'] for x in d['guests']}
    quests = {x['id'] for x in d['quests']}
    spots = {x['id'] for x in d['spots']}
    items = {x['id'] for x in d['items']} | {x['id'] for x in d['special_items']}
    staff = {x['id'] for x in d['staff_pool']}
    sets = {x['id'] for x in d['sets']}
    menus = menu_ids_v1 | {x['id'] for x in d['extra_menus']}
    bad: list[str] = []

    def chk(where: str, kind: str, ident: str | None, pool: set[str]) -> None:
        if ident is not None and ident not in pool:
            bad.append(f'{where}: {kind} {ident}')

    def chk_unlock(where: str, u: dict) -> None:
        if u['type'] == 'all':
            for c in u['conditions']:
                chk_unlock(where, c)
        elif u['type'] == 'segment':
            chk(where, 'guest', u['guestId'], guests)
        elif u['type'] == 'quest':
            chk(where, 'quest', u['questId'], quests)
        elif u['type'] == 'spot':
            chk(where, 'spot', u['spotId'], spots)
        elif u['type'] == 'count' and 'objectId' in u:
            chk(where, 'facility', u['objectId'], fac)

    for key in ('facilities', 'guests', 'spots', 'recruit_tiers', 'guidebooks'):
        for x in d[key]:
            chk_unlock(f'{key}/{x["id"]}', x['unlock'])
    for g in d['guests']:
        chk(f'guests/{g["id"]}', 'quest', g['questId'], quests)
        chk(f'guests/{g["id"]}', 'guest', g['nextGuestId'], guests)
    for q in d['quests']:
        w = f'quests/{q["id"]}'
        chk(w, 'guest', q['guestId'], guests)
        chk(w, 'guest', q['unlockGuestId'], guests)
        p = q['condition']['params']
        chk(w, 'menu', p.get('menuId'), menus)
        chk(w, 'facility', p.get('objectId'), fac)
        chk(w, 'spot', p.get('spotId'), spots)
        chk(w, 'guest', p.get('guestId'), guests)
        chk(w, 'item', p.get('itemId'), items)
        for rw in q['rewards']:
            chk(w, 'item', rw.get('itemId'), items)
    for c in d['combos']:
        chk(f'combos/{c["id"]}', 'facility', c['a'], fac)
        chk(f'combos/{c["id"]}', 'facility', c['b'], fac)
    for s in d['sets']:
        for req in s['requires']:
            chk(f'sets/{s["id"]}', 'facility', req['objectId'], fac)
    for s in d['spots']:
        chk(f'spots/{s["id"]}', 'guest', s['lv2GuestId'], guests)
        chk(f'spots/{s["id"]}', 'quest', s['lv4QuestId'], quests)
        chk(f'spots/{s["id"]}', 'spot', s['nextSpotId'], spots)
    for it in d['items'] + d['special_items']:
        for src in it['sources']:
            chk(f'items/{it["id"]}', 'quest', src.get('questId'), quests)
            chk(f'items/{it["id"]}', 'facility', src.get('objectId'), fac)
        for fid in it.get('bestFacilities', []):
            chk(f'items/{it["id"]}', 'facility', fid, fac)
        for sid in re.findall(r'\b(st_[a-z_]+)\b', it['effectText']):
            chk(f'items/{it["id"]}', 'staff', sid, staff)
    for sh in d['mileage_shop'] + d['ticket_shop']:
        chk(f'shop/{sh["id"]}', 'item', sh.get('itemId'), items)
    for gb in d['guidebooks']:
        for sd in gb['seeds']:
            chk(f'guidebooks/{gb["id"]}', 'item', sd['itemId'], items)
    for ev in d['events']:
        for part in _list(ev['conditionText'] or ''):
            m = re.match(rf'^({ID_RE})\s+(\d+개|없음|수확)$', part)
            if m:
                chk(f'events/{ev["id"]}', 'facility', m.group(1), fac)
            m = re.match(rf'^손님\s+({ID_RE})', part)
            if m:
                chk(f'events/{ev["id"]}', 'guest', m.group(1), guests)
            m = re.match(rf'^관광지\s+({ID_RE})', part)
            if m:
                chk(f'events/{ev["id"]}', 'spot', m.group(1), spots)
            m = re.match(rf'^세트\s+({ID_RE})', part)
            if m:
                chk(f'events/{ev["id"]}', 'set', m.group(1), sets)
    for sc in d['scenery_seasons']:
        chk(f'scenery_seasons/{sc["id"]}', 'facility', sc['id'], fac)
    for mn in d['extra_menus']:
        chk(f'extra_menus/{mn["id"]}', 'facility', mn['facilityId'], fac)
    for ch in d['guest_chains']:
        for gid in ch['guests']:
            chk(f'guest_chains/{ch["chain"]}', 'guest', gid, guests)
        for e in ch['edges']:
            chk(f'guest_chains/{ch["chain"]}', 'guest', e['from'], guests)
            chk(f'guest_chains/{ch["chain"]}', 'guest', e['to'], guests)
            chk(f'guest_chains/{ch["chain"]}', 'quest', e['quest'], quests)
    # 체인 그림 ↔ 손님 표(부탁 ID·다음 손님)가 같은 간선 집합인지
    table_edges = {(g['id'], g['questId'], g['nextGuestId']) for g in d['guests'] if g['nextGuestId']}
    mmd_edges = {(e['from'], e['quest'], e['to']) for ch in d['guest_chains'] for e in ch['edges']}
    for e in sorted(table_edges - mmd_edges):
        bad.append(f'guest_chains: 표에만 있는 간선 {e}')
    for e in sorted(mmd_edges - table_edges):
        bad.append(f'guest_chains: 그림에만 있는 간선 {e}')
    return bad


def build_v2(doc: Doc, mmd_text: str) -> dict[str, Any]:
    chains = parse_guest_chains(mmd_text)
    uniforms = emit_v2_uniforms(doc)
    items = emit_v2_items(doc)
    special = emit_v2_special_items(doc)
    item_ids = {x['id'] for x in items} | {x['id'] for x in special}
    data = {
        'facilities': emit_v2_facilities(doc), 'guests': emit_v2_guests(doc, chains), 'quests': emit_v2_quests(doc),
        'combos': emit_v2_combos(doc), 'sets': emit_v2_sets(doc), 'spots': emit_v2_spots(doc),
        'staff_pool': emit_v2_staff_pool(doc), 'recruit_tiers': emit_v2_recruit_tiers(doc), 'uniforms': uniforms,
        'items': items, 'special_items': special,
        'mileage_shop': emit_v2_shop(doc, '10.3 ', item_ids, uniforms),
        'ticket_shop': emit_v2_shop(doc, '10.4 ', item_ids, uniforms),
        'guidebooks': emit_v2_guidebooks(doc), 'events': emit_v2_events(doc),
        'scenery_seasons': emit_v2_scenery_seasons(doc), 'extra_menus': emit_v2_extra_menus(doc),
        'rivals': emit_v2_rivals(doc),
        'guest_chains': chains,
    }
    for key, rows in data.items():
        ids = [r.get('id') or r.get('chain') for r in rows]
        dup = sorted({i for i in ids if ids.count(i) > 1})
        if dup:
            raise ValueError(f'{key} id 중복: {dup}')
    return data


# main ------------------------------------------------------------------------
def write_json_dir(data: dict[str, Any], out_dir: str, label: str = '') -> None:
    os.makedirs(out_dir, exist_ok=True)
    for name, value in data.items():
        path = os.path.join(out_dir, f'{name}.json')
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(value, f, ensure_ascii=False, indent=2)
            f.write('\n')
        print(f'{label}{name}.json: {count(value)}')


def run_v1(doc_path: str = DOC, out_dir: str = OUT_DIR) -> dict[str, Any]:
    with open(doc_path, encoding='utf-8') as f:
        data = build(Doc(f.read()))
    write_json_dir(data, out_dir)
    return data


def run_v2(doc_path: str = DOC_V2, mmd_path: str = MMD_V2, out_dir: str = OUT_DIR_V2,
           menus_path: str = MENUS_V1) -> dict[str, Any]:
    with open(doc_path, encoding='utf-8') as f:
        doc = Doc(f.read())
    with open(mmd_path, encoding='utf-8') as f:
        data = build_v2(doc, f.read())
    bad = check_v2_refs(data, load_menu_ids_v1(menus_path))
    if bad:
        raise ValueError('v2 끊긴 id 참조:\n  ' + '\n  '.join(bad))
    write_json_dir(data, out_dir, 'v2/')
    return data


def main(argv: list[str]) -> int:
    if len(argv) > 1:  # 위치 인자: v1만(DOC OUT)
        run_v1(argv[1], argv[2] if len(argv) > 2 else OUT_DIR)
        return 0
    run_v1()
    run_v2()
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
