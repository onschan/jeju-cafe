"""게임 데이터 설계서(마크다운 표) → src/data/generated/*.json

사용: python3 tools/data/from_tables.py
원본: docs/superpowers/specs/2026-09-17-game-data-tables.md (이 문서가 source of truth)
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
DOC = os.path.join(ROOT, 'docs', 'superpowers', 'specs', '2026-09-17-game-data-tables.md')
OUT_DIR = os.path.join(ROOT, 'src', 'data', 'generated')

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
def emit_parcels(doc: Doc) -> list[dict]:
    out = []
    for r in doc.section('18. ').table():
        price = conv(r['가격'])
        size = conv(r['크기'])
        out.append({
            'id': f'parcel{conv(r["#"])}', 'no': conv(r['#']), 'name': r['필지'].strip(),
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
    '라이벌 개점': 'rivalOpen', '채집 성공': 'gather', '룰렛': 'roulette', '손님층 인기 자연 감소': 'popularityDecay',
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


def main(argv: list[str]) -> int:
    doc_path = argv[1] if len(argv) > 1 else DOC
    out_dir = argv[2] if len(argv) > 2 else OUT_DIR
    with open(doc_path, encoding='utf-8') as f:
        doc = Doc(f.read())
    data = build(doc)
    os.makedirs(out_dir, exist_ok=True)
    for name, value in data.items():
        path = os.path.join(out_dir, f'{name}.json')
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(value, f, ensure_ascii=False, indent=2)
            f.write('\n')
        print(f'{name}.json: {count(value)}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
