"""python3 -m unittest tools/data/test_from_tables.py"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import from_tables as ft  # noqa: E402


class CellConversion(unittest.TestCase):
    def test_numbers(self):
        self.assertEqual(ft.conv('1,200'), 1200)
        self.assertEqual(ft.conv('0'), 0)
        self.assertEqual(ft.conv('1.5'), 1.5)

    def test_percent(self):
        self.assertEqual(ft.conv('8%'), 8)
        self.assertEqual(ft.conv('−5%'), -5)

    def test_null(self):
        for s in ('—', '-', '', '  '):
            self.assertIsNone(ft.conv(s))

    def test_array(self):
        self.assertEqual(ft.conv('당근·메밀·유채'), ['당근', '메밀', '유채'])
        self.assertEqual(ft.conv('A·B'), ['A', 'B'])

    def test_size(self):
        self.assertEqual(ft.conv('2×1'), {'w': 2, 'h': 1})

    def test_range(self):
        self.assertEqual(ft.conv('50,000~500,000'), {'min': 50000, 'max': 500000})
        self.assertEqual(ft.conv('10~40'), {'min': 10, 'max': 40})

    def test_signed(self):
        self.assertEqual(ft.conv('+3'), 3)
        self.assertEqual(ft.conv('−2'), -2)
        self.assertEqual(ft.conv('-1'), -1)

    def test_weights(self):
        self.assertEqual(ft.conv('1/3/1/1'), [1, 3, 1, 1])

    def test_string_passthrough(self):
        self.assertEqual(ft.conv('연구 8'), '연구 8')
        self.assertEqual(ft.conv('7~9월 30%'), '7~9월 30%')

    def test_night_scenery(self):
        self.assertEqual(ft.night_scenery('1(밤 +3)'), (1, 3))
        self.assertEqual(ft.night_scenery('3'), (3, None))

    def test_season_bonus(self):
        self.assertEqual(ft.parse_season_bonus('봄 +2 여름 +2'), {'spring': 2, 'summer': 2})
        self.assertIsNone(ft.parse_season_bonus('—'))

    def test_stat_bonus(self):
        self.assertEqual(ft.parse_stat_bonus('맛 +4 보기 +2'), {'taste': 4, 'look': 2})
        self.assertEqual(ft.parse_stat_bonus('제주 +6'), {'jeju': 6})

    def test_split_depth0(self):
        self.assertEqual(ft.split_depth0('a(1·2) · b · c(x)', '·'), ['a(1·2)', 'b', 'c(x)'])


SAMPLE = """# 샘플

## 1. 오브젝트

### 1.1 좌석
| id | 이름 | 크기 | Cost | 좌석 | Pop | Fee% | Sc | Nz | Up | 해금 |
|---|---|---|---|---|---|---|---|---|---|---|
| table_out | 야외 테이블 | 1×1 | 500 | 2 | 10 | 100 | 0 | 0 | 200 | 시작 |
| bench | 평상 | 2×1 | 1,800 | 3 | 12 | 90 | 1 | 0 | 150 | 연구 8 |

설명 줄.

## 2. 다른 절
| A | B |
|---|---|
| x | — |
"""


class TableParser(unittest.TestCase):
    def setUp(self):
        self.doc = ft.Doc(SAMPLE)

    def test_sections_by_heading(self):
        self.assertEqual(self.doc.section('1.1 ').title, '1.1 좌석')
        self.assertEqual(self.doc.section('2. ').title, '2. 다른 절')
        self.assertEqual([s.title for s in self.doc.children('1. ')], ['1.1 좌석'])

    def test_rows_keyed_by_header(self):
        rows = self.doc.section('1.1 ').table()
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[1]['이름'], '평상')
        self.assertEqual(rows[1]['Cost'], '1,800')
        self.assertEqual(ft.conv(rows[1]['크기']), {'w': 2, 'h': 1})

    def test_text_excludes_table(self):
        self.assertEqual(self.doc.section('1.1 ').text_lines(), ['설명 줄.'])

    def test_missing_cell_raises(self):
        with self.assertRaises(ValueError):
            ft.parse_table(['| a | b |', '|---|---|', '| 1 |'])

    def test_null_cell(self):
        self.assertIsNone(ft.conv(self.doc.section('2. ').table()[0]['B']))


class NamedGuestLine(unittest.TestCase):
    def test_basic(self):
        g = ft.parse_guest_line('1 고순자 / 생선 장수 삼춘 / 새벽 장 끝나고 커피 한 잔 / 음료×맛·양 / 5,000')
        self.assertEqual(g['no'], 1)
        self.assertEqual(g['name'], '고순자')
        self.assertEqual(g['job'], '생선 장수 삼춘')
        self.assertEqual(g['line'], '새벽 장 끝나고 커피 한 잔')
        self.assertEqual(g['likesBase'], ['drink'])
        self.assertEqual(g['likesStats'], ['taste', 'volume'])
        self.assertEqual(g['budget'], 5000)
        self.assertNotIn('budgetNote', g)

    def test_budget_note_and_any(self):
        g = ft.parse_guest_line('24 노을 / 길고양이 / 참치 / 식사×맛 / 0(무료, 호감도 채우면 고양이 집 해금)')
        self.assertEqual(g['budget'], 0)
        self.assertEqual(g['budgetNote'], '무료, 호감도 채우면 고양이 집 해금')
        g = ft.parse_guest_line('37 우지환 / 배 시간 놓친 사람 / 마지막 배 5시 / 아무거나×— / 8,000')
        self.assertEqual(g['likesBase'], ['any'])
        self.assertEqual(g['likesStats'], [])

    def test_jeju_stat(self):
        g = ft.parse_guest_line('4 이재호 / 오메기떡 장수 / 라이벌 디저트 정찰 / 디저트×맛·제주다움 / 6,000')
        self.assertEqual(g['likesStats'], ['taste', 'jeju'])

    def test_non_guest_line(self):
        self.assertIsNone(ft.parse_guest_line('형식: 이름 / 직업'))

    def test_wrong_field_count(self):
        with self.assertRaises(ValueError):
            ft.parse_guest_line('1 이름 / 직업 / 음료×맛 / 1,000')


class StaffItem(unittest.TestCase):
    def test_skill_and_line(self):
        s = ft.parse_staff_item('김민준(20·15·10·30, 튼튼함, 농고 졸업)', 'A', 1)
        self.assertEqual(s['id'], 'a01')
        self.assertEqual(s['stats'], {'service': 20, 'cooking': 15, 'sense': 10, 'stamina': 30})
        self.assertEqual(s['skill'], 'sturdy')
        self.assertEqual(s['line'], '농고 졸업')

    def test_line_only(self):
        s = ft.parse_staff_item('박도윤(15·30·10·20, 집밥 장인)', 'A', 3)
        self.assertIsNone(s['skill'])
        self.assertEqual(s['line'], '집밥 장인')

    def test_legend_alias(self):
        s = ft.parse_staff_item('**카이로군(?) → "돌하르방"**(99·99·99·99, 전설의 알바, 콩쿠르 우승 후)', 'C', 10)
        self.assertEqual(s['name'], '돌하르방')
        self.assertEqual(s['stats']['service'], 99)
        self.assertEqual(s['line'], '전설의 알바')


class Integration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(ft.DOC, encoding='utf-8') as f:
            cls.data = ft.build(ft.Doc(f.read()))

    def test_counts(self):
        d = self.data
        self.assertEqual(len(d['objects']), 63)
        self.assertGreaterEqual(len(d['compat']), 25)
        self.assertEqual(len(d['items']), 12)
        self.assertEqual(len(d['segments']), 12)
        self.assertEqual(len(d['named_guests']), 56)
        self.assertEqual(len(d['regions']), 7)
        self.assertEqual(len(d['ingredients']), 32)
        self.assertEqual(len(d['ingredient_combos']), 20)
        self.assertEqual(len(d['hidden_recipes']), 10)
        self.assertEqual(len(d['toppings']), 16)
        self.assertEqual(len(d['staff_pool']), 30)
        self.assertEqual(len(d['skills']), 20)
        self.assertEqual(len(d['recruit_tiers']), 4)
        self.assertEqual(len(d['investments']), 40)
        self.assertEqual(len(d['auras']), 8)
        self.assertEqual(len(d['contests']), 14)
        self.assertEqual(len(d['roulette']['slots']), 8)
        self.assertEqual(len(d['medal_sources']), 5)
        self.assertEqual(len(d['medal_shop']), 12)
        self.assertEqual(len(d['events']), 30)
        self.assertEqual(len(d['calendar']), 11)
        self.assertEqual(len(d['ranks']), 5)
        self.assertEqual(len(d['settle_ranks']), 6)
        self.assertEqual(len(d['parcels']), 9)
        self.assertEqual(len(d['landmarks']), 8)
        self.assertEqual(len(d['constants']), 17)  # 38bc0c9에서 '채집 성공' 행 삭제

    def test_object_kinds(self):
        kinds = {}
        for o in self.data['objects']:
            kinds[o['kind']] = kinds.get(o['kind'], 0) + 1
        self.assertEqual(kinds, {'seat': 12, 'facility': 17, 'farm': 6, 'path_wall': 6, 'env': 14, 'landmark': 8})
        for o in self.data['objects']:
            for k in ('id', 'name', 'w', 'h', 'cost', 'scenery', 'noise', 'upkeep'):
                self.assertIn(k, o, o['id'])

    def test_object_details(self):
        o = {x['id']: x for x in self.data['objects']}
        self.assertEqual(o['pond']['cost'], 2000)
        self.assertEqual((o['pond']['w'], o['pond']['h']), (2, 1))
        self.assertEqual(o['lantern_path']['sceneryNight'], 3)
        self.assertEqual(o['kitchen_ext']['scenery'], -1)
        self.assertEqual(o['flower_bed']['seasonBonus'], {'spring': 2, 'summer': 2})
        self.assertEqual(o['tangerine_tree']['wind'], 1)
        self.assertEqual(o['table_out']['unlockText'], '시작')

    def test_compat(self):
        c = self.data['compat']
        self.assertEqual(sum(1 for x in c if x['hidden']), 15)
        gate = next(x for x in c if x['a'] == 'gate')
        self.assertEqual((gate['bIds'], gate['bCount']), (['dolhareubang'], 2))
        self.assertEqual(self.data['compat_meta']['up'], {'pop': 3, 'feePct': 5})
        self.assertEqual(self.data['compat_meta']['radius'], 2)

    def test_named_guests_and_regions(self):
        g = self.data['named_guests']
        self.assertEqual([x['no'] for x in g], list(range(1, 57)))
        self.assertEqual({x['regionId'] for x in g}, set(ft.REGION_IDS))
        self.assertEqual(sum(1 for x in g if x['regionId'] == 'udo'), 8)
        r = {x['id']: x for x in self.data['regions']}
        self.assertEqual(r['dongmun']['popupCost'], 500)
        self.assertEqual(r['dolhareubang']['popupCost'], 65535)
        self.assertEqual(r['dongmun']['decayPerWeek'], 8)
        self.assertEqual(r['dongmun']['recoverPerWeek'], 5)

    def test_staff_and_skills(self):
        s = self.data['staff_pool']
        self.assertEqual(sum(1 for x in s if x['pool'] == 'A'), 10)
        skill_ids = {x['id'] for x in self.data['skills']}
        for x in s:
            if x['skill']:
                self.assertIn(x['skill'], skill_ids)

    def test_investment_placeholders(self):
        inv = self.data['investments']
        self.assertEqual([x['no'] for x in inv], list(range(1, 41)))
        self.assertEqual(sum(1 for x in inv if x.get('todo')), 20)
        self.assertEqual(inv[20]['name'], '특별 손님 초청: 해녀 삼춘')

    def test_auras_resolve_objects(self):
        obj_ids = {o['id'] for o in self.data['objects']}
        for a in self.data['auras']:
            for req in a['requires']:
                if req['objectId'] is not None:
                    self.assertIn(req['objectId'], obj_ids)

    def test_roulette_sums_100(self):
        self.assertEqual(sum(s['pct'] for s in self.data['roulette']['slots']), 100)

    def test_hidden_recipe_ingredients_exist(self):
        ing = {x['id'] for x in self.data['ingredients']}
        for r in self.data['hidden_recipes']:
            for i in r['ingredients']:
                self.assertIn(i, ing)

    def test_idempotent_and_json_serializable(self):
        with tempfile.TemporaryDirectory() as tmp:
            ft.main(['x', ft.DOC, tmp])
            first = {n: open(os.path.join(tmp, n), encoding='utf-8').read() for n in os.listdir(tmp)}
            ft.main(['x', ft.DOC, tmp])
            second = {n: open(os.path.join(tmp, n), encoding='utf-8').read() for n in os.listdir(tmp)}
            self.assertEqual(first, second)
            self.assertEqual(len(first), 27)
            for content in first.values():
                json.loads(content)


# ---------------------------------------------------------------------------
# v2
# ---------------------------------------------------------------------------
class V2Cells(unittest.TestCase):
    def test_unlock_forms(self):
        self.assertEqual(ft.parse_unlock('시작'), {'type': 'start'})
        self.assertEqual(ft.parse_unlock('랭크 3'), {'type': 'rank', 'rank': 3})
        self.assertEqual(ft.parse_unlock('손님 olle_walker 인기 30'),
                         {'type': 'segment', 'guestId': 'olle_walker', 'popularity': 30})
        self.assertEqual(ft.parse_unlock('★4'), {'type': 'star', 'star': 4})
        self.assertEqual(ft.parse_unlock('부탁 q_night_guest'), {'type': 'quest', 'questId': 'q_night_guest'})
        self.assertEqual(ft.parse_unlock('관광지 oreum Lv2'), {'type': 'spot', 'spotId': 'oreum', 'level': 2})
        self.assertEqual(ft.parse_unlock('1년 6월'), {'type': 'date', 'year': 1, 'month': 6})
        self.assertEqual(ft.parse_unlock('tangerine_tree 5개'), {'type': 'count', 'objectId': 'tangerine_tree', 'count': 5})
        self.assertEqual(ft.parse_unlock('먹거리 5개'), {'type': 'count', 'category': 'food', 'count': 5})

    def test_unlock_and(self):
        self.assertEqual(ft.parse_unlock('부탁 q_crow_flock·★4'), {
            'type': 'all', 'conditions': [{'type': 'quest', 'questId': 'q_crow_flock'}, {'type': 'star', 'star': 4}],
        })

    def test_unlock_invalid(self):
        with self.assertRaises(ValueError):
            ft.parse_unlock('연구 8')
        with self.assertRaises(ValueError):
            ft.parse_unlock('—')

    def test_season_map(self):
        self.assertEqual(ft.parse_season_map('봄 +12·겨울 +3'), {'spring': 12, 'winter': 3})
        self.assertEqual(ft.parse_season_map('—'), {})

    def test_quest_condition(self):
        self.assertEqual(ft.parse_quest_condition('menuSold', 'americano 20'),
                         {'type': 'menuSold', 'params': {'menuId': 'americano', 'count': 20}})
        self.assertEqual(ft.parse_quest_condition('spotLevel', 'hallasan 3'),
                         {'type': 'spotLevel', 'params': {'spotId': 'hallasan', 'level': 3}})
        self.assertEqual(ft.parse_quest_condition('segmentPopularity', 'haenyeo 40'),
                         {'type': 'segmentPopularity', 'params': {'guestId': 'haenyeo', 'popularity': 40}})
        self.assertEqual(ft.parse_quest_condition('none', '—'), {'type': 'none', 'params': {}})
        with self.assertRaises(ValueError):
            ft.parse_quest_condition('menuSold', '—')
        with self.assertRaises(ValueError):
            ft.parse_quest_condition('unknown', 'x 1')

    def test_rewards(self):
        self.assertEqual(ft.parse_rewards('자금 300,000·홍보 +5·아이템 conch_shell·마일리지 2'), [
            {'type': 'money', 'amount': 300000}, {'type': 'ad', 'amount': 5},
            {'type': 'item', 'itemId': 'conch_shell'}, {'type': 'mileage', 'amount': 2},
        ])

    def test_sources(self):
        self.assertEqual(ft.parse_sources('부탁 q_x·마일리지 상점·응모권 추첨·syrup_class 체험 보상'), [
            {'type': 'quest', 'questId': 'q_x'}, {'type': 'mileage_shop'}, {'type': 'ticket_draw'},
            {'type': 'facility', 'objectId': 'syrup_class'},
        ])

    def test_combo_grade(self):
        self.assertEqual(ft.combo_grade('시끄러운 로스터'), 'down')
        self.assertEqual(ft.combo_grade('주차장 소음'), 'down')
        self.assertEqual(ft.combo_grade('정상 전망'), 'upup')
        self.assertEqual(ft.combo_grade('귤밭 뷰'), 'up')

    def test_guest_chains(self):
        mmd = """%% 주석
graph LR
  subgraph c01_a
    x["엑스"]
    y["와이"]
    x -->|q_x| y
  end
  subgraph c02_b
    z["제트"]
  end
"""
        self.assertEqual(ft.parse_guest_chains(mmd), [
            {'chain': 'c01_a', 'guests': ['x', 'y'], 'edges': [{'from': 'x', 'to': 'y', 'quest': 'q_x'}]},
            {'chain': 'c02_b', 'guests': ['z'], 'edges': []},
        ])
        with self.assertRaises(ValueError):
            ft.parse_guest_chains('graph LR\n  x --> y\n')


class V2Integration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(ft.DOC_V2, encoding='utf-8') as f:
            doc = ft.Doc(f.read())
        with open(ft.MMD_V2, encoding='utf-8') as f:
            cls.data = ft.build_v2(doc, f.read())

    def test_counts(self):
        d = self.data
        expected = {
            'facilities': 109, 'guests': 103, 'quests': 103, 'combos': 45, 'sets': 14, 'spots': 24,
            'staff_pool': 27, 'recruit_tiers': 5, 'uniforms': 5, 'items': 20, 'special_items': 12,
            'mileage_shop': 14, 'ticket_shop': 8, 'guidebooks': 11, 'events': 42, 'scenery_seasons': 12,
            'extra_menus': 15, 'guest_chains': 30,
        }
        self.assertEqual({k: len(v) for k, v in d.items()}, expected)

    def test_all_ids_resolve(self):
        self.assertEqual(ft.check_v2_refs(self.data, ft.load_menu_ids_v1()), [])

    def test_check_detects_dangling(self):
        import copy
        d = copy.deepcopy(self.data)
        d['quests'][0]['condition']['params']['menuId'] = 'nope'
        d['combos'][0]['a'] = 'ghost'
        bad = ft.check_v2_refs(d, ft.load_menu_ids_v1())
        self.assertEqual(bad, [f'quests/{d["quests"][0]["id"]}: menu nope', f'combos/{d["combos"][0]["id"]}: facility ghost'])

    def test_facility_fields(self):
        f = {x['id']: x for x in self.data['facilities']}
        self.assertEqual(f['table_out']['unlock'], {'type': 'start'})
        self.assertEqual((f['table_out']['feePct'], f['table_out']['fee']), (100, None))
        self.assertEqual((f['photo_spot']['feePct'], f['photo_spot']['fee']), (None, 1000))
        self.assertEqual(f['fire_pit']['seasonBonus'], {'autumn': 4, 'winter': 4})
        self.assertEqual((f['rooftop']['w'], f['rooftop']['h'], f['rooftop']['tier']), (2, 2, 'large'))
        self.assertEqual(f['restroom']['scenery'], -1)
        self.assertEqual((f['deco_planter']['category'], f['deco_planter']['unlock']), ('scenery', {'type': 'start'}))
        self.assertEqual((f['counter_bar']['w'], f['counter_bar']['h']), (2, 1))
        self.assertEqual(f['deco_cake_case']['unlock'], {'type': 'star', 'star': 2})
        self.assertEqual(f['deco_string_lights']['unlock'], {'type': 'rank', 'rank': 2})
        self.assertEqual(f['warehouse']['cost'], 0)
        cats = {}
        for x in self.data['facilities']:
            cats[x['category']] = cats.get(x['category'], 0) + 1
        self.assertEqual(cats, {'rest': 18, 'convenience': 14, 'fun': 14, 'scenery': 36, 'food': 11, 'landmark': 9, 'farm': 7})

    def test_guest_fields(self):
        g = {x['id']: x for x in self.data['guests']}
        self.assertEqual(g['student']['tags'], {'gender': None, 'age': 'youth', 'group': False})
        self.assertEqual(g['angler']['tags']['gender'], 'm')
        self.assertEqual(g['student']['effect'], 'ad')
        self.assertEqual(g['student']['likes'], ['rest', 'fun'])
        self.assertEqual(g['student']['chain'], 'c01_youth')
        self.assertEqual({x['effect'] for x in g.values()}, {'item', 'money', 'ad', 'research', 'popularity', 'ticket'})
        self.assertEqual(sum(1 for x in g.values() if x['nextGuestId'] is None), 30)
        self.assertTrue(all(x['chain'] for x in g.values()))

    def test_quest_and_spot_links(self):
        q = {x['id']: x for x in self.data['quests']}
        g = {x['id']: x for x in self.data['guests']}
        for x in g.values():
            self.assertEqual(q[x['questId']]['guestId'], x['id'])
            self.assertEqual(q[x['questId']]['unlockGuestId'], x['nextGuestId'])
        types = {}
        for x in q.values():
            types[x['condition']['type']] = types.get(x['condition']['type'], 0) + 1
        self.assertEqual(types, {'objectPlaced': 62, 'menuSold': 21, 'segmentPopularity': 13, 'spotLevel': 4, 'item': 2, 'none': 1})
        s = {x['id']: x for x in self.data['spots']}
        self.assertEqual([lv['cost'] for lv in s['canola_field']['levels']], [500000, 1000000, 2000000, 3500000, 5000000])
        self.assertEqual((s['canola_field']['levels'][0]['appeal'], s['canola_field']['levels'][4]['appeal']), (9, 55))
        self.assertEqual(sum(1 for x in s.values() if x['nextSpotId'] is None), 4)

    def test_combos_sets_items(self):
        c = {x['id']: x for x in self.data['combos']}
        self.assertEqual(c['cb_sarangbang']['target'], 'senior')
        self.assertEqual(c['cb_summit_terrace']['bonus'], {'pop': 6, 'feePct': 10})
        self.assertEqual(c['cb_karaoke_shelf']['bonus'], {'pop': -3, 'feePct': -5})
        self.assertEqual(sum(1 for x in c.values() if x['hidden']), 25)
        s = {x['id']: x for x in self.data['sets']}
        self.assertEqual(s['set_emotional_cafe']['levelMult'], [1.1, 1.2, 1.35])
        self.assertEqual(s['set_emotional_cafe']['requires'][0], {'objectId': 'tangerine_tree', 'count': 2})
        it = {x['id']: x for x in self.data['items']}
        self.assertEqual(it['jeju_salt']['bestFacilities'], ['noodle_shop', 'bomal_kalguksu', 'haenyeo_mulhoe'])
        self.assertEqual(it['jeju_salt']['effect'], {'stat': 'popularity', 'value': 5})
        self.assertEqual(it['conch_shell']['sources'], [{'type': 'quest', 'questId': 'q_diver'}, {'type': 'quest', 'questId': 'q_angler'}])

    def test_shops_guidebooks_events(self):
        ms = {x['id']: x for x in self.data['mileage_shop']}
        self.assertEqual(ms['ms_jeju_salt']['itemId'], 'jeju_salt')
        ts = {x['id']: x for x in self.data['ticket_shop']}
        self.assertEqual(ts['ts_uniform_3']['uniformId'], 'uf_haenyeo')
        u = {x['id']: x for x in self.data['uniforms']}
        self.assertEqual(u['uf_haenyeo']['parts'], {'top': 'haenyeo', 'acc': 'goggles'})
        gb = {x['id']: x for x in self.data['guidebooks']}
        self.assertEqual(gb['gb_dessert']['unlock'], {'type': 'count', 'category': 'food', 'count': 5})
        self.assertEqual(gb['gb_ribbon_survey']['seeds'], [{'itemId': 'scenery_seed', 'count': 5}, {'itemId': 'popularity_fruit', 'count': 3}])
        ev = {x['id']: x for x in self.data['events']}
        self.assertEqual(ev['ev_typhoon_alert']['prob'], 30)
        self.assertIsNone(ev['ev_typhoon_alert']['conditionText'])
        self.assertIn('→', ev['ev_typhoon_alert']['effectText'])
        sc = {x['id']: x for x in self.data['scenery_seasons']}
        self.assertEqual(sc['canola']['seasons'], {'spring': 12, 'summer': 0, 'autumn': 0, 'winter': 0})
        st = {x['id']: x for x in self.data['staff_pool']}
        self.assertEqual(st['st_kim_minjun']['stats'], {'stamina': 30, 'strength': 25, 'skill': 10, 'smile': 15})
        self.assertEqual(sum(1 for x in st.values() if x['special']), 2)

    def test_scenery_bonus_matches_facility_table(self):
        f = {x['id']: x for x in self.data['facilities']}
        for sc in self.data['scenery_seasons']:
            self.assertEqual(f[sc['id']]['scenery'], sc['scenery'], sc['id'])
            self.assertEqual(f[sc['id']]['seasonBonus'], {k: v for k, v in sc['seasons'].items() if v}, sc['id'])

    def test_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            ft.run_v2(out_dir=tmp)
            first = {n: open(os.path.join(tmp, n), encoding='utf-8').read() for n in os.listdir(tmp)}
            ft.run_v2(out_dir=tmp)
            second = {n: open(os.path.join(tmp, n), encoding='utf-8').read() for n in os.listdir(tmp)}
            self.assertEqual(first, second)
            self.assertEqual(len(first), 18)
            for content in first.values():
                json.loads(content)


if __name__ == '__main__':
    unittest.main()
