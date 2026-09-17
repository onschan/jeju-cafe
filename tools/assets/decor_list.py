"""카페 장식 20종 표 (GDD v2 §12 장식 목록). 스프라이트는 `iso_obj_<id>`, 데이터 표가 나중에 그대로 가져다 쓴다.
(id, 이름, 발자국 w, h, 자리 'in'=실내 'out'=마당 'any', 경관 점수 힌트)"""
from __future__ import annotations

DECOR: list[tuple[str, str, int, int, str, int]] = [
    ('deco_planter', '큰 화분', 1, 1, 'any', 2),
    ('deco_lamp_post', '가로등', 1, 1, 'out', 2),
    ('deco_string_lights', '알전구 줄', 2, 1, 'out', 3),
    ('deco_chalkboard', '칠판 메뉴', 1, 1, 'any', 1),
    ('deco_cake_case', '케이크 진열장', 1, 1, 'in', 3),
    ('deco_coffee_machine', '커피머신', 1, 1, 'in', 3),
    ('deco_lp_shelf', 'LP 선반', 1, 1, 'in', 2),
    ('deco_bookshelf_small', '작은 책장', 1, 1, 'in', 2),
    ('deco_dolhareubang_set', '돌하르방 세트(미니)', 1, 1, 'any', 2),
    ('deco_water_jar_set', '물허벅 세트', 1, 1, 'any', 2),
    ('deco_gate_lantern', '정낭 초롱', 1, 1, 'out', 2),
    ('deco_laundry_line', '빨래줄', 2, 1, 'out', 1),
    ('deco_bicycle', '자전거', 1, 1, 'out', 1),
    ('deco_cat', '고양이', 1, 1, 'any', 3),
    ('deco_mailbox', '우체통', 1, 1, 'out', 1),
    ('deco_wind_chime', '풍경 종', 1, 1, 'any', 2),
    ('deco_tangerine_crates', '감귤 상자', 1, 1, 'any', 1),
    ('deco_wood_bench', '나무 벤치', 1, 1, 'any', 1),
    ('deco_flower_pots', '꽃 화분들', 1, 1, 'any', 2),
    ('deco_umbrella_stand', '우산꽂이', 1, 1, 'any', 1),
]

DECOR_IDS = [d[0] for d in DECOR]
