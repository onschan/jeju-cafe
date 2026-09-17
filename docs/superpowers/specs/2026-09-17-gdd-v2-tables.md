# 제주 카페 이야기 — GDD v2 데이터 표 (시설·손님·부탁·콤보·세트·관광지·직원·상점·가이드북·이벤트)

작성일: 2026-09-17. 마스터 GDD(`2026-09-17-gdd-v2-master.md`) §10 산출물 1·2의 본문이다. `tools/data/from_tables.py`가 이 문서를 읽어 `src/data/generated/*.json`을 만들도록 표 규칙을 지킨다.

표 규칙
- `### x.y` 절 하나에 GFM 표 하나. 첫 열은 항상 `id`(snake_case 영어).
- 숫자는 그대로 쓰거나 천 단위 쉼표. 음수는 `−`(U+2212). 없음은 `—`. 목록은 `a·b·c`. 크기는 `1×1`.
- 돈은 원 단위(마스터 §1: 1G≈100원). 메뉴 가격은 현실가(3~9천 원) 유지.
- 해금 조건 텍스트 8종(마스터 §2.3 `unlock` 스키마): `시작` / `랭크 N` / `손님 <guest_id> 인기 30|40|60` / `★N` / `부탁 <quest_id>` / `관광지 <spot_id> LvN` / `N년 M월` / `<object_id> N개`. 두 조건이 모두 필요하면 `·`로 잇는다(AND).
- 손님층 태그(콤보·세트·가이드북 대상): `전체/여성/남성/청년/성인/시니어/단체`.

## 변경 이력 (v1 `2026-09-17-game-data-tables.md`와 다른 점)
- 화폐 ×100: v1의 Cost·Up·급여·상금은 전부 100배 스케일로 다시 잡았다(테이블 500 → 400,000). 메뉴 가격은 그대로.
- 시설 분류: v1의 좌석/시설/농사/길·담/환경/랜드마크 → 마스터 §2.1의 **쉼/편의/먹거리/즐길거리/농사/경관/랜드마크** 7분류 + 소/중/대 티어. v1 오브젝트는 id를 유지한 채 재분류했고(`terrace`→`oreum_bench`로 흡수, `windbreak`→`cedar`, `pine`은 제외, `hackberry`→`hackberry_shade`), 마스터 §2.1 목록 전부를 추가했다. 길·담·문 타일(`path`·`gate`·`stone_floor`)은 시설이 아니라 타일이므로 v1 §1.4를 그대로 쓴다.
- 해금 조건: v1의 `연구 N`·`투자: …`·`필지 N`·`삼춘 ❤N` 표기는 마스터 스키마 8종으로 치환했다. 연구 포인트는 가이드북 보상으로만 쓰이고 해금 게이트에서는 뺐다.
- 유지비: 소·중형은 건설비 1.5%/월, 대형은 1.0%/월(마스터 "대형 10~20만"에 맞춤. 1.5%면 3,000만 시설이 45만이 되어 어긋난다).
- 손님: v1 손님층 12 + 지역 손님 56 → 손님 타입 103종(마스터 8체인 + 추가 22체인/단독). 지역 손님 56은 v1 §5를 그대로 두고 "이름 있는 개인"으로 2B-4에서 얹는다. v1 손님층 id(`local`·`tourist`·…)는 손님 타입 id로 흡수(`local`→`local_auntie`, `tourist`→`insta_traveler`, `family`→`rentcar_family`, `olle`→`olle_walker`, `monthly`→`monthly_stayer`, `group_cn`·`solo_foreign`·`youtuber`·`couple`·`night`→`night_guest`, `senior`→`silver_tour`, `runner`→`running_crew`).
- 콤보(상성): v1 25줄을 새 id로 옮기고 20줄을 추가해 45. 효과 크기는 v1과 같다(↑ = 인기 +3 요금 +5%, ↑↑ = +6/+10%, ↓ = −3/−5%). 대상 손님층은 인구 태그로 바꿨다.
- 세트 효과: v1 분위기 8 → 세트 14(`auras.json`으로 통합). 필요 시설을 새 id로.
- 관광지: v1 명소 12(3단계) → 24(Lv5). 명소 이름 중 카멜리아힐·산굼부리 등은 실제 지명이라 허용.
- 직원: 스탯을 **체력/힘/기술/미소**로 리네임(매핑: 체력=체력, 힘=운반·농사, 기술=요리·바리스타, 미소=서비스·홀). v1 풀 30 → 27(A·B·C 풀에서 고르고 특수 직원 2). 급여 40만~220만. v1 스킬 20은 유지(§9.3 v1)하되 이 문서에서는 다루지 않는다.
- 채용: v1 4단계 → 5단계. 마스터의 "알바천국 공고"는 실제 상호라 **"구인 앱 공고"**로 바꿨다.
- 상점: 메달 상점 12 + 룰렛 → 마일리지 상점 14 + 응모권 상점 8 + 응모권 추첨(인형뽑기 연출). "메달"은 "마일리지"로 통일.
- 가이드북: 콩쿠르 14 → 가이드북 11. 마스터의 "블루리본 서베이"·"미쉐린 가이드"는 실제 상표라 **"리본 서베이"·"별점 가이드 조사원"**으로, 손님 체인 8의 "블루리본 심사위원"은 **"리본 가이드 심사위원"**으로 바꿨다(체인 구조·순서는 그대로).
- "농협"은 실제 기관명이지만 생활 명사에 가까워 마스터대로 두었다. 문제가 되면 `농협`→`감귤 조합`으로 일괄 치환하면 된다.
- 이벤트: v1 30 → 42(마스터 §8 추가분 포함).
- v1 §6 재료·§6.2 카테고리 콤보·§7 메뉴·§8 토핑·§16 달력·§17 ★ 등급·§18 필지·§19 확률 상수는 이 문서에서 다시 쓰지 않으며 v1이 그대로 유효하다(단 §17·§18의 돈은 ×100).

---

## 1. 시설 (109종)

### 1.1 시설 전체
- 요금: 쉼(좌석)은 메뉴 가격 배수 `%`, 그 밖의 시설은 이용료(원), 없으면 `—`.
- 건설 시간(일): 소 1 · 중 3 · 대 7. 동종 n개째 건설비 × (1 + 0.1·(n−1)). 동시 건설 수 = 일꾼 삼춘 수(초기 2).
- 경관 상한 30, 인기 상한 40. 계절 보너스는 경관에 더해진다(경관 §13 표와 같은 값).
- `warehouse`는 시작 시 고정 배치(건설비 0, 철거 불가).
- 표 끝의 장식 22종(`deco_*` 20 + `counter_bar`·`menu_board`)은 마당·실내를 꾸미는 소품(스프라이트는 `tools/assets/decor_list.py`). 전부 카테고리 경관·티어 소. 실내 8종(칠판·케이크 진열장·커피머신·LP 선반·작은 책장·우산꽂이·카운터 바·메뉴판)은 본관 안에만 놓을 수 있다(코드의 `INDOOR_IDS`로 관리, 이 표에는 별도 열 없음).
| id | 이름 | 카테고리 | 티어 | 크기 | 건설비 | 건설 시간 | 유지비 | 인기 | 요금 | 경관 | 소음 | 계절 보너스 | 해금 | 설명 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| table_out | 야외 테이블 | 쉼 | 소 | 1×1 | 400,000 | 1 | 6,000 | 10 | 100% | 0 | 0 | — | 시작 | 마당에 놓은 나무 테이블. 바람이 시원해요. |
| terrace_seat | 테라스 좌석 | 쉼 | 소 | 1×1 | 600,000 | 1 | 9,000 | 12 | 110% | 1 | 0 | — | 시작 | 처마 밑 테라스 자리. 비 와도 괜찮아요. |
| toenmaru | 툇마루 | 쉼 | 소 | 1×1 | 500,000 | 1 | 8,000 | 11 | 95% | 1 | 0 | 봄 +2 | 시작 | 옛집 툇마루에 걸터앉아 귤 까먹는 자리. |
| hammock | 해먹 | 쉼 | 소 | 1×1 | 900,000 | 1 | 14,000 | 16 | 120% | 1 | 0 | 여름 +3 | 손님 olle_walker 인기 30 | 야자수 사이 해먹. 낮잠이 절로 와요. |
| bench_stonewall | 돌담 아래 평상 | 쉼 | 소 | 1×1 | 700,000 | 1 | 10,000 | 12 | 90% | 1 | 0 | — | 시작 | 돌담 그늘 아래 평상. 삼춘들 사랑방. |
| table_in | 실내 테이블 | 쉼 | 소 | 1×1 | 800,000 | 1 | 12,000 | 14 | 110% | 0 | 0 | — | 랭크 2 | 본관 안 테이블. 겨울에도 따뜻해요. |
| window_seat | 창가석 | 쉼 | 소 | 1×1 | 1,200,000 | 1 | 18,000 | 18 | 130% | 1 | 0 | 봄 +2 | 1년 6월 | 창밖 밭이 보이는 자리. 사진 찍기 좋아요. |
| kids_table | 어린이 테이블 | 쉼 | 소 | 1×1 | 900,000 | 1 | 14,000 | 12 | 80% | 0 | 2 | — | 손님 rentcar_family 인기 30 | 낮은 의자와 크레용. 아이들이 좋아해요. |
| fire_pit | 불멍 화로 | 쉼 | 소 | 1×1 | 1,500,000 | 1 | 22,000 | 20 | 140% | 2 | 0 | 가을 +4·겨울 +4 | 부탁 q_night_guest | 장작불 앞 의자. 밤이 길어져요. |
| counter | 카운터석 | 쉼 | 중 | 2×1 | 2,000,000 | 3 | 30,000 | 16 | 115% | 0 | 1 | — | ★2 | 바리스타 앞 자리. 커피 내리는 걸 구경해요. |
| oreum_bench | 오름 뷰 벤치 | 쉼 | 중 | 2×1 | 2,500,000 | 3 | 38,000 | 20 | 130% | 3 | 0 | 가을 +3 | 관광지 oreum Lv2 | 오름이 보이는 긴 벤치. 노을이 예뻐요. |
| greenhouse_seat | 온실 좌석 | 쉼 | 중 | 2×1 | 3,500,000 | 3 | 52,000 | 20 | 125% | 2 | 0 | 겨울 +5 | 손님 couple 인기 30 | 유리 온실 속 자리. 겨울에도 초록이에요. |
| sofa | 소파석 | 쉼 | 중 | 2×1 | 3,000,000 | 3 | 45,000 | 20 | 125% | 0 | 0 | — | ★3 | 푹신한 소파. 오래 앉아 있게 돼요. |
| table_big | 큰 테이블 | 쉼 | 중 | 2×1 | 2,200,000 | 3 | 33,000 | 15 | 100% | 0 | 1 | — | 손님 company_workshop 인기 30 | 여섯 명이 둘러앉는 긴 테이블. |
| picnic | 잔디 피크닉 | 쉼 | 중 | 2×2 | 2,800,000 | 3 | 42,000 | 16 | 95% | 2 | 1 | 봄 +3·여름 +2 | 손님 rentcar_family 인기 40 | 잔디 위 돗자리 자리. 아이들이 뛰놀아요. |
| rooftop | 루프탑 | 쉼 | 대 | 2×2 | 9,000,000 | 7 | 90,000 | 26 | 150% | 4 | 0 | 여름 +4 | ★3 | 지붕 위 옥상 자리. 바다까지 보여요. |
| vinyl_house_room | 비닐하우스 카페룸 | 쉼 | 대 | 3×2 | 12,000,000 | 7 | 120,000 | 24 | 135% | 1 | 0 | 겨울 +6 | 부탁 q_returnee_senior | 비닐하우스를 고친 카페방. 겨울 햇살이 좋아요. |
| tangerine_hall | 감귤 온실 카페홀 | 쉼 | 대 | 3×2 | 25,000,000 | 7 | 250,000 | 34 | 160% | 5 | 0 | 겨울 +8 | ★4 | 감귤나무 사이에 앉는 큰 홀. 귤 향이 가득해요. |
| restroom | 화장실 | 편의 | 소 | 1×1 | 1,500,000 | 1 | 22,000 | 8 | — | −1 | 0 | — | 시작 | 깨끗한 화장실. 없으면 손님이 불편해해요. |
| photo_spot | 포토존 | 편의 | 소 | 1×1 | 1,000,000 | 1 | 15,000 | 18 | 1,000 | 2 | 1 | — | 손님 insta_traveler 인기 30 | 귤 모양 액자와 발판. 인생샷 명당. |
| stroller_park | 유모차 보관소 | 편의 | 소 | 1×1 | 600,000 | 1 | 9,000 | 6 | — | 0 | 0 | — | 손님 stroller_family 인기 30 | 유모차를 세워 두는 곳. 가족 손님이 편해요. |
| bike_rack | 자전거 거치대 | 편의 | 소 | 1×1 | 400,000 | 1 | 6,000 | 6 | — | 0 | 0 | — | 시작 | 자전거를 세우는 거치대. 러닝크루가 좋아해요. |
| vending | 자판기 | 편의 | 소 | 1×1 | 800,000 | 1 | 12,000 | 6 | 1,500 | −1 | 1 | — | 시작 | 음료 자판기. 급할 때 한 캔. |
| translator | 번역기 태블릿 | 편의 | 소 | 1×1 | 1,200,000 | 1 | 18,000 | 6 | — | 0 | 0 | — | 손님 solo_foreign 인기 30 | 메뉴를 여러 나라 말로 보여 줘요. |
| cat_house | 고양이 집 | 편의 | 소 | 1×1 | 500,000 | 1 | 8,000 | 14 | — | 1 | 0 | — | 부탁 q_street_cat_noeul | 길고양이 노을이의 집. 손님이 쓰다듬어요. |
| parking | 주차장 | 편의 | 중 | 2×2 | 3,000,000 | 3 | 45,000 | 6 | — | −2 | 3 | — | 랭크 2 | 렌터카 네 대 자리. 없으면 가족 손님이 돌아가요. |
| staff_room | 직원 휴게실 | 편의 | 중 | 2×1 | 2,500,000 | 3 | 38,000 | 0 | — | 0 | 0 | — | ★2 | 직원이 쉬는 방. 기력이 빨리 차요. |
| storage | 창고 | 편의 | 중 | 2×1 | 2,000,000 | 3 | 30,000 | 0 | — | 0 | 0 | — | 랭크 3 | 재료를 쌓아 두는 창고. 보관 상한 +50. |
| wifi_zone | 와이파이 존 | 편의 | 중 | 2×1 | 1,800,000 | 3 | 27,000 | 12 | — | 0 | 0 | — | 손님 digital_nomad 인기 30 | 빠른 인터넷 자리. 노트북 손님이 모여요. |
| kitchen_ext | 주방 증축 | 편의 | 중 | 2×1 | 5,000,000 | 3 | 75,000 | 0 | — | −1 | 2 | — | ★2 | 주방을 넓혀요. 조리 슬롯 +1. |
| dog_park | 반려견 놀이터 | 편의 | 대 | 2×2 | 8,000,000 | 7 | 80,000 | 22 | 2,000 | 1 | 3 | — | 손님 dog_walker 인기 40 | 울타리 친 강아지 놀이터. 몽이가 뛰어요. |
| parking_large | 대형 주차장 | 편의 | 대 | 3×2 | 15,000,000 | 7 | 150,000 | 8 | — | −3 | 4 | — | 손님 group_cn 인기 40 | 관광버스도 들어오는 큰 주차장. |
| handdrip_bar | 핸드드립 바 | 먹거리 | 소 | 1×1 | 1,200,000 | 1 | 18,000 | 14 | — | 0 | 0 | — | 시작 | 천천히 내리는 커피 바. 향이 좋아요. |
| hallabong_stand | 한라봉 에이드 스탠드 | 먹거리 | 소 | 1×1 | 1,000,000 | 1 | 15,000 | 14 | 4,500 | 1 | 0 | 여름 +5 | 손님 kid_pocketmoney 인기 30 | 한라봉 즙을 짜는 작은 스탠드. |
| omegi_stall | 오메기떡 매대 | 먹거리 | 소 | 1×1 | 900,000 | 1 | 14,000 | 12 | 3,000 | 0 | 0 | — | 손님 local_auntie 인기 30 | 쫀득한 오메기떡. 삼춘 손맛이에요. |
| peanut_icecream | 우도 땅콩 아이스크림 | 먹거리 | 소 | 1×1 | 1,100,000 | 1 | 16,000 | 15 | 4,000 | 0 | 0 | 여름 +6 | 관광지 udo_peanut_village Lv2 | 고소한 땅콩 아이스크림. 여름 인기 최고. |
| roaster | 로스터기 | 먹거리 | 소 | 1×1 | 4,000,000 | 1 | 60,000 | 8 | — | −1 | 3 | — | 부탁 q_coffee_geek | 원두를 직접 볶는 기계. 재료비가 줄어요. |
| tart_bakery | 감귤 타르트 베이커리 | 먹거리 | 중 | 2×1 | 4,500,000 | 3 | 68,000 | 20 | 6,500 | 1 | 1 | 가을 +3 | 랭크 3 | 감귤 타르트를 굽는 빵집. 냄새로 손님을 불러요. |
| noodle_shop | 고기국수 분식점 | 먹거리 | 중 | 2×1 | 4,000,000 | 3 | 60,000 | 18 | 8,000 | 0 | 2 | 겨울 +4 | 관광지 noodle_street Lv2 | 뜨끈한 고기국수 한 그릇. 든든해요. |
| bomal_kalguksu | 보말칼국수집 | 먹거리 | 중 | 2×1 | 4,200,000 | 3 | 63,000 | 18 | 8,000 | 0 | 1 | — | 손님 haenyeo 인기 30 | 보말 넣고 끓인 칼국수. 바다 맛이 나요. |
| black_pork_grill | 흑돼지 구이 식당 | 먹거리 | 대 | 2×2 | 14,000,000 | 7 | 140,000 | 28 | 15,000 | −1 | 3 | — | 관광지 black_pork_street Lv4 | 흑돼지를 굽는 식당. 저녁 손님이 몰려요. |
| haenyeo_mulhoe | 해녀 물회집 | 먹거리 | 대 | 2×2 | 12,000,000 | 7 | 120,000 | 26 | 12,000 | 1 | 1 | 여름 +6 | 부탁 q_haenyeo | 해녀 삼춘이 잡은 해산물 물회. 시원해요. |
| barley_pub | 제주 보리 음료 펍 | 먹거리 | 대 | 2×2 | 16,000,000 | 7 | 160,000 | 24 | 7,000 | 0 | 3 | 여름 +4 | 관광지 barley_brewery Lv4 | 보리 음료를 마시는 어른 손님 전용 펍. |
| souvenir | 기념품 매대 | 즐길거리 | 소 | 1×1 | 1,200,000 | 1 | 18,000 | 12 | 3,000 | 0 | 1 | — | 시작 | 귤 모양 열쇠고리와 엽서를 파는 매대. |
| prop_shop | 소품숍 | 즐길거리 | 소 | 1×1 | 1,500,000 | 1 | 22,000 | 14 | 3,500 | 1 | 0 | — | 랭크 2 | 제주 느낌 소품을 파는 작은 가게. |
| boardgame_room | 보드게임 룸 | 즐길거리 | 소 | 1×1 | 1,400,000 | 1 | 21,000 | 14 | 2,500 | 0 | 2 | 겨울 +3 | 손님 student 인기 30 | 보드게임 서른 개. 비 오는 날 인기. |
| snap_studio | 스냅사진관 | 즐길거리 | 소 | 1×1 | 1,500,000 | 1 | 22,000 | 16 | 5,000 | 1 | 0 | 봄 +3 | 손님 couple 인기 30 | 즉석 사진을 찍어 주는 작은 사진관. |
| gallery | 작은 갤러리 | 즐길거리 | 중 | 2×1 | 3,500,000 | 3 | 52,000 | 18 | 2,000 | 2 | −1 | — | 부탁 q_village_painter | 마을 화가 그림을 거는 갤러리. |
| pottery_studio | 도자기 공방 | 즐길거리 | 중 | 2×1 | 5,000,000 | 3 | 75,000 | 20 | 12,000 | 1 | 0 | — | 부탁 q_potter | 흙을 빚어 컵을 만드는 체험 공방. |
| syrup_class | 감귤청 클래스 | 즐길거리 | 중 | 2×1 | 4,000,000 | 3 | 60,000 | 20 | 10,000 | 0 | 0 | 가을 +4 | tangerine_tree 5개 | 감귤을 썰어 청을 담그는 수업. |
| jam_workshop | 감귤잼 공방 | 즐길거리 | 중 | 2×1 | 4,500,000 | 3 | 68,000 | 20 | 8,000 | 1 | 1 | 가을 +3 | 손님 stroller_family 인기 40 | 아이와 함께 잼을 끓이는 공방. |
| bookshelf | 북카페 서가 | 즐길거리 | 중 | 2×1 | 3,000,000 | 3 | 45,000 | 16 | 500 | 1 | −1 | 겨울 +2 | 손님 monthly_stayer 인기 30 | 책이 빼곡한 서가. 조용한 손님이 좋아해요. |
| goods_shop | 제주 굿즈 편집숍 | 즐길거리 | 중 | 2×1 | 4,500,000 | 3 | 68,000 | 18 | 4,000 | 1 | 0 | — | ★3 | 제주 디자이너 굿즈를 모은 가게. |
| karaoke | 노래방 | 즐길거리 | 중 | 2×1 | 5,000,000 | 3 | 75,000 | 18 | 5,000 | −1 | 5 | — | 손님 school_trip 인기 30 | 방음이 조금 되는 노래방. 소리가 새요. |
| picking_experience | 감귤 따기 체험장 | 즐길거리 | 대 | 2×2 | 9,000,000 | 7 | 90,000 | 28 | 15,000 | 3 | 1 | 가을 +8·겨울 +6 | tangerine_tree 10개 | 바구니 들고 귤 따는 체험. 가을 대인기. |
| horse_riding | 승마 체험 | 즐길거리 | 대 | 3×2 | 18,000,000 | 7 | 180,000 | 30 | 20,000 | 2 | 2 | 봄 +4 | 관광지 horse_ranch Lv4 | 조랑말 등에 타 보는 체험장. |
| scooter_rental | 전동 스쿠터 대여 | 즐길거리 | 대 | 2×2 | 10,000,000 | 7 | 100,000 | 22 | 10,000 | 0 | 3 | 여름 +3 | 관광지 udo_bike Lv4 | 해안길 달리는 전동 스쿠터 대여소. |
| field | 밭 | 농사 | 소 | 1×1 | 400,000 | 1 | 6,000 | 0 | — | 0 | 0 | — | 시작 | 당근·메밀·유채·마늘을 심는 밭. |
| tangerine_tree | 감귤나무 | 농사 | 소 | 1×1 | 600,000 | 1 | 9,000 | 4 | — | 1 | 0 | 가을 +2 | 시작 | 3년 뒤 첫 수확. 겨울 택배의 주인공. |
| beehive | 벌통 | 농사 | 소 | 1×1 | 800,000 | 1 | 12,000 | 2 | — | 0 | 0 | — | 부탁 q_local_uncle | 꿀 월 3개. 유채·동백 옆이면 두 배. |
| chicken_coop | 닭장 | 농사 | 소 | 1×1 | 900,000 | 1 | 14,000 | 4 | — | −1 | 1 | — | 부탁 q_local_auntie | 달걀 매일 2개. 아침이 시끄러워요. |
| tea_field | 녹차 관목 밭 | 농사 | 중 | 2×1 | 2,500,000 | 3 | 38,000 | 6 | — | 2 | 0 | 봄 +3 | 관광지 gotjawal Lv2 | 초록 녹차 밭. 4~5월에 잎을 따요. |
| hallabong_house | 한라봉 하우스 | 농사 | 중 | 2×1 | 5,000,000 | 3 | 75,000 | 8 | — | 0 | 0 | 겨울 +3 | 부탁 q_returnee_senior | 한라봉을 키우는 비닐하우스. |
| sorting_house | 감귤 선과장 | 농사 | 대 | 2×2 | 10,000,000 | 7 | 100,000 | 4 | — | −1 | 2 | — | tangerine_tree 15개 | 귤을 크기별로 고르는 창고. 택배 수입 ×1.5. |
| canola | 유채 | 경관 | 소 | 1×1 | 400,000 | 1 | 6,000 | 2 | — | 2 | 0 | 봄 +12 | 시작 | 노란 유채꽃. 봄이면 온 밭이 노래요. |
| hydrangea | 수국 | 경관 | 소 | 1×1 | 450,000 | 1 | 7,000 | 2 | — | 3 | 0 | 여름 +9 | 손님 insta_traveler 인기 30 | 파란 수국. 장마 뒤에 활짝 펴요. |
| pampas | 억새 | 경관 | 소 | 1×1 | 400,000 | 1 | 6,000 | 2 | — | 2 | 0 | 가을 +9 | 시작 | 은빛 억새. 가을 바람에 흔들려요. |
| camellia | 동백 | 경관 | 소 | 1×1 | 500,000 | 1 | 8,000 | 3 | — | 3 | 0 | 겨울 +11 | 1년 11월 | 빨간 동백. 겨울에 툭 떨어져요. |
| palm | 야자수 | 경관 | 소 | 1×1 | 700,000 | 1 | 10,000 | 3 | — | 5 | 0 | 여름 +3 | 관광지 jungmun_surf Lv2 | 키 큰 야자수. 남쪽 나라 느낌. |
| cedar | 삼나무 | 경관 | 소 | 1×1 | 600,000 | 1 | 9,000 | 2 | — | 8 | 0 | 겨울 +2 | 시작 | 방풍림 삼나무. 바람을 막아 줘요. |
| stonewall | 현무암 돌담 | 경관 | 소 | 1×1 | 400,000 | 1 | 6,000 | 1 | — | 4 | 0 | — | 시작 | 구멍 숭숭 검은 돌담. 바람이 지나가요. |
| dolhareubang | 돌하르방 | 경관 | 소 | 1×1 | 500,000 | 1 | 8,000 | 4 | — | 3 | 0 | — | 시작 | 코를 만지면 소원이 이뤄진대요. 주변 인기 소폭↑. |
| water_jar | 물허벅 | 경관 | 소 | 1×1 | 450,000 | 1 | 7,000 | 2 | — | 3 | 0 | — | 손님 local_auntie 인기 30 | 옛날 물 긷던 항아리. |
| stone_lantern | 석등 | 경관 | 소 | 1×1 | 600,000 | 1 | 9,000 | 3 | — | 3 | 0 | — | basalt_rock 10개 | 밤에 불이 켜지는 돌 등불. 밤 경관 +3. |
| basalt_rock | 현무암 돌 | 경관 | 소 | 1×1 | 400,000 | 1 | 6,000 | 1 | — | 3 | 0 | — | 시작 | 까만 현무암 한 덩이. |
| lantern_path | 초롱 걸린 길 | 경관 | 소 | 1×1 | 400,000 | 1 | 6,000 | 1 | — | 1 | 0 | — | 부탁 q_night_guest | 초롱을 걸어 둔 길. 밤에 +3. |
| pond | 연못 | 경관 | 중 | 2×1 | 2,500,000 | 3 | 38,000 | 6 | — | 12 | 0 | 여름 +18 | basalt_rock 10개·stone_lantern 5개 | 수련 뜬 연못. 여름이 시원해요. |
| hackberry_millennium | 천년 팽나무 | 경관 | 대 | 2×2 | 30,000,000 | 7 | 300,000 | 30 | — | 30 | 0 | 여름 +10 | 부탁 q_seolmundae | 백주년 축제의 보상. 마을을 지켜 온 나무. |
| warehouse | 카페 본관(폐창고) | 랜드마크 | 대 | 3×2 | 0 | 7 | 0 | 0 | — | 0 | 0 | — | 시작 | 폐창고를 고친 카페 본관. 우리 이야기의 시작. |
| dolhareubang_pair | 돌하르방 한 쌍 | 랜드마크 | 중 | 2×1 | 6,000,000 | 3 | 90,000 | 10 | — | 6 | 0 | — | 부탁 q_dolhareubang_spirit | 정낭 옆 한 쌍. 사진 이벤트 +50%. |
| bangsatap | 방사탑 | 랜드마크 | 대 | 2×2 | 12,000,000 | 7 | 120,000 | 8 | — | 6 | 0 | — | 부탁 q_village_head | 마을을 지키는 돌탑. 태풍 피해 −30%. |
| stone_guardians | 동자석·산담 | 랜드마크 | 중 | 2×1 | 9,000,000 | 3 | 135,000 | 10 | — | 8 | 0 | — | 부탁 q_village_elder | 옛 돌 복원. 범위 경관 +2, 소음 시설 금지. |
| millstone | 연자방아 | 랜드마크 | 대 | 2×2 | 8,000,000 | 7 | 80,000 | 12 | 5,000 | 4 | 1 | — | 부탁 q_market_auntie | 말이 돌리던 방아. 메밀 메뉴 재료비 −40%. |
| haenyeo_hut | 해녀 불턱 | 랜드마크 | 중 | 2×1 | 15,000,000 | 3 | 225,000 | 14 | — | 5 | 0 | — | 부탁 q_fishing_boat_captain | 해녀들이 몸 녹이던 곳. 해산물 월 6개. |
| observatory | 오름 전망대 | 랜드마크 | 대 | 2×2 | 20,000,000 | 7 | 200,000 | 20 | 3,000 | 15 | 0 | 가을 +5 | 관광지 oreum Lv4 | 범위 좌석 요금 +30%. 최고 경관. |
| lighthouse | 도대불(옛 등대) | 랜드마크 | 소 | 1×1 | 14,000,000 | 1 | 210,000 | 12 | — | 6 | 0 | — | 부탁 q_lighthouse_keeper | 야간 영업(18~24시) 해금. 밤 손님층. |
| hackberry_shade | 폭낭 그늘 | 랜드마크 | 대 | 2×2 | 8,000,000 | 7 | 80,000 | 14 | — | 8 | 0 | 여름 +8 | 부탁 q_village_elder | 마을 폭낭 그늘. 범위 좌석 여름 만족 +20%. |
| deco_planter | 큰 화분 | 경관 | 소 | 1×1 | 200,000 | 1 | 3,000 | 2 | — | 2 | 0 | — | 시작 | 흙을 담은 큰 화분. 어디 놔도 잘 어울려요. |
| deco_lamp_post | 가로등 | 경관 | 소 | 1×1 | 300,000 | 1 | 4,500 | 2 | — | 2 | 0 | — | 시작 | 마당을 밝히는 가로등. 밤에도 환해요. |
| deco_dolhareubang_set | 돌하르방 세트(미니) | 경관 | 소 | 1×1 | 350,000 | 1 | 5,300 | 3 | — | 3 | 0 | — | 시작 | 미니 돌하르방 세 형제. 코를 만지면 좋대요. |
| deco_water_jar_set | 물허벅 세트 | 경관 | 소 | 1×1 | 300,000 | 1 | 4,500 | 2 | — | 3 | 0 | — | 시작 | 크고 작은 물허벅을 모아 뒀어요. |
| deco_mailbox | 우체통 | 경관 | 소 | 1×1 | 200,000 | 1 | 3,000 | 1 | — | 2 | 0 | — | 시작 | 빨간 우체통. 엽서를 부칠 수 있어요. |
| deco_tangerine_crates | 감귤 상자 | 경관 | 소 | 1×1 | 220,000 | 1 | 3,300 | 2 | — | 2 | 0 | — | 시작 | 귤을 담아 쌓아 둔 나무 상자. |
| deco_wood_bench | 나무 벤치 | 경관 | 소 | 1×1 | 260,000 | 1 | 3,900 | 2 | — | 2 | 0 | — | 시작 | 앉아서 쉬는 나무 벤치. |
| deco_flower_pots | 꽃 화분들 | 경관 | 소 | 1×1 | 240,000 | 1 | 3,600 | 2 | — | 2 | 0 | 봄 +2 | 시작 | 알록달록 꽃을 심은 화분들. |
| deco_string_lights | 알전구 줄 | 경관 | 소 | 2×1 | 400,000 | 1 | 6,000 | 3 | — | 3 | 0 | — | 랭크 2 | 처마에 매단 알전구. 밤이 되면 반짝여요. |
| deco_gate_lantern | 정낭 초롱 | 경관 | 소 | 1×1 | 350,000 | 1 | 5,300 | 2 | — | 3 | 0 | — | 랭크 2 | 정낭 옆에 매단 초롱. 밤길을 밝혀요. |
| deco_laundry_line | 빨래줄 | 경관 | 소 | 2×1 | 220,000 | 1 | 3,300 | 1 | — | 2 | 0 | — | 랭크 2 | 바람에 펄럭이는 빨래. 정겨운 풍경이에요. |
| deco_bicycle | 자전거 | 경관 | 소 | 1×1 | 250,000 | 1 | 3,800 | 1 | — | 2 | 0 | — | 랭크 2 | 담벼락에 세워 둔 자전거. |
| deco_cat | 고양이 | 경관 | 소 | 1×1 | 280,000 | 1 | 4,200 | 3 | — | 3 | 0 | — | 랭크 2 | 볕 좋은 자리에 낮잠 자는 고양이. |
| deco_wind_chime | 풍경 종 | 경관 | 소 | 1×1 | 300,000 | 1 | 4,500 | 2 | — | 3 | 0 | — | 랭크 2 | 바람 불면 딸랑이는 풍경 종. |
| deco_chalkboard | 칠판 메뉴 | 경관 | 소 | 1×1 | 250,000 | 1 | 3,800 | 2 | — | 2 | 0 | — | ★2 | 오늘의 메뉴를 손글씨로 적은 칠판. |
| deco_cake_case | 케이크 진열장 | 경관 | 소 | 1×1 | 900,000 | 1 | 13,500 | 4 | — | 4 | 0 | — | ★2 | 케이크를 예쁘게 담은 유리 진열장. |
| deco_coffee_machine | 커피머신 | 경관 | 소 | 1×1 | 1,100,000 | 1 | 16,500 | 4 | — | 4 | 0 | — | ★2 | 반짝이는 커피머신. 카운터가 근사해져요. |
| deco_lp_shelf | LP 선반 | 경관 | 소 | 1×1 | 600,000 | 1 | 9,000 | 3 | — | 3 | 0 | — | ★2 | 오래된 LP판을 꽂아 둔 선반. |
| deco_bookshelf_small | 작은 책장 | 경관 | 소 | 1×1 | 500,000 | 1 | 7,500 | 3 | — | 3 | 0 | — | ★2 | 아기자기한 소품과 책이 꽂힌 작은 책장. |
| deco_umbrella_stand | 우산꽂이 | 경관 | 소 | 1×1 | 260,000 | 1 | 3,900 | 1 | — | 2 | 0 | — | ★2 | 비 오는 날 우산을 꽂아 두는 통. |
| counter_bar | 카운터 바 | 경관 | 소 | 2×1 | 950,000 | 1 | 14,300 | 4 | — | 4 | 0 | — | ★2 | 손님과 마주 보는 카운터 바. |
| menu_board | 메뉴판 | 경관 | 소 | 1×1 | 300,000 | 1 | 4,500 | 2 | — | 2 | 0 | — | ★2 | 오늘 파는 메뉴를 적어 둔 메뉴판. |

## 2. 손님 (103종, 30체인)

### 2.1 손님 타입
- 효과 6종: `아이템`(강화 아이템 드롭) / `자금`(소지금 ×1.5 소비) / `홍보`(방문 시 손님층 인기 +1) / `연구`(방문 시 연구 +2) / `시설 인기`(이용한 시설 인기 +1, 상한 40) / `응모권`(만족 시 10% 확률 응모권 1).
- 연령 `청년/성인/시니어`, 성별 `남/여/—`, 단체 `예/아니오`. 동물·전설 손님은 연령 `—`.
- 소지금은 1인 기준(원). 동물 손님은 0(무료, 효과만).
- `부탁 ID`는 이 손님이 주는 부탁, `다음 손님`은 그 부탁을 완료하면 해금되는 손님. 체인 마지막 손님은 `—`.
- 해금 조건이 `부탁 …`인 손님은 체인 안쪽, 나머지는 체인 머리. 체인 그림은 `guest-chain.mmd`.
- 마스터 §3 체인 1~8은 c01~c08(순서·구성 동일, 이름만 §변경 이력의 상표 치환). 추가 체인: c09 동네 삼춘, c10 육지, c11 동물(조랑말 인형 → 특수 직원), c12 방해형(까치·까마귀·노루), c13 수학여행, c14 회사 워크숍, c15 실버, c16 러닝, c17 밤 손님, c18 외국 단체, c19 개별 외국, c20 예술, c21 커피·디저트, c22 반려견, c23 바다, c24 캠핑, c25 전설, c26 청소년, c27 기사, c28~c30 단독(골퍼·리조트 투숙객·한라산 신령).
| id | 이름 | 성별 | 연령 | 단체 | 효과 | 소지금 | 선호 카테고리 | 해금 조건 | 부탁 ID | 다음 손님 | 대사 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| student | 대학생 | — | 청년 | 아니오 | 홍보 | 6,000 | 쉼·즐길거리 | 시작 | q_student | working_holiday | 과제는 내일의 나에게 맡길게요. |
| working_holiday | 워홀 청년 | — | 청년 | 아니오 | 연구 | 8,000 | 쉼·먹거리 | 부탁 q_student | q_working_holiday | digital_nomad | 감귤 따고 돈 벌고, 이게 워홀이죠. |
| digital_nomad | 디지털 노마드 | — | 청년 | 아니오 | 시설 인기 | 12,000 | 쉼·편의 | 부탁 q_working_holiday | q_digital_nomad | startup_ceo | 와이파이만 되면 여기가 사무실이우다. |
| startup_ceo | 스타트업 대표 | — | 성인 | 아니오 | 자금 | 20,000 | 먹거리·편의 | 부탁 q_digital_nomad | q_startup_ceo | investor | 피칭은 카페에서 해야 제맛이죠. |
| investor | 투자자 | — | 성인 | 아니오 | 자금 | 40,000 | 쉼·먹거리 | 부탁 q_startup_ceo | q_investor | — | 이 카페, 투자 가치 있네요. |
| couple | 커플 | — | 청년 | 아니오 | 시설 인기 | 11,000 | 쉼·경관 | 관광지 camellia_hill Lv2 | q_couple | newlyweds | 여기 사진 잘 나온다며? 우리 먼저 찍자. |
| newlyweds | 신혼부부 | — | 성인 | 아니오 | 자금 | 20,000 | 쉼·경관 | 부탁 q_couple | q_newlyweds | wedding_snap | 신혼여행은 역시 제주 아니겠어요? |
| wedding_snap | 웨딩스냅 작가 | — | 성인 | 아니오 | 홍보 | 15,000 | 경관·편의 | 부탁 q_newlyweds | q_wedding_snap | wedding_planner | 빛이 좋네요. 여기서 찍겠습니다. |
| wedding_planner | 웨딩플래너 | 여 | 성인 | 아니오 | 자금 | 30,000 | 쉼·경관 | 부탁 q_wedding_snap | q_wedding_planner | — | 스몰웨딩 장소로 딱이에요. 계약하죠. |
| insta_traveler | 인스타 여행러 | 여 | 청년 | 아니오 | 홍보 | 9,000 | 경관·편의 | 관광지 canola_field Lv2 | q_insta_traveler | influencer | 해시태그 제주카페, 저장 누르고 왔어요. |
| influencer | 인플루언서 | 여 | 청년 | 아니오 | 홍보 | 15,000 | 경관·먹거리 | 부탁 q_insta_traveler | q_influencer | youtuber | 팔로워들이 여기 어디냐고 난리예요. |
| youtuber | 유튜버 | — | 청년 | 아니오 | 홍보 | 20,000 | 즐길거리·경관 | 부탁 q_influencer | q_youtuber | tv_pd | 구독 좋아요 알림 설정, 아시죠? |
| tv_pd | 방송 PD | — | 성인 | 아니오 | 홍보 | 25,000 | 쉼·먹거리 | 부탁 q_youtuber | q_tv_pd | actor | 촬영 허가 좀 부탁드립니다. 조용히 할게요. |
| actor | 배우 | — | 성인 | 아니오 | 홍보 | 50,000 | 쉼·경관 | 부탁 q_tv_pd | q_actor | — | 알아보셔도 모른 척해 주세요. |
| village_head | 이장님 | 남 | 시니어 | 아니오 | 아이템 | 7,000 | 쉼·먹거리 | 시작 | q_village_head | haenyeo | 육지서 왔댄? 마을 일은 나한테 물어봅서. |
| haenyeo | 해녀 삼춘 | 여 | 시니어 | 아니오 | 아이템 | 8,000 | 먹거리·쉼 | 부탁 q_village_head | q_haenyeo | returnee_senior | 물질 끝나민 여기서 몸 녹이젠. |
| returnee_senior | 귀농 선배 | 남 | 성인 | 아니오 | 연구 | 9,000 | 농사·쉼 | 부탁 q_haenyeo | q_returnee_senior | coop_staff | 나도 5년 전엔 육지 것이었주. |
| coop_staff | 농협 직원 | — | 성인 | 아니오 | 자금 | 10,000 | 농사·편의 | 부탁 q_returnee_senior | q_coop_staff | governor | 감귤 택배, 조합 통하면 수수료 싸요. |
| governor | 도지사 | — | 시니어 | 아니오 | 자금 | 40,000 | 쉼·경관 | 부탁 q_coop_staff | q_governor | — | 귀농 성공 사례로 소개하고 싶습니다. |
| rentcar_family | 렌터카 가족 | — | 성인 | 예 | 자금 | 15,000 | 편의·먹거리 | 랭크 2 | q_rentcar_family | stroller_family | 주차 되나요? 애들이 배고프대요. |
| stroller_family | 유모차 가족 | — | 성인 | 예 | 시설 인기 | 16,000 | 편의·쉼 | 부탁 q_rentcar_family | q_stroller_family | three_gen_family | 유모차 둘 데만 있으면 천국이에요. |
| three_gen_family | 삼대 가족 | — | 성인 | 예 | 자금 | 30,000 | 쉼·먹거리 | 부탁 q_stroller_family | q_three_gen_family | — | 할머니부터 손주까지 여덟 명이에요. |
| olle_walker | 올레길 도보객 | — | 성인 | 아니오 | 연구 | 7,000 | 쉼·농사 | 관광지 olle_trail Lv2 | q_olle_walker | oreum_hiker | 7코스 걷다 다리가 풀렸수다. |
| oreum_hiker | 오름 등반가 | — | 성인 | 아니오 | 시설 인기 | 8,000 | 쉼·경관 | 부탁 q_olle_walker | q_oreum_hiker | hallasan_club | 오름 368개 중 120개 올랐어요. |
| hallasan_club | 한라산 산악회 | — | 시니어 | 예 | 자금 | 12,000 | 먹거리·쉼 | 부탁 q_oreum_hiker | q_hallasan_club | — | 스무 명 예약이오. 국수 되지예? |
| surfer | 서핑족(중문) | — | 청년 | 아니오 | 홍보 | 9,000 | 쉼·경관 | 관광지 jungmun_surf Lv2 | q_surfer | diver | 파도 끝나면 여기서 몸 말려요. |
| diver | 다이버(우도) | — | 성인 | 아니오 | 아이템 | 14,000 | 먹거리·쉼 | 부탁 q_surfer | q_diver | yacht_owner | 오늘 시야 20미터. 물속이 하늘 같았어요. |
| yacht_owner | 요트 오너 | — | 성인 | 아니오 | 자금 | 60,000 | 쉼·먹거리 | 부탁 q_diver | q_yacht_owner | — | 요트 세워 둘 데는 없어도 커피는 있군요. |
| cafe_tourer | 카페 투어러 | — | 성인 | 아니오 | 연구 | 10,000 | 먹거리·쉼 | 관광지 jeongbang_falls Lv2 | q_cafe_tourer | ribbon_judge | 오늘 네 번째 카페. 여긴 평점 몇 점일까. |
| ribbon_judge | 리본 가이드 심사위원 | — | 성인 | 아니오 | 연구 | 20,000 | 먹거리·쉼 | 부탁 q_cafe_tourer | q_ribbon_judge | star_guide_inspector | 메모하는 거 신경 쓰지 마세요. |
| star_guide_inspector | 별점 가이드 조사원 | — | 성인 | 아니오 | 연구 | 30,000 | 먹거리·쉼 | 부탁 q_ribbon_judge | q_star_guide_inspector | — | 신분은 밝힐 수 없습니다. 식사 잘했습니다. |
| local_auntie | 동네 삼춘 | 여 | 시니어 | 아니오 | 아이템 | 6,000 | 쉼·먹거리 | 시작 | q_local_auntie | local_uncle | 새로 왔댄? 귤 하나 먹어 봅서. |
| local_uncle | 밭 삼춘 | 남 | 시니어 | 아니오 | 아이템 | 6,000 | 농사·쉼 | 부탁 q_local_auntie | q_local_uncle | market_auntie | 밭담 없이 밭 하민 바람에 다 날아가. |
| market_auntie | 오일장 삼춘 | 여 | 시니어 | 아니오 | 자금 | 7,000 | 먹거리·즐길거리 | 부탁 q_local_uncle | q_market_auntie | village_elder | 오일장 끝나민 여기 들르켜. |
| village_elder | 마을 어른 | 남 | 시니어 | 아니오 | 시설 인기 | 8,000 | 쉼·경관 | 부탁 q_market_auntie | q_village_elder | seolmundae | 이 동네 폭낭은 내가 어릴 때부터 있었주. |
| seolmundae | 설문대할망 | 여 | — | 아니오 | 아이템 | 99,999 | 경관·쉼 | 부탁 q_village_elder | q_seolmundae | — | 제주를 만든 건 나였주. 죽 한 솥 내와라. |
| mainlander_auntie | 육지 삼춘 | 여 | 시니어 | 아니오 | 자금 | 9,000 | 먹거리·쉼 | 1년 4월 | q_mainlander_auntie | mainlander_newbie | 제주는 처음이라 다 신기하네. |
| mainlander_newbie | 육지 것 | — | 청년 | 아니오 | 홍보 | 9,000 | 쉼·즐길거리 | 부탁 q_mainlander_auntie | q_mainlander_newbie | monthly_stayer | 육지 것이라고 놀리지 마세요. 정착할 거예요. |
| monthly_stayer | 한 달 살기 | — | 성인 | 아니오 | 연구 | 8,000 | 쉼·즐길거리 | 부탁 q_mainlander_newbie | q_monthly_stayer | jeju_immigrant | 한 달만 살아 보려 했는데 벌써 세 달째. |
| jeju_immigrant | 제주 이주민 | — | 성인 | 아니오 | 시설 인기 | 10,000 | 쉼·농사 | 부탁 q_monthly_stayer | q_jeju_immigrant | — | 이제 저도 삼춘 소리 들어요. |
| dog_mongi | 동네 강아지 몽이 | — | — | 아니오 | 아이템 | 0 | 경관·농사 | 관광지 gotjawal Lv2 | q_dog_mongi | street_cat_noeul | 멍! (꼬리를 흔든다) |
| street_cat_noeul | 길고양이 노을 | — | — | 아니오 | 아이템 | 0 | 쉼·경관 | 부탁 q_dog_mongi | q_street_cat_noeul | jeju_pony | 냐옹. (창가 자리를 차지한다) |
| jeju_pony | 제주 조랑말 | — | — | 아니오 | 아이템 | 0 | 농사·경관 | 부탁 q_street_cat_noeul | q_jeju_pony | — | 히힝. (당근을 노린다) |
| magpie_thief | 감귤 도둑 까치 | — | — | 아니오 | 아이템 | 0 | 농사 | tangerine_tree 3개 | q_magpie_thief | crow_flock | 깍깍! (귤을 물고 날아간다) |
| crow_flock | 까마귀 떼 | — | — | 예 | 아이템 | 0 | 농사 | 부탁 q_magpie_thief | q_crow_flock | roe_deer | 까악까악. (밭을 노린다) |
| roe_deer | 노루 | — | — | 아니오 | 아이템 | 0 | 농사·경관 | 부탁 q_crow_flock | q_roe_deer | — | … (귤밭을 빤히 본다) |
| school_trip | 수학여행단 | — | 청년 | 예 | 자금 | 5,000 | 즐길거리·먹거리 | 관광지 manjanggul Lv2 | q_school_trip | school_teacher | 선생님, 여기서 사진 찍어도 돼요? |
| school_teacher | 인솔 교사 | — | 성인 | 아니오 | 연구 | 8,000 | 쉼·편의 | 부탁 q_school_trip | q_school_teacher | school_club | 40명 인솔 중입니다. 화장실 어디죠? |
| school_club | 학교 동아리 | — | 청년 | 예 | 응모권 | 6,000 | 즐길거리·쉼 | 부탁 q_school_teacher | q_school_club | alumni_reunion | 동아리 MT는 카페에서! 보드게임 있어요? |
| alumni_reunion | 동창회 | — | 성인 | 예 | 자금 | 20,000 | 먹거리·쉼 | 부탁 q_school_club | q_alumni_reunion | — | 30년 만이야. 여기 국수 맛있다며? |
| company_workshop | 회사 워크숍 | — | 성인 | 예 | 자금 | 15,000 | 쉼·먹거리 | 관광지 black_pork_street Lv2 | q_company_workshop | team_leader | 워크숍 끝나고 자유 시간이에요! |
| team_leader | 팀장님 | — | 성인 | 아니오 | 자금 | 18,000 | 쉼·편의 | 부탁 q_company_workshop | q_team_leader | remote_team | 법인카드니까 다들 마음껏 시켜. |
| remote_team | 원격 근무팀 | — | 성인 | 예 | 연구 | 14,000 | 편의·쉼 | 부탁 q_team_leader | q_remote_team | ceo_retreat | 줌 회의 중이니 조용히 부탁드려요. |
| ceo_retreat | 임원 워크숍 | — | 시니어 | 예 | 자금 | 35,000 | 먹거리·쉼 | 부탁 q_remote_team | q_ceo_retreat | — | 임원진 열 분 모십니다. 흑돼지 되나요? |
| silver_tour | 실버 관광 | — | 시니어 | 예 | 자금 | 8,000 | 쉼·먹거리 | 관광지 bijarim Lv2 | q_silver_tour | grandma_gyecheo | 천천히 걸읍시다. 급할 거 없어요. |
| grandma_gyecheo | 계모임 할머니들 | 여 | 시니어 | 예 | 자금 | 10,000 | 먹거리·쉼 | 부탁 q_silver_tour | q_grandma_gyecheo | retired_teacher | 우리 계모임 30년째. 오메기떡 열 개! |
| retired_teacher | 은퇴 선생님 | 남 | 시니어 | 아니오 | 연구 | 9,000 | 즐길거리·쉼 | 부탁 q_grandma_gyecheo | q_retired_teacher | hallabong_grandpa | 책 읽을 자리 하나면 충분해요. |
| hallabong_grandpa | 한라봉 할아버지 | 남 | 시니어 | 아니오 | 아이템 | 7,000 | 농사·쉼 | 부탁 q_retired_teacher | q_hallabong_grandpa | — | 한라봉은 내가 제주서 제일 잘 키우주. |
| running_crew | 러닝크루 | — | 청년 | 예 | 홍보 | 6,000 | 편의·쉼 | 관광지 udo_bike Lv2 | q_running_crew | trail_runner | 10km 끝! 아이스 아메리카노 다섯 잔요. |
| trail_runner | 트레일 러너 | — | 청년 | 아니오 | 연구 | 8,000 | 쉼·먹거리 | 부탁 q_running_crew | q_trail_runner | cyclist | 오름 세 개 넘고 왔어요. 물 좀요. |
| cyclist | 자전거 일주 | — | 성인 | 아니오 | 응모권 | 9,000 | 편의·쉼 | 부탁 q_trail_runner | q_cyclist | triathlete | 섬 한 바퀴 234km, 오늘 반 돌았어요. |
| triathlete | 철인 3종 | — | 성인 | 아니오 | 자금 | 15,000 | 먹거리·쉼 | 부탁 q_cyclist | q_triathlete | — | 수영 끝, 자전거 끝, 이제 달리기 전에 한 잔. |
| night_guest | 밤 손님 | — | 성인 | 아니오 | 시설 인기 | 13,000 | 쉼·경관 | 관광지 oreum Lv2 | q_night_guest | stargazer | 해 지고 나서가 진짜 제주죠. |
| stargazer | 별 보는 사람 | — | 성인 | 아니오 | 연구 | 12,000 | 경관·쉼 | 부탁 q_night_guest | q_stargazer | night_photographer | 여긴 은하수가 맨눈으로 보여요. |
| night_photographer | 야경 사진가 | — | 성인 | 아니오 | 응모권 | 15,000 | 경관·쉼 | 부탁 q_stargazer | q_night_photographer | lighthouse_keeper | 장노출 30초. 움직이지 마세요. |
| lighthouse_keeper | 등대 지킴이 | 남 | 시니어 | 아니오 | 아이템 | 9,000 | 경관·쉼 | 부탁 q_night_photographer | q_lighthouse_keeper | — | 도대불 불 켜던 시절 이야기 들어 볼래? |
| group_cn | 중국 단체 | — | 성인 | 예 | 자금 | 12,000 | 즐길거리·편의 | 관광지 seongsan Lv2 | q_group_cn | group_jp | 감귤 초콜릿 열 상자 주세요! |
| group_jp | 일본 단체 | — | 시니어 | 예 | 자금 | 14,000 | 쉼·먹거리 | 부탁 q_group_cn | q_group_jp | group_sea | 조용한 자리로 부탁합니다. |
| group_sea | 동남아 단체 | — | 성인 | 예 | 자금 | 13,000 | 즐길거리·경관 | 부탁 q_group_jp | q_group_sea | — | 눈 오는 한라산 보러 왔어요! |
| solo_foreign | 개별 외국 여행자 | — | 성인 | 아니오 | 연구 | 10,000 | 쉼·경관 | 관광지 hallasan Lv2 | q_solo_foreign | foreign_chef | Jeju is beautiful! 아메리카노 큰 컵요. |
| foreign_chef | 외국 셰프 | — | 성인 | 아니오 | 연구 | 20,000 | 먹거리·농사 | 부탁 q_solo_foreign | q_foreign_chef | foreign_vlogger | 이 흑돼지, 우리 가게에 쓰고 싶군요. |
| foreign_vlogger | 외국 브이로거 | — | 청년 | 아니오 | 홍보 | 15,000 | 즐길거리·경관 | 부탁 q_foreign_chef | q_foreign_vlogger | world_traveler | Hello everyone, 오늘은 제주 카페! |
| world_traveler | 세계 일주 여행자 | — | 성인 | 아니오 | 아이템 | 18,000 | 쉼·경관 | 부탁 q_foreign_vlogger | q_world_traveler | — | 120개 나라 중 제주가 제일 조용해요. |
| art_student | 미술 학생 | — | 청년 | 아니오 | 연구 | 4,000 | 경관·쉼 | 관광지 sangumburi Lv2 | q_art_student | village_painter | 스케치북에 오름 그리는 중이에요. |
| village_painter | 마을 화가 | — | 성인 | 아니오 | 아이템 | 8,000 | 경관·즐길거리 | 부탁 q_art_student | q_village_painter | potter | 이 마을 풍경만 30년 그렸주. |
| potter | 도예가 | — | 성인 | 아니오 | 아이템 | 10,000 | 즐길거리·쉼 | 부탁 q_village_painter | q_potter | architect | 흙은 거짓말을 안 해요. |
| architect | 건축가 | — | 성인 | 아니오 | 시설 인기 | 25,000 | 쉼·경관 | 부탁 q_potter | q_architect | — | 돌담과 창고, 이 비율이 좋네요. |
| dessert_hunter | 디저트 헌터 | 여 | 청년 | 아니오 | 연구 | 9,000 | 먹거리·쉼 | 관광지 dongmun_market Lv2 | q_dessert_hunter | coffee_geek | 디저트는 배가 아니라 마음으로 먹는 거죠. |
| coffee_geek | 커피 덕후 | — | 성인 | 아니오 | 연구 | 11,000 | 먹거리·쉼 | 부탁 q_dessert_hunter | q_coffee_geek | home_barista | 원두 원산지 여쭤봐도 될까요? |
| home_barista | 홈 바리스타 | — | 성인 | 아니오 | 시설 인기 | 12,000 | 먹거리·즐길거리 | 부탁 q_coffee_geek | q_home_barista | barista_champion | 집에서 내리는 것보다 맛있어야 나오죠. |
| barista_champion | 바리스타 챔피언 | — | 성인 | 아니오 | 연구 | 15,000 | 먹거리·쉼 | 부탁 q_home_barista | q_barista_champion | — | 라떼 아트, 한 수 가르쳐 드릴까요? |
| dog_walker | 강아지 산책러 | — | 성인 | 아니오 | 시설 인기 | 8,000 | 편의·경관 | 관광지 horse_ranch Lv2 | q_dog_walker | dog_camper | 저희 강아지 물 한 그릇만 주실 수 있나요? |
| dog_camper | 반려견 캠핑족 | — | 성인 | 예 | 자금 | 14,000 | 쉼·편의 | 부탁 q_dog_walker | q_dog_camper | dog_trainer | 강아지 세 마리랑 차박 중이에요. |
| dog_trainer | 도그 트레이너 | — | 성인 | 아니오 | 홍보 | 12,000 | 편의·즐길거리 | 부탁 q_dog_camper | q_dog_trainer | — | 몽이 훈련은 제가 맡을게요. |
| angler | 낚시꾼 | 남 | 성인 | 아니오 | 아이템 | 6,000 | 먹거리·쉼 | 관광지 haenyeo_house Lv2 | q_angler | fishing_boat_captain | 새벽 네 시부터 앉았수다. 커피 진하게. |
| fishing_boat_captain | 어선 선장 | 남 | 시니어 | 아니오 | 아이템 | 10,000 | 먹거리·쉼 | 부탁 q_angler | q_fishing_boat_captain | dolphin_guide | 오늘 갈치 풍년이라. 한 마리 줄까? |
| dolphin_guide | 돌고래 가이드 | — | 성인 | 아니오 | 응모권 | 11,000 | 경관·쉼 | 부탁 q_fishing_boat_captain | q_dolphin_guide | — | 오늘 남방큰돌고래 일곱 마리 봤어요! |
| camper | 캠핑족 | — | 성인 | 예 | 자금 | 8,000 | 쉼·편의 | 관광지 theme_park Lv2 | q_camper | van_lifer | 텐트 옆에 카페라니, 최고예요. |
| van_lifer | 차박러 | — | 청년 | 아니오 | 응모권 | 9,000 | 편의·쉼 | 부탁 q_camper | q_van_lifer | glamper | 차에서 자고 카페에서 씻어요. 농담이에요. |
| glamper | 글램핑족 | — | 성인 | 예 | 자금 | 20,000 | 쉼·먹거리 | 부탁 q_van_lifer | q_glamper | — | 불멍 되나요? 마시멜로 가져왔어요. |
| dolhareubang_spirit | 돌하르방 정령 | — | — | 아니오 | 아이템 | 30,000 | 경관·쉼 | 관광지 yongmeori_coast Lv2 | q_dolhareubang_spirit | yeongdeung | 3천 년 만의 커피로구나. |
| yeongdeung | 영등할망 | 여 | — | 아니오 | 아이템 | 40,000 | 경관·농사 | 부탁 q_dolhareubang_spirit | q_yeongdeung | baekrok | 2월 바람은 내가 데려온 거주. |
| baekrok | 백록 | — | — | 아니오 | 아이템 | 25,000 | 경관·농사 | 부탁 q_yeongdeung | q_baekrok | jacheongbi | … (하얀 사슴이 풀을 뜯는다) |
| jacheongbi | 자청비 | 여 | — | 아니오 | 아이템 | 35,000 | 농사·경관 | 부탁 q_baekrok | q_jacheongbi | — | 농사의 신이 씨앗 하나 주마. |
| kid_pocketmoney | 용돈 초등학생 | — | 청년 | 아니오 | 응모권 | 2,000 | 먹거리·즐길거리 | 관광지 udo_peanut_village Lv2 | q_kid_pocketmoney | teen_idol_fan | 용돈 삼천 원으로 뭐 먹을 수 있어요? |
| teen_idol_fan | 아이돌 팬 청소년 | 여 | 청년 | 예 | 응모권 | 5,000 | 즐길거리·경관 | 부탁 q_kid_pocketmoney | q_teen_idol_fan | college_club | 오빠가 여기서 찍은 사진 있어요! |
| college_club | 대학 동아리 | — | 청년 | 예 | 응모권 | 6,000 | 즐길거리·먹거리 | 부탁 q_teen_idol_fan | q_college_club | — | 동아리 사진 촬영 왔어요. 스무 명이요. |
| taxi_driver | 택시 기사 | 남 | 성인 | 아니오 | 홍보 | 4,000 | 편의·먹거리 | 관광지 noodle_street Lv2 | q_taxi_driver | bus_driver | 손님 내려 주고 한 잔 하고 가쿠다. |
| bus_driver | 관광버스 기사 | 남 | 성인 | 아니오 | 홍보 | 5,000 | 편의·먹거리 | 부탁 q_taxi_driver | q_bus_driver | rentcar_staff | 버스 세울 데만 있으면 단체 데려오지. |
| rentcar_staff | 렌터카 직원 | — | 청년 | 아니오 | 홍보 | 6,000 | 편의·쉼 | 부탁 q_bus_driver | q_rentcar_staff | — | 손님들한테 여기 카페 추천해 드릴게요. |
| golfer | 골퍼 | — | 성인 | 아니오 | 자금 | 16,000 | 쉼·먹거리 | 관광지 barley_brewery Lv2 | q_golfer | — | 18홀 끝나고 제주 보리 음료 한 잔. |
| resort_guest | 리조트 투숙객 | — | 성인 | 아니오 | 자금 | 18,000 | 쉼·경관 | 관광지 yacht_tour Lv2 | q_resort_guest | — | 호캉스 중인데 리조트 커피가 별로라서요. |
| hallasan_spirit | 한라산 신령 | — | — | 아니오 | 아이템 | 60,000 | 경관·쉼 | 관광지 baengnokdam Lv2 | q_hallasan_spirit | — | 눈 오는 날에만 내려오주. |

## 3. 부탁 (103)

### 3.1 부탁
- 조건 타입: `menuSold`(메뉴 id N개 판매) / `objectPlaced`(시설 id N개 배치) / `spotLevel`(관광지 id LvN) / `segmentPopularity`(손님 id 인기 N) / `item`(아이템 id N개 보유) / `none`(수락 즉시 완료).
- 파라미터 형식: `<id> <N>` (spotLevel은 `<spot_id> <Lv>`). 보상은 `자금 N`·`연구 N`·`응모권 N`·`마일리지 N`·`아이템 <item_id>`·`홍보 +N`을 `·`로 잇는다.
- 관광지 표(§6)의 "Lv4 해금 부탁"에 적힌 부탁은 그 관광지 Lv4가 되어야 게시판에 뜬다(추가 게이트).
- 메뉴 id는 `src/data/menus.json`의 18종 + §14.1의 추가 메뉴 15종.
| id | 의뢰 손님 | 내용 | 조건 타입 | 파라미터 | 보상 | 해금 손님 |
|---|---|---|---|---|---|---|
| q_student | student | 아메리카노 20잔 판매 → 워홀 청년 방문 | menuSold | americano 20 | 자금 200,000·연구 20 | working_holiday |
| q_working_holiday | working_holiday | 감귤나무 3그루 심기 → 디지털 노마드 방문 | objectPlaced | tangerine_tree 3 | 자금 300,000·연구 40 | digital_nomad |
| q_digital_nomad | digital_nomad | 와이파이 존 1개 배치 → 스타트업 대표 방문 | objectPlaced | wifi_zone 1 | 자금 500,000·연구 80 | startup_ceo |
| q_startup_ceo | startup_ceo | 청년 손님 인기 40 → 투자자 방문 | segmentPopularity | digital_nomad 40 | 자금 1,500,000·응모권 1 | investor |
| q_investor | investor | 루프탑 1개 배치 → 투자금 | objectPlaced | rooftop 1 | 자금 5,000,000·연구 300 | — |
| q_couple | couple | 스냅사진관 1개 배치 → 신혼부부 방문 | objectPlaced | snap_studio 1 | 자금 300,000·연구 30 | newlyweds |
| q_newlyweds | newlyweds | 감귤 에이드 30잔 판매 → 웨딩스냅 작가 방문 | menuSold | tangerine_ade 30 | 자금 800,000·응모권 1 | wedding_snap |
| q_wedding_snap | wedding_snap | 유채 8개 배치 → 웨딩플래너 방문 | objectPlaced | canola 8 | 자금 1,000,000·연구 150 | wedding_planner |
| q_wedding_planner | wedding_planner | 여성 손님 인기 60 → 웨딩 촬영 계약 | segmentPopularity | couple 60 | 자금 3,000,000·응모권 2 | — |
| q_insta_traveler | insta_traveler | 포토존 1개 배치 → 인플루언서 방문 | objectPlaced | photo_spot 1 | 자금 300,000·홍보 +5 | influencer |
| q_influencer | influencer | 수국 6개 배치 → 유튜버 방문 | objectPlaced | hydrangea 6 | 자금 700,000·연구 100 | youtuber |
| q_youtuber | youtuber | 한라봉 에이드 40잔 판매 → 방송 PD 방문 | menuSold | hallabong_ade 40 | 자금 1,200,000·응모권 1 | tv_pd |
| q_tv_pd | tv_pd | 오름 전망대 1개 배치 → 배우 방문 | objectPlaced | observatory 1 | 자금 2,000,000·연구 300 | actor |
| q_actor | actor | 전체 손님 인기 60 → 드라마 촬영지 선정 | segmentPopularity | youtuber 60 | 자금 5,000,000·응모권 3 | — |
| q_village_head | village_head | 현무암 돌담 6개 배치 → 해녀 삼춘 방문 | objectPlaced | stonewall 6 | 자금 200,000·아이템 jeju_salt | haenyeo |
| q_haenyeo | haenyeo | 보말칼국수 20그릇 판매 → 귀농 선배 방문 | menuSold | bomal_kalguksu 20 | 자금 400,000·아이템 seaweed_fertilizer | returnee_senior |
| q_returnee_senior | returnee_senior | 밭 6개 배치 → 농협 직원 방문 | objectPlaced | field 6 | 자금 600,000·연구 120 | coop_staff |
| q_coop_staff | coop_staff | 감귤 선과장 1개 배치 → 도지사 방문 | objectPlaced | sorting_house 1 | 자금 1,500,000·마일리지 3 | governor |
| q_governor | governor | 시니어 손님 인기 60 → 귀농 지원금 | segmentPopularity | village_head 60 | 자금 8,000,000·연구 500 | — |
| q_rentcar_family | rentcar_family | 주차장 1개 배치 → 유모차 가족 방문 | objectPlaced | parking 1 | 자금 300,000·연구 30 | stroller_family |
| q_stroller_family | stroller_family | 어린이 테이블 2개 배치 → 삼대 가족 방문 | objectPlaced | kids_table 2 | 자금 500,000·응모권 1 | three_gen_family |
| q_three_gen_family | three_gen_family | 단체 손님 인기 40 → 가족 단골 | segmentPopularity | rentcar_family 40 | 자금 1,500,000·연구 200 | — |
| q_olle_walker | olle_walker | 툇마루 2개 배치 → 오름 등반가 방문 | objectPlaced | toenmaru 2 | 자금 200,000·연구 40 | oreum_hiker |
| q_oreum_hiker | oreum_hiker | 오름 뷰 벤치 1개 배치 → 한라산 산악회 방문 | objectPlaced | oreum_bench 1 | 자금 500,000·연구 80 | hallasan_club |
| q_hallasan_club | hallasan_club | 한라산 Lv3 → 산악회 단골 | spotLevel | hallasan 3 | 자금 1,200,000·응모권 1 | — |
| q_surfer | surfer | 야자수 4개 배치 → 다이버 방문 | objectPlaced | palm 4 | 자금 300,000·연구 40 | diver |
| q_diver | diver | 해녀 물회집 1개 배치 → 요트 오너 방문 | objectPlaced | haenyeo_mulhoe 1 | 자금 800,000·아이템 conch_shell | yacht_owner |
| q_yacht_owner | yacht_owner | 루프탑 1개 배치 → 요트 파티 매출 | objectPlaced | rooftop 1 | 자금 4,000,000·응모권 2 | — |
| q_cafe_tourer | cafe_tourer | 핸드드립 바 1개 배치 → 리본 가이드 심사위원 방문 | objectPlaced | handdrip_bar 1 | 자금 300,000·연구 60 | ribbon_judge |
| q_ribbon_judge | ribbon_judge | 감귤 타르트 40개 판매 → 별점 가이드 조사원 방문 | menuSold | tangerine_tart 40 | 자금 1,500,000·연구 400 | star_guide_inspector |
| q_star_guide_inspector | star_guide_inspector | 카페 투어러 인기 60 → 가이드 등재 | segmentPopularity | cafe_tourer 60 | 자금 5,000,000·연구 2,000·응모권 3 | — |
| q_local_auntie | local_auntie | 돌담 아래 평상 2개 배치 → 밭 삼춘 방문 | objectPlaced | bench_stonewall 2 | 자금 100,000·아이템 galot_cushion | local_uncle |
| q_local_uncle | local_uncle | 당근주스 15잔 판매 → 오일장 삼춘 방문 | menuSold | carrot_juice 15 | 자금 150,000·아이템 seaweed_fertilizer | market_auntie |
| q_market_auntie | market_auntie | 오메기떡 매대 1개 배치 → 마을 어른 방문 | objectPlaced | omegi_stall 1 | 자금 300,000·마일리지 2 | village_elder |
| q_village_elder | village_elder | 시니어 손님 인기 40 → 설문대할망 방문 | segmentPopularity | local_auntie 40 | 자금 800,000·연구 150 | seolmundae |
| q_seolmundae | seolmundae | 전복 죽 10그릇 판매 → 천년 팽나무 씨앗 | menuSold | abalone_porridge 10 | 자금 3,000,000·아이템 millennium_seed | — |
| q_mainlander_auntie | mainlander_auntie | 감귤주스 20잔 판매 → 육지 것 방문 | menuSold | tangerine_juice 20 | 자금 200,000·연구 20 | mainlander_newbie |
| q_mainlander_newbie | mainlander_newbie | 북카페 서가 1개 배치 → 한 달 살기 방문 | objectPlaced | bookshelf 1 | 자금 300,000·연구 50 | monthly_stayer |
| q_monthly_stayer | monthly_stayer | 소파석 2개 배치 → 제주 이주민 방문 | objectPlaced | sofa 2 | 자금 500,000·연구 100 | jeju_immigrant |
| q_jeju_immigrant | jeju_immigrant | 한 달 살기 인기 40 → 이주민 모임 단골 | segmentPopularity | monthly_stayer 40 | 자금 1,000,000·응모권 1 | — |
| q_dog_mongi | dog_mongi | 닭장 1개 배치 → 길고양이 노을 방문 | objectPlaced | chicken_coop 1 | 아이템 honey | street_cat_noeul |
| q_street_cat_noeul | street_cat_noeul | 참치 한 캔 주기(자동 완료) → 조랑말 방문 | none | — | 연구 50 | jeju_pony |
| q_jeju_pony | jeju_pony | 당근케이크 10개 판매 → 특수 직원 해금 | menuSold | carrot_cake 10 | 아이템 pony_doll·응모권 1 | — |
| q_magpie_thief | magpie_thief | 허수아비 대신 삼나무 4개 배치 → 까마귀 떼 등장 | objectPlaced | cedar 4 | 아이템 seaweed_fertilizer | crow_flock |
| q_crow_flock | crow_flock | 돌하르방 3개 배치 → 노루 등장 | objectPlaced | dolhareubang 3 | 자금 200,000·연구 30 | roe_deer |
| q_roe_deer | roe_deer | 현무암 돌담 10개 배치 → 노루 침입 해결(인턴 모집 해금) | objectPlaced | stonewall 10 | 자금 500,000·아이템 deer_bell | — |
| q_school_trip | school_trip | 노래방 1개 배치 → 인솔 교사 방문 | objectPlaced | karaoke 1 | 자금 300,000·연구 30 | school_teacher |
| q_school_teacher | school_teacher | 화장실 2개 배치 → 학교 동아리 방문 | objectPlaced | restroom 2 | 자금 400,000·연구 60 | school_club |
| q_school_club | school_club | 보드게임 룸 1개 배치 → 동창회 방문 | objectPlaced | boardgame_room 1 | 자금 500,000·응모권 1 | alumni_reunion |
| q_alumni_reunion | alumni_reunion | 단체 손님 인기 40 → 동창회 정기 모임 | segmentPopularity | school_trip 40 | 자금 1,500,000·연구 200 | — |
| q_company_workshop | company_workshop | 큰 테이블 2개 배치 → 팀장님 방문 | objectPlaced | table_big 2 | 자금 400,000·연구 40 | team_leader |
| q_team_leader | team_leader | 카페라떼 40잔 판매 → 원격 근무팀 방문 | menuSold | latte 40 | 자금 800,000·응모권 1 | remote_team |
| q_remote_team | remote_team | 와이파이 존 2개 배치 → 임원 워크숍 방문 | objectPlaced | wifi_zone 2 | 자금 1,000,000·연구 200 | ceo_retreat |
| q_ceo_retreat | ceo_retreat | 흑돼지 구이 식당 1개 배치 → 기업 단골 계약 | objectPlaced | black_pork_grill 1 | 자금 3,000,000·응모권 2 | — |
| q_silver_tour | silver_tour | 소파석 1개 배치 → 계모임 할머니들 방문 | objectPlaced | sofa 1 | 자금 300,000·연구 30 | grandma_gyecheo |
| q_grandma_gyecheo | grandma_gyecheo | 오메기떡 30개 판매 → 은퇴 선생님 방문 | menuSold | omegi_rice_cake 30 | 자금 500,000·마일리지 2 | retired_teacher |
| q_retired_teacher | retired_teacher | 북카페 서가 2개 배치 → 한라봉 할아버지 방문 | objectPlaced | bookshelf 2 | 자금 600,000·연구 150 | hallabong_grandpa |
| q_hallabong_grandpa | hallabong_grandpa | 꿀 3개 가져오기 → 한라봉 씨앗 | item | honey 3 | 아이템 hallabong_seed·연구 100 | — |
| q_running_crew | running_crew | 자전거 거치대 2개 배치 → 트레일 러너 방문 | objectPlaced | bike_rack 2 | 자금 200,000·연구 30 | trail_runner |
| q_trail_runner | trail_runner | 아이스티 30잔 판매 → 자전거 일주 방문 | menuSold | iced_tea 30 | 자금 400,000·연구 60 | cyclist |
| q_cyclist | cyclist | 전동 스쿠터 대여 1개 배치 → 철인 3종 방문 | objectPlaced | scooter_rental 1 | 자금 800,000·응모권 1 | triathlete |
| q_triathlete | triathlete | 청년 손님 인기 40 → 러닝 대회 후원 | segmentPopularity | running_crew 40 | 자금 1,500,000·연구 200 | — |
| q_night_guest | night_guest | 석등 3개 배치 → 별 보는 사람 방문 | objectPlaced | stone_lantern 3 | 자금 300,000·연구 40 | stargazer |
| q_stargazer | stargazer | 초롱 걸린 길 6개 배치 → 야경 사진가 방문 | objectPlaced | lantern_path 6 | 자금 500,000·연구 100 | night_photographer |
| q_night_photographer | night_photographer | 불멍 화로 2개 배치 → 등대 지킴이 방문 | objectPlaced | fire_pit 2 | 자금 900,000·응모권 1 | lighthouse_keeper |
| q_lighthouse_keeper | lighthouse_keeper | 밤 손님 인기 40 → 도대불 해금 | segmentPopularity | night_guest 40 | 자금 1,200,000·아이템 lantern | — |
| q_group_cn | group_cn | 기념품 매대 2개 배치 → 일본 단체 방문 | objectPlaced | souvenir 2 | 자금 500,000·연구 40 | group_jp |
| q_group_jp | group_jp | 녹차 40잔 판매 → 동남아 단체 방문 | menuSold | green_tea 40 | 자금 800,000·응모권 1 | group_sea |
| q_group_sea | group_sea | 성산일출봉 Lv3 → 투어 버스 정기 노선 | spotLevel | seongsan 3 | 자금 2,000,000·연구 200 | — |
| q_solo_foreign | solo_foreign | 번역기 태블릿 1개 배치 → 외국 셰프 방문 | objectPlaced | translator 1 | 자금 300,000·연구 50 | foreign_chef |
| q_foreign_chef | foreign_chef | 흑돼지 샌드위치 20개 판매 → 외국 브이로거 방문 | menuSold | black_pork_sandwich 20 | 자금 1,000,000·연구 300 | foreign_vlogger |
| q_foreign_vlogger | foreign_vlogger | 감귤 따기 체험장 1개 배치 → 세계 일주 여행자 방문 | objectPlaced | picking_experience 1 | 자금 1,500,000·응모권 1 | world_traveler |
| q_world_traveler | world_traveler | 백록담 Lv3 → 세계 여행 잡지 소개 | spotLevel | baengnokdam 3 | 자금 2,500,000·아이템 gold_leaf | — |
| q_art_student | art_student | 억새 6개 배치 → 마을 화가 방문 | objectPlaced | pampas 6 | 자금 200,000·연구 40 | village_painter |
| q_village_painter | village_painter | 작은 갤러리 1개 배치 → 도예가 방문 | objectPlaced | gallery 1 | 자금 500,000·아이템 oreum_poster | potter |
| q_potter | potter | 도자기 공방 1개 배치 → 건축가 방문 | objectPlaced | pottery_studio 1 | 자금 800,000·아이템 pottery_jar | architect |
| q_architect | architect | 감귤 온실 카페홀 1개 배치 → 건축상 수상 | objectPlaced | tangerine_hall 1 | 자금 3,000,000·연구 500 | — |
| q_dessert_hunter | dessert_hunter | 감귤 스콘 30개 판매 → 커피 덕후 방문 | menuSold | tangerine_scone 30 | 자금 300,000·연구 50 | coffee_geek |
| q_coffee_geek | coffee_geek | 핸드드립 바 2개 배치 → 홈 바리스타 방문 | objectPlaced | handdrip_bar 2 | 자금 500,000·아이템 bean_sample | home_barista |
| q_home_barista | home_barista | 용천수 콜드브루 20잔 판매 → 바리스타 챔피언 방문 | menuSold | spring_coldbrew 20 | 자금 800,000·연구 150 | barista_champion |
| q_barista_champion | barista_champion | 카운터석 2개 배치 → 챔피언 직원 후보 | objectPlaced | counter 2 | 자금 1,500,000·연구 400 | — |
| q_dog_walker | dog_walker | 반려견 놀이터 1개 배치 → 반려견 캠핑족 방문 | objectPlaced | dog_park 1 | 자금 400,000·연구 40 | dog_camper |
| q_dog_camper | dog_camper | 잔디 피크닉 1개 배치 → 도그 트레이너 방문 | objectPlaced | picnic 1 | 자금 700,000·응모권 1 | dog_trainer |
| q_dog_trainer | dog_trainer | 반려견 놀이터 2개 배치 → 반려견 동반 카페 인증 | objectPlaced | dog_park 2 | 자금 1,200,000·연구 200 | — |
| q_angler | angler | 계란 샌드위치 20개 판매 → 어선 선장 방문 | menuSold | egg_sandwich 20 | 자금 200,000·아이템 conch_shell | fishing_boat_captain |
| q_fishing_boat_captain | fishing_boat_captain | 해녀 물회집 1개 배치 → 돌고래 가이드 방문 | objectPlaced | haenyeo_mulhoe 1 | 자금 800,000·아이템 seaweed_fertilizer | dolphin_guide |
| q_dolphin_guide | dolphin_guide | 오름 뷰 벤치 2개 배치 → 돌고래 투어 제휴 | objectPlaced | oreum_bench 2 | 자금 1,000,000·응모권 1 | — |
| q_camper | camper | 해먹 2개 배치 → 차박러 방문 | objectPlaced | hammock 2 | 자금 300,000·연구 40 | van_lifer |
| q_van_lifer | van_lifer | 주차장 2개 배치 → 글램핑족 방문 | objectPlaced | parking 2 | 자금 600,000·연구 80 | glamper |
| q_glamper | glamper | 테마파크 Lv3 → 글램핑 제휴 | spotLevel | theme_park 3 | 자금 1,500,000·응모권 1 | — |
| q_dolhareubang_spirit | dolhareubang_spirit | 돌하르방 미니어처 1개 가져오기 → 영등할망 방문 | item | dolhareubang_mini 1 | 아이템 dolhareubang_mini·연구 100 | yeongdeung |
| q_yeongdeung | yeongdeung | 삼나무 8개 배치 → 백록 방문 | objectPlaced | cedar 8 | 아이템 wind_charm·연구 200 | baekrok |
| q_baekrok | baekrok | 유채꽃 팬케이크 10개 판매 → 자청비 방문 | menuSold | canola_pancake 10 | 아이템 white_deer_bell·연구 300 | jacheongbi |
| q_jacheongbi | jacheongbi | 밭 10개 배치 → 씨앗 선물 | objectPlaced | field 10 | 아이템 tangerine_seed·아이템 hallabong_seed | — |
| q_kid_pocketmoney | kid_pocketmoney | 쿠키 20개 판매 → 아이돌 팬 청소년 방문 | menuSold | cookie 20 | 자금 100,000·연구 20 | teen_idol_fan |
| q_teen_idol_fan | teen_idol_fan | 스냅사진관 2개 배치 → 대학 동아리 방문 | objectPlaced | snap_studio 2 | 자금 300,000·응모권 1 | college_club |
| q_college_club | college_club | 청년 손님 인기 30 → 대학 축제 부스 초청 | segmentPopularity | student 30 | 자금 500,000·연구 80 | — |
| q_taxi_driver | taxi_driver | 주차장 1개 배치 → 관광버스 기사 방문 | objectPlaced | parking 1 | 자금 200,000·홍보 +5 | bus_driver |
| q_bus_driver | bus_driver | 대형 주차장 1개 배치 → 렌터카 직원 방문 | objectPlaced | parking_large 1 | 자금 800,000·홍보 +10 | rentcar_staff |
| q_rentcar_staff | rentcar_staff | 편의 시설 인기 40 → 렌터카 지도 등재 | segmentPopularity | rentcar_family 40 | 자금 1,000,000·홍보 +15 | — |
| q_golfer | golfer | 제주 보리 음료 펍 1개 배치 → 골프 모임 단골 | objectPlaced | barley_pub 1 | 자금 1,000,000·응모권 1 | — |
| q_resort_guest | resort_guest | 치즈케이크 30개 판매 → 리조트 제휴 | menuSold | cheesecake 30 | 자금 1,200,000·연구 150 | — |
| q_hallasan_spirit | hallasan_spirit | 제주 말차 라떼 10잔 판매 → 산의 축복 | menuSold | matcha_latte 10 | 아이템 snow_charm·연구 500·응모권 2 | — |

## 4. 콤보 (45)

### 4.1 콤보
- 판정: 체비쇼프 거리 2칸 이내(v1과 동일). 효과 열은 인기·요금 보너스를 받는 쪽(A/B/둘 다). 이름에 "소음"·"시끄러운"이 들어간 콤보는 ↓(−3/−5%), 나머지는 ↑(+3/+5%), 이름이 "정상 전망"·"천년의 그늘"·"저녁 한 상"·"인생샷 기념품"·"바리스타 쇼"이면 ↑↑(+6/+10%).
- 대상 손님층이 전체가 아니면 그 층 인기에도 ±3. 히든 콤보는 도감에 ???로 표시, 발견 시 팡파르.
| id | 시설 A | 시설 B | 대상 손님층 | 효과 | 히든 | 이름 |
|---|---|---|---|---|---|---|
| cb_tangerine_view | table_out | tangerine_tree | 전체 | 둘 다 | 아니오 | 귤밭 뷰 |
| cb_sarangbang | bench_stonewall | hackberry_shade | 시니어 | A | 아니오 | 사랑방 |
| cb_jeju_gate | dolhareubang_pair | dolhareubang | 전체 | A | 아니오 | 제주 대문 |
| cb_spring_window | window_seat | canola | 여성 | A | 예 | 봄 창가 |
| cb_autumn_fire | fire_pit | pampas | 청년 | 둘 다 | 예 | 억새 불멍 |
| cb_quiet_shelf | bookshelf | camellia | 성인 | A | 예 | 동백 서재 |
| cb_chicken_watch | kids_table | chicken_coop | 단체 | A | 예 | 닭 구경 |
| cb_noisy_kids | kids_table | roaster | 단체 | A | 아니오 | 시끄러운 로스터 |
| cb_shelf_noise | bookshelf | parking | 전체 | A | 아니오 | 주차장 소음 |
| cb_group_souvenir | souvenir | parking | 단체 | A | 예 | 단체 기념품 |
| cb_photo_souvenir | souvenir | photo_spot | 여성 | 둘 다 | 예 | 인생샷 기념품 |
| cb_barista_show | counter | roaster | 성인 | A | 예 | 바리스타 쇼 |
| cb_hammock_cedar | hammock | cedar | 성인 | A | 예 | 그늘 해먹 |
| cb_field_picnic | picnic | field | 단체 | A | 예 | 밭 체험 |
| cb_summit_terrace | oreum_bench | observatory | 전체 | 둘 다 | 아니오 | 정상 전망 |
| cb_wall_harvest | stonewall | field | 전체 | B | 아니오 | 밭담 수확 |
| cb_honey_canola | beehive | canola | 전체 | A | 아니오 | 유채 꿀 |
| cb_honey_camellia | beehive | camellia | 전체 | A | 아니오 | 동백 꿀 |
| cb_water_jar_bench | water_jar | bench_stonewall | 시니어 | B | 예 | 물허벅 쉼터 |
| cb_night_path | stone_lantern | lantern_path | 전체 | 둘 다 | 예 | 밤길 |
| cb_summer_pond | pond | hydrangea | 여성 | 둘 다 | 예 | 여름 연못 |
| cb_cat_shelf | cat_house | bookshelf | 여성 | B | 예 | 고양이 서재 |
| cb_group_vending | vending | table_big | 단체 | B | 아니오 | 단체 자판기 |
| cb_gallery_sofa | gallery | sofa | 성인 | 둘 다 | 예 | 갤러리 라운지 |
| cb_jam_orchard | jam_workshop | tangerine_tree | 단체 | A | 예 | 귤밭 잼 공방 |
| cb_restroom_seat | restroom | table_in | 전체 | B | 아니오 | 화장실 옆자리 |
| cb_surf_palm | terrace_seat | palm | 청년 | A | 예 | 남쪽 테라스 |
| cb_wifi_sofa | wifi_zone | sofa | 청년 | 둘 다 | 아니오 | 노트북 라운지 |
| cb_stroller_kids | stroller_park | kids_table | 단체 | B | 아니오 | 아이 동반 |
| cb_dog_picnic | dog_park | picnic | 성인 | 둘 다 | 예 | 강아지 소풍 |
| cb_snap_camellia | snap_studio | camellia | 여성 | A | 예 | 동백 스냅 |
| cb_karaoke_shelf | karaoke | bookshelf | 전체 | B | 아니오 | 노래방 소음 |
| cb_greenhouse_hallabong | greenhouse_seat | hallabong_house | 전체 | A | 예 | 한라봉 온실 |
| cb_toenmaru_jar | toenmaru | water_jar | 시니어 | A | 예 | 옛집 마루 |
| cb_grill_pub | black_pork_grill | barley_pub | 남성 | 둘 다 | 아니오 | 저녁 한 상 |
| cb_mulhoe_hut | haenyeo_mulhoe | haenyeo_hut | 성인 | A | 예 | 해녀의 부엌 |
| cb_tea_field_seat | tea_field | oreum_bench | 여성 | B | 예 | 녹차밭 벤치 |
| cb_pottery_gallery | pottery_studio | gallery | 성인 | 둘 다 | 예 | 공방 거리 |
| cb_pony_picking | horse_riding | picking_experience | 단체 | 둘 다 | 아니오 | 목장 체험 |
| cb_scooter_parking | scooter_rental | parking_large | 청년 | A | 아니오 | 라이더 광장 |
| cb_rooftop_palm | rooftop | palm | 청년 | A | 예 | 야자수 루프탑 |
| cb_hall_millennium | tangerine_hall | hackberry_millennium | 전체 | 둘 다 | 예 | 천년의 그늘 |
| cb_bike_scooter | bike_rack | scooter_rental | 청년 | B | 아니오 | 두 바퀴 |
| cb_stand_icecream | hallabong_stand | peanut_icecream | 청년 | 둘 다 | 아니오 | 여름 간식 골목 |
| cb_boardgame_karaoke | boardgame_room | karaoke | 청년 | A | 아니오 | 시끄러운 게임방 |

## 5. 세트 효과 (14)

### 5.1 세트
- 반경 3 안에 필요 시설이 모두 있으면 레벨 1, 필요 수의 2배면 레벨 2, 3배면 레벨 3. 효과 열의 `×1.1/1.2/1.35`는 레벨별 대상 손님층 인기 배수.
- `set_hidden_oreum_view` 완성 시 이벤트 `ev_hidden_oreum_view`(장면 창).
| id | 이름 | 필요 시설 | 대상 손님층 | 효과 |
|---|---|---|---|---|
| set_emotional_cafe | 감성 카페 | tangerine_tree 2·table_out 2·stonewall 1 | 여성 | 인기 ×1.1/1.2/1.35, 홍보 효과 +10% |
| set_village_parlor | 동네 사랑방 | bench_stonewall 2·hackberry_shade 1·vending 1 | 시니어 | 인기 ×1.1/1.2/1.35, 시니어 소지금 +20% |
| set_photo_cafe | 인생샷 카페 | dolhareubang 2·canola 2·photo_spot 1 | 청년 | 인기 ×1.1/1.2/1.35, 사진 이벤트 확률 ×2 |
| set_family_outing | 가족 나들이 | field 2·chicken_coop 1·table_big 1 | 단체 | 인기 ×1.1/1.2/1.35, 단체 체류 시간 +30% |
| set_quiet_study | 조용한 서재 | bookshelf 2·camellia 2·sofa 1 | 성인 | 인기 ×1.1/1.2/1.35, 소음 −2 |
| set_sea_cafe | 바다 카페 | palm 2·window_seat 2·haenyeo_hut 1 | 성인 | 인기 ×1.1/1.2/1.35, 외국 손님 소지금 +20% |
| set_night_garden | 밤의 정원 | stone_lantern 3·lantern_path 5·fire_pit 1 | 성인 | 인기 ×1.1/1.2/1.35, 야간 좌석 요금 +15% |
| set_health_station | 건강 스테이션 | bike_rack 2·pond 1·hammock 1 | 청년 | 인기 ×1.1/1.2/1.35, 러닝 손님 방문 +20% |
| set_hidden_oreum_view | 숨은 오름 뷰 포인트 | oreum_bench 1·observatory 1·pampas 3 | 전체 | 인기 ×1.2/1.35/1.5, 발견 이벤트 장면 창 |
| set_tangerine_farm | 감귤 농장 카페 | tangerine_tree 5·picking_experience 1·sorting_house 1 | 단체 | 인기 ×1.1/1.2/1.35, 감귤 택배 수입 +20% |
| set_makers_alley | 공방 골목 | pottery_studio 1·gallery 1·goods_shop 1 | 여성 | 인기 ×1.1/1.2/1.35, 즐길거리 이용료 +15% |
| set_dog_friendly | 강아지 환영 | dog_park 1·picnic 1·water_jar 2 | 성인 | 인기 ×1.1/1.2/1.35, 반려견 손님 만족 +20% |
| set_workation | 워케이션 | wifi_zone 1·sofa 2·handdrip_bar 1 | 청년 | 인기 ×1.1/1.2/1.35, 청년 체류 시간 +40% |
| set_legend_village | 전설의 마을 | dolhareubang_pair 1·bangsatap 1·stone_guardians 1 | 전체 | 인기 ×1.2/1.35/1.5, 전설 손님 출현 ×2 |

## 6. 관광지 (24, 4×6, Lv1~5)

### 6.1 관광지
- 투자 비용은 순서 계수(1 / 1.5 / 2 / 2.6 / 3.3 / 4) × 기본(Lv1 50만 → Lv5 500만). 매력도는 Lv1 9~44, Lv5 55~163(온천골 수치).
- Lv2에서 손님 해금(그 손님의 해금 조건 = `관광지 <id> Lv2`), Lv4에서 부탁 해금(추가 게이트), 같은 열 앞 관광지 Lv4가 다음 관광지를 연다.
- 매력도 합이 투어 버스 정원(6·12·20·30명)을 정하고, 매월 1일 투어 개최 시 단체 손님 장면 창.
| id | 이름 | 카테고리 | 순서 | Lv1 비용 | Lv2 비용 | Lv3 비용 | Lv4 비용 | Lv5 비용 | Lv1 매력도 | Lv5 매력도 | Lv2 해금 손님 | Lv4 해금 부탁 | 다음 관광지 | 해금 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| canola_field | 유채꽃밭 | 볼거리 | 1 | 500,000 | 1,000,000 | 2,000,000 | 3,500,000 | 5,000,000 | 9 | 55 | insta_traveler | q_influencer | sangumburi | 시작 |
| sangumburi | 산굼부리 | 볼거리 | 2 | 750,000 | 1,500,000 | 3,000,000 | 5,250,000 | 7,500,000 | 16 | 77 | art_student | q_village_painter | camellia_hill | 관광지 canola_field Lv4 |
| camellia_hill | 카멜리아힐 | 볼거리 | 3 | 1,000,000 | 2,000,000 | 4,000,000 | 7,000,000 | 10,000,000 | 23 | 98 | couple | q_newlyweds | seongsan | 관광지 sangumburi Lv4 |
| seongsan | 성산일출봉 | 볼거리 | 4 | 1,300,000 | 2,600,000 | 5,200,000 | 9,100,000 | 13,000,000 | 30 | 120 | group_cn | q_group_jp | bijarim | 관광지 camellia_hill Lv4 |
| bijarim | 비자림 | 볼거리 | 5 | 1,650,000 | 3,300,000 | 6,600,000 | 11,550,000 | 16,500,000 | 37 | 141 | silver_tour | q_grandma_gyecheo | manjanggul | 관광지 seongsan Lv4 |
| manjanggul | 만장굴 | 볼거리 | 6 | 2,000,000 | 4,000,000 | 8,000,000 | 14,000,000 | 20,000,000 | 44 | 163 | school_trip | q_school_teacher | — | 관광지 bijarim Lv4 |
| dongmun_market | 동문시장 | 먹거리 | 1 | 500,000 | 1,000,000 | 2,000,000 | 3,500,000 | 5,000,000 | 9 | 55 | dessert_hunter | q_coffee_geek | noodle_street | 시작 |
| noodle_street | 고기국수 거리 | 먹거리 | 2 | 750,000 | 1,500,000 | 3,000,000 | 5,250,000 | 7,500,000 | 16 | 77 | taxi_driver | q_bus_driver | black_pork_street | 관광지 dongmun_market Lv4 |
| black_pork_street | 흑돼지 거리 | 먹거리 | 3 | 1,000,000 | 2,000,000 | 4,000,000 | 7,000,000 | 10,000,000 | 23 | 98 | company_workshop | q_team_leader | haenyeo_house | 관광지 noodle_street Lv4 |
| haenyeo_house | 해녀의 집 | 먹거리 | 4 | 1,300,000 | 2,600,000 | 5,200,000 | 9,100,000 | 13,000,000 | 30 | 120 | angler | q_fishing_boat_captain | udo_peanut_village | 관광지 black_pork_street Lv4 |
| udo_peanut_village | 우도 땅콩 마을 | 먹거리 | 5 | 1,650,000 | 3,300,000 | 6,600,000 | 11,550,000 | 16,500,000 | 37 | 141 | kid_pocketmoney | q_teen_idol_fan | barley_brewery | 관광지 haenyeo_house Lv4 |
| barley_brewery | 제주 보리 양조장 | 먹거리 | 6 | 2,000,000 | 4,000,000 | 8,000,000 | 14,000,000 | 20,000,000 | 44 | 163 | golfer | q_golfer | — | 관광지 udo_peanut_village Lv4 |
| olle_trail | 올레길 | 놀거리 | 1 | 500,000 | 1,000,000 | 2,000,000 | 3,500,000 | 5,000,000 | 9 | 55 | olle_walker | q_oreum_hiker | horse_ranch | 랭크 2 |
| horse_ranch | 승마장 | 놀거리 | 2 | 750,000 | 1,500,000 | 3,000,000 | 5,250,000 | 7,500,000 | 16 | 77 | dog_walker | q_dog_camper | jungmun_surf | 관광지 olle_trail Lv4 |
| jungmun_surf | 중문 서핑 | 놀거리 | 3 | 1,000,000 | 2,000,000 | 4,000,000 | 7,000,000 | 10,000,000 | 23 | 98 | surfer | q_diver | udo_bike | 관광지 horse_ranch Lv4 |
| udo_bike | 우도 자전거 | 놀거리 | 4 | 1,300,000 | 2,600,000 | 5,200,000 | 9,100,000 | 13,000,000 | 30 | 120 | running_crew | q_trail_runner | theme_park | 관광지 jungmun_surf Lv4 |
| theme_park | 테마파크 | 놀거리 | 5 | 1,650,000 | 3,300,000 | 6,600,000 | 11,550,000 | 16,500,000 | 37 | 141 | camper | q_van_lifer | yacht_tour | 관광지 udo_bike Lv4 |
| yacht_tour | 요트 투어 | 놀거리 | 6 | 2,000,000 | 4,000,000 | 8,000,000 | 14,000,000 | 20,000,000 | 44 | 163 | resort_guest | q_resort_guest | — | 관광지 theme_park Lv4 |
| oreum | 오름 | 자연 | 1 | 500,000 | 1,000,000 | 2,000,000 | 3,500,000 | 5,000,000 | 9 | 55 | night_guest | q_stargazer | gotjawal | 랭크 3 |
| gotjawal | 곶자왈 | 자연 | 2 | 750,000 | 1,500,000 | 3,000,000 | 5,250,000 | 7,500,000 | 16 | 77 | dog_mongi | q_street_cat_noeul | hallasan | 관광지 oreum Lv4 |
| hallasan | 한라산 | 자연 | 3 | 1,000,000 | 2,000,000 | 4,000,000 | 7,000,000 | 10,000,000 | 23 | 98 | solo_foreign | q_foreign_chef | jeongbang_falls | 관광지 gotjawal Lv4 |
| jeongbang_falls | 정방폭포 | 자연 | 4 | 1,300,000 | 2,600,000 | 5,200,000 | 9,100,000 | 13,000,000 | 30 | 120 | cafe_tourer | q_ribbon_judge | yongmeori_coast | 관광지 hallasan Lv4 |
| yongmeori_coast | 용머리해안 | 자연 | 5 | 1,650,000 | 3,300,000 | 6,600,000 | 11,550,000 | 16,500,000 | 37 | 141 | dolhareubang_spirit | q_yeongdeung | baengnokdam | 관광지 jeongbang_falls Lv4 |
| baengnokdam | 백록담 | 자연 | 6 | 2,000,000 | 4,000,000 | 8,000,000 | 14,000,000 | 20,000,000 | 44 | 163 | hallasan_spirit | q_hallasan_spirit | — | 관광지 yongmeori_coast Lv4 |

## 7. 직원 (27)

### 7.1 직원 풀
- 스탯 체력/힘/기술/미소(초기치), 상한은 네 스탯 공통. 급여는 월(원). 채용 단계는 이 직원이 후보로 나오는 최소 단계(§8).
- 특수 직원: `st_pony_special`은 `pony_doll` 보유 시, `st_dolhareubang`은 리본 서베이 1위 후 대학 취업설명회에서만 등장.
- 월급 인상 = 스탯 합 × 300 + 레벨 × 50,000(v1 공식 ×100은 급여 열의 값과 겹치므로 급여 열이 우선).

| id | 이름 | 배경 한 줄 | 체력 | 힘 | 기술 | 미소 | 상한 | 최대 레벨 | 급여 | 채용 단계 | 특수 여부 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| st_kim_minjun | 김민준 | 농고 졸업, 밭일이 취미 | 30 | 25 | 10 | 15 | 60 | 5 | 400,000 | 1 | 아니오 |
| st_lee_seoyeon | 이서연 | 사진 찍는 걸 좋아하는 동네 청년 | 15 | 10 | 20 | 30 | 60 | 5 | 450,000 | 1 | 아니오 |
| st_park_doyun | 박도윤 | 집밥 장인 어머니 밑에서 배움 | 20 | 15 | 30 | 12 | 60 | 5 | 450,000 | 1 | 아니오 |
| st_kang_siwoo | 강시우 | 힘 하나는 마을 최고 | 35 | 40 | 5 | 10 | 65 | 5 | 500,000 | 1 | 아니오 |
| st_jang_yejun | 장예준 | 제주 토박이, 삼춘들과 친함 | 25 | 20 | 12 | 28 | 65 | 6 | 500,000 | 1 | 아니오 |
| st_jeong_haeun | 정하은 | 뭐든 성실하게 하는 타입 | 22 | 22 | 22 | 22 | 70 | 6 | 550,000 | 2 | 아니오 |
| st_yoon_jia | 윤지아 | 디저트 애호가, 케이크 연구 중 | 18 | 12 | 35 | 25 | 70 | 6 | 650,000 | 2 | 아니오 |
| st_han_jiho | 한지호 | 손이 빠른 육지 출신 알바왕 | 35 | 30 | 30 | 30 | 75 | 7 | 800,000 | 2 | 아니오 |
| st_oh_sua | 오수아 | 육지에서 온 파티시에 | 25 | 20 | 50 | 30 | 80 | 7 | 950,000 | 2 | 아니오 |
| st_seo_junseo | 서준서 | 커피 장인, 원산지까지 외움 | 28 | 22 | 55 | 28 | 80 | 7 | 950,000 | 2 | 아니오 |
| st_shin_yuna | 신유나 | 웃는 얼굴이 동네 인기인 | 30 | 20 | 25 | 55 | 80 | 7 | 900,000 | 3 | 아니오 |
| st_kwon_dohyun | 권도현 | 곶자왈 채집꾼 기질, 운이 좋음 | 45 | 40 | 25 | 25 | 80 | 7 | 850,000 | 3 | 아니오 |
| st_hwang_harin | 황하린 | 연구광, 메뉴 개발이 취미 | 30 | 25 | 45 | 35 | 85 | 8 | 1,000,000 | 3 | 아니오 |
| st_song_jimin | 송지민 | 외국어 세 개, 외국 손님 담당 | 30 | 25 | 35 | 50 | 85 | 8 | 1,000,000 | 3 | 아니오 |
| st_ryu_siyun | 류시윤 | 식사 장인, 국수 한 그릇에 진심 | 35 | 35 | 55 | 25 | 85 | 8 | 1,050,000 | 3 | 아니오 |
| st_go_hyunwoo | 고현우 | 전직 통역사 | 45 | 40 | 55 | 70 | 90 | 9 | 1,400,000 | 4 | 아니오 |
| st_moon_naeun | 문나은 | 큰 식당 출신 요리사 | 50 | 45 | 80 | 55 | 95 | 9 | 1,700,000 | 4 | 아니오 |
| st_yang_junhyuk | 양준혁 | 바리스타 대회 우승자 | 50 | 45 | 85 | 55 | 95 | 9 | 1,700,000 | 4 | 아니오 |
| st_son_yerin | 손예린 | 접객의 신, 손님이 먼저 알아봄 | 55 | 40 | 55 | 85 | 95 | 9 | 1,650,000 | 4 | 아니오 |
| st_bae_jihun | 배지훈 | 철인 3종 출신, 지치지 않음 | 90 | 80 | 40 | 45 | 95 | 9 | 1,500,000 | 4 | 아니오 |
| st_baek_soyul | 백소율 | 뭐든 잘하는 만능 | 65 | 60 | 65 | 65 | 100 | 10 | 1,900,000 | 5 | 아니오 |
| st_heo_taeyang | 허태양 | 로스팅 마스터 | 55 | 50 | 85 | 50 | 100 | 10 | 1,900,000 | 5 | 아니오 |
| st_sim_arin | 심아린 | 제주 향토 요리 연구가 | 55 | 50 | 80 | 60 | 100 | 10 | 2,000,000 | 5 | 아니오 |
| st_retired_haenyeo | 고순덕 | 은퇴한 해녀, 바다 재료에 밝음 | 80 | 70 | 50 | 60 | 100 | 10 | 1,600,000 | 5 | 아니오 |
| st_nam_jiwon | 남지원 | 팔로워 많은 홍보 담당 | 50 | 40 | 55 | 80 | 100 | 10 | 2,200,000 | 5 | 아니오 |
| st_pony_special | 조랑말 알바 | 조랑말 인형을 얻으면 나타나는 수수께끼 알바 | 99 | 99 | 60 | 99 | 120 | 12 | 1,000,000 | 5 | 예 |
| st_dolhareubang | 돌하르방 | 전설의 알바, 3천 년 경력 | 99 | 99 | 99 | 99 | 120 | 12 | 2,200,000 | 5 | 예 |

## 8. 채용 5단계

### 8.1 채용
| id | 이름 | 비용 | 후보 수 | 스탯 범위 | 해금 이벤트 |
|---|---|---|---|---|---|
| rc_local_flyer | 동네 알바 구인 | 500,000 | 3 | 10~40 | 시작 |
| rc_job_app | 구인 앱 공고 | 5,000,000 | 3 | 20~60 | 랭크 3 |
| rc_youth_center | 제주 청년 일자리센터 | 8,000,000 | 4 | 30~70 | ★2 |
| rc_intern | 인턴 모집 | 20,000,000 | 4 | 45~85 | 부탁 q_roe_deer |
| rc_job_fair | 대학 취업설명회 | 50,000,000 | 5 | 60~99 | 부탁 q_crow_flock·★4 |

## 9. 유니폼 (5)

### 9.1 유니폼
- 응모권 추첨 특별상 단계(1→5 순서로 당첨). 파츠 열은 `parts` 시스템의 `top`/`acc` id.

| id | 이름 | 응모권 단계 | 효과 | 파츠 |
|---|---|---|---|---|
| uf_hawaiian | 하와이안 셔츠 | 1 | 여름 손님 만족 +5% | top: hawaiian |
| uf_galot | 갈옷 | 2 | 시니어 손님 만족 +8%, 기력 소모 −10% | top: galot |
| uf_haenyeo | 해녀복 | 3 | 먹거리 시설 요금 +5%, 힘 +5 | top: haenyeo·acc: goggles |
| uf_dialect_tee | 제주 방언 티셔츠 | 4 | 전체 손님 대사 확률 +10%, 미소 +5 | top: dialect_tee |
| uf_santa | 산타복 | 5 | 12월 손님 소지금 +20%, 응모권 드롭 +5% | top: santa·acc: santa_hat |

## 10. 아이템·상점

### 10.1 강화 아이템 (20)
- 같은 종류 시설 전체에 적용. "잘 맞는 시설"에 배치하면 효과 2배(마스터 §6 매트릭스 3 = 잘 맞는 시설, 1 = 그 외 같은 카테고리, 0 = 다른 카테고리).
| id | 이름 | 획득처 | 잘 맞는 시설 | 효과 |
|---|---|---|---|---|
| jeju_salt | 제주 소금 | 부탁 q_village_head·마일리지 상점 | noodle_shop·bomal_kalguksu·haenyeo_mulhoe | 인기 +5 |
| bean_sample | 원두 샘플 | 부탁 q_coffee_geek·응모권 추첨 | handdrip_bar·counter·roaster | 가격 +5 |
| tangerine_syrup | 감귤 청 | syrup_class 체험 보상 | hallabong_stand·tart_bakery·syrup_class | 인기 +5 |
| conch_shell | 소라 장식 | 부탁 q_diver·부탁 q_angler | terrace_seat·window_seat·haenyeo_mulhoe | 인기 +3 |
| galot_cushion | 갈옷 방석 | 부탁 q_local_auntie | bench_stonewall·toenmaru·table_in | 인기 +5 |
| oreum_poster | 오름 사진 포스터 | 부탁 q_village_painter | oreum_bench·gallery·wifi_zone | 인기 +5 |
| comic_book | 만화책 | 마일리지 상점 | bookshelf·boardgame_room·sofa | 인기 +10 |
| lp_record | LP판 | 응모권 추첨 | sofa·handdrip_bar·barley_pub | 가격 +5 |
| dolhareubang_mini | 돌하르방 미니어처 | 부탁 q_dolhareubang_spirit·응모권 추첨 | souvenir·photo_spot·goods_shop | 인기 +5 |
| sneakers | 운동화 | 응모권 추첨 | bike_rack·scooter_rental·picnic | 인기 +3 |
| glasses | 안경 | 마일리지 상점 | bookshelf·wifi_zone·gallery | 가격 +3 |
| folk_scroll | 족자(제주 민화) | 응모권 추첨 | gallery·toenmaru·pottery_studio | 인기 +5 |
| tv | TV | 마일리지 상점 | staff_room·karaoke·table_big | 인기 +5 |
| pottery_jar | 도자기 항아리 | 부탁 q_potter | pottery_studio·handdrip_bar·tea_field | 가격 +10 |
| gold_leaf | 금박 | 부탁 q_world_traveler·응모권 추첨 | tart_bakery·tangerine_hall·rooftop | 가격 +10 |
| jeju_tea_set | 제주 차 세트 | 마일리지 상점 | tea_field·sofa·greenhouse_seat | 인기 +5 |
| honey | 꿀 | beehive·부탁 q_dog_mongi | vending·jam_workshop·hallabong_stand | 인기 +5 |
| flower_poster | 꽃밭 포스터 | 응모권 추첨 | window_seat·photo_spot·snap_studio | 인기 +5 |
| lantern | 초롱 | 부탁 q_lighthouse_keeper·응모권 추첨 | stone_lantern·lantern_path·fire_pit | 인기 +10 |
| seaweed_fertilizer | 해초 비료 | 부탁 q_haenyeo·haenyeo_hut | field·tangerine_tree·tea_field | 인기 +10 |

### 10.2 특수 아이템 (12)
- 해금·씨앗·부적류. 씨앗은 상한(인기 40·경관 30·요금 +30%)까지만.
| id | 이름 | 획득처 | 효과 |
|---|---|---|---|
| pony_doll | 제주 조랑말 인형 | 부탁 q_jeju_pony | 특수 직원 st_pony_special 해금 |
| millennium_seed | 천년 팽나무 씨앗 | 부탁 q_seolmundae·100주년 감귤축제 | hackberry_millennium 건설 가능 |
| deer_bell | 노루 방울 | 부탁 q_roe_deer | 노루 습격 확률 −50% |
| tangerine_seed | 감귤 씨앗(인기 씨앗) | 마일리지 상점·부탁 q_jacheongbi | 시설 1개 인기 +5(상한 40) |
| hallabong_seed | 한라봉 씨앗(가격 씨앗) | 마일리지 상점·부탁 q_hallabong_grandpa | 시설 1개 요금 +5%(상한 +30%) |
| scenery_seed | 경관 씨앗 | 응모권 상점 | 경관물 1개 경관 +3(상한 30) |
| popularity_fruit | 인기 열매 | 응모권 상점 | 손님 1종 인기 +10 |
| wind_charm | 영등 바람 부적 | 부탁 q_yeongdeung | 태풍 피해 −50% |
| white_deer_bell | 백록 방울 | 부탁 q_baekrok | 전설 손님 출현 ×2 |
| snow_charm | 한라산 눈 부적 | 부탁 q_hallasan_spirit | 겨울 손님 ×1.2 |
| pickaxe | 돌담 철거 곡괭이 | 마일리지 상점 | 기본 돌담 1칸 철거 |
| worker_hire | 일꾼 삼춘 고용권 | 마일리지 상점 | 동시 건설 수 +1 |

### 10.3 마일리지 상점 (14)
- 마일리지 획득: 부탁 완료 1, 가이드북 1위 2~5, 도감 10개마다 1, 희귀 손님 만족 2, 유명 셰프 암행 성공 3, **월 결산 손님 300명마다 1**(QA 1차 #11).
- 가격은 QA 1차 #11에서 1/10로 내렸다(1년 반 플레이에 마일리지 0이라 상점이 잠겨 있었다). 최저 1.
| id | 품목 | 가격 | 설명 |
|---|---|---|---|
| ms_worker_3 | 일꾼 삼춘 고용(3번째) | 3 | 동시에 지을 수 있는 시설 +1 |
| ms_worker_4 | 일꾼 삼춘 고용(4번째) | 8 | 동시에 지을 수 있는 시설 +1 |
| ms_worker_5 | 일꾼 삼춘 고용(5번째) | 14 | 동시에 지을 수 있는 시설 +1 |
| ms_pickaxe | 돌담 철거 곡괭이 | 2 | 부지에 원래 있던 돌담을 1칸 없애요 |
| ms_ticket | 응모권 | 1 | 응모권 추첨 1회 |
| ms_tangerine_seed | 감귤 씨앗 | 1 | 시설 인기 +5 |
| ms_hallabong_seed | 한라봉 씨앗 | 1 | 시설 요금 +5% |
| ms_seed_pack | 씨앗 5개 묶음팩 | 4 | 감귤 씨앗 3 + 한라봉 씨앗 2 |
| ms_jeju_tea_set | 제주 차 세트 | 1 | 강화 아이템 |
| ms_comic_book | 만화책 | 1 | 강화 아이템 |
| ms_glasses | 안경 | 1 | 강화 아이템 |
| ms_tv | TV | 1 | 강화 아이템 |
| ms_jeju_salt | 제주 소금 | 1 | 강화 아이템 |
| ms_scout | 직원 스카우트권 | 2 | 다음 채용 비용 무료 |

### 10.4 응모권 상점 (8)
- 응모권 획득: 손님 효과 `응모권`, 부탁 보상, 마일리지 상점. 추첨은 인형뽑기 연출(꽝 없음, 참가상 보장).
| id | 품목 | 가격 | 설명 |
|---|---|---|---|
| ts_uniform_1 | 하와이안 셔츠 | 3 | 유니폼 1단계 |
| ts_uniform_2 | 갈옷 | 6 | 유니폼 2단계 |
| ts_uniform_3 | 해녀복 | 10 | 유니폼 3단계 |
| ts_uniform_4 | 제주 방언 티셔츠 | 15 | 유니폼 4단계 |
| ts_uniform_5 | 산타복 | 25 | 유니폼 5단계 |
| ts_scenery_seed | 경관 씨앗 | 4 | 경관물 경관 +3 |
| ts_popularity_fruit | 인기 열매 | 5 | 손님 1종 인기 +10 |
| ts_draw | 응모권 추첨(인형뽑기) | 1 | 특별상(유니폼)·1등(강화 아이템)·2등(씨앗)·3등(마일리지 1)·참가상(재료 상자) 5/10/25/30/30 |

## 11. 가이드북 (11)

### 11.1 가이드북
- ★ 등급은 가이드북 1위 누적으로 오른다(★1 친절 카페 1위, ★2 동네 맛집 지도 1위, ★3 제주도 카페 지도 1위, ★4 전국 카페 투어 1위, ★5 리본 서베이 1위). 발표 연 2회(3월·9월) + 농협 추천은 매월.
- 해금 열의 `먹거리 5개`·`쉼 8개`·`즐길거리 5개`는 해당 카테고리 시설 수(스키마 `count`의 카테고리 확장).
| id | 이름 | 해금 | 심사 기준 | 1위 상금 | 연구 | 씨앗 |
|---|---|---|---|---|---|---|
| gb_kind_cafe | 친절 카페 | 시작 | 미소·서비스 | 100,000 | 100 | — |
| gb_local_map | 동네 맛집 지도 | 1년 7월 | 종합 | 300,000 | 300 | tangerine_seed 1 |
| gb_jeju_map | 제주도 카페 지도 | 랭크 5 | 종합 | 1,000,000 | 800 | tangerine_seed 2 |
| gb_insta_100 | 인스타 핫플 100 | 손님 insta_traveler 인기 30 | 경관·포토존 | 1,500,000 | 1,000 | scenery_seed 2 |
| gb_dessert | 미식 카페(디저트) | 먹거리 5개 | 메뉴 품질 | 2,000,000 | 1,500 | hallabong_seed 2 |
| gb_healing | 힐링 카페 | 쉼 8개 | 경관·조용함 | 2,000,000 | 1,500 | scenery_seed 3 |
| gb_activity | 액티비티 카페 | 즐길거리 5개 | 체험 인기 | 2,500,000 | 2,000 | tangerine_seed 3 |
| gb_together | 함께 가기 좋은 카페 | 손님 rentcar_family 인기 40 | 큰 좌석·주차 | 3,000,000 | 2,500 | tangerine_seed 3 |
| gb_coop_monthly | 이번 달 농협 추천 카페 | 랭크 8 | 매회 타깃 손님층 변동 | 500,000 | 500 | popularity_fruit 1 |
| gb_national_tour | 전국 카페 투어 | ★3 | 종합 | 5,000,000 | 5,000 | hallabong_seed 5 |
| gb_ribbon_survey | 리본 서베이 | ★4 | 종합 최상 | 10,000,000 | 10,000 | scenery_seed 5·popularity_fruit 3 |

## 12. 이벤트 (42)

### 12.1 이벤트
- 확률은 월(또는 표시 기간) 발생 확률. `100%`는 조건 충족 시 확정. 효과는 `조건 → 결과`.
| id | 이름 | 계절/월 | 확률 | 조건 | 효과 | 대사 |
|---|---|---|---|---|---|---|
| ev_typhoon_alert | 태풍 경보 | 7~9월 | 30% | — | 다음 달 태풍 → 방풍 안 된 작물 소실, 시설 2개 일시 파손(유지비 ×2 한 달), bangsatap 있으면 피해 −30% | 바람이 심상치 않우다. 돌담 잘 살펴봅서. |
| ev_flight_cancel | 비행기 결항 | 7~9월·12~1월 | 12% | — | 태풍·폭설 → 3일간 육지 손님 0 | 오늘 비행기 다 결항이래요. |
| ev_rentcar_rush | 렌터카 대란 | 5월·7~8월 | 25% | — | 연휴 → 주차장 없으면 가족·단체 이탈 50%, 있으면 방문 ×1.5 | 주차 자리 있어요? 없으면 그냥 갈게요. |
| ev_roe_deer_raid | 노루 감귤밭 습격 | 10~12월 | 8% | tangerine_tree 3개 | 방풍 안 된 감귤나무 1그루 수확 0, deer_bell 있으면 −50% | 노루가 귤을 다 따 먹었수다! |
| ev_magpie_thief | 까치 감귤 도둑 | 11~1월 | 10% | tangerine_tree 5개 | 수확 −20%, 삼나무 4개 이상이면 무효 | 까치가 제일 맛있는 귤만 골라 먹어요. |
| ev_crow_flock | 까마귀 떼 | 봄·가을 | 8% | field 3개 | 밭 1곳 수확 −50%, 돌하르방 3개면 무효 | 까마귀가 밭을 뒤집어 놨수다. |
| ev_haenyeo_gift | 해녀 삼춘 물질 선물 | 여름·가을 | 10% | 손님 haenyeo 인기 30 | 해산물 재료 상자 → 소라·전복·톳 | 오늘 물질 잘 됐주. 이거 먹어 봅서. |
| ev_village_meeting | 마을 반상회 요청 | 매월 | 6% | 손님 village_head 인기 30 | 수락 → 하루 영업 −50%, 삼춘 손님 전원 인기 +5 | 반상회 장소로 카페 좀 빌립주. |
| ev_farm_grant_review | 귀농 지원금 심사 | 3월·9월 | 100% | 잔고 < 400,000 | 정착지원금 3,000,000 지급(게임당 1회) | 정착지원금 심사 통과했습니다! |
| ev_insta_viral | 인스타 바이럴 | 매월 | 4% | 손님 insta_traveler 인기 40 | 3일간 손님 ×2, 웨이팅 줄 발생, 좌석 부족 시 만족 −10% | 여기 지금 난리 났대요! |
| ev_tv_shoot | 방송 촬영 요청 | 매월 | 3% | ★2 | 수락 → 자금 −2,000,000, 다음 달 전 손님 인기 +10 | 촬영 협조 부탁드립니다. |
| ev_centennial_festival | 100주년 감귤축제 | 11월 | 100% | 16년차 이상·★5 | 연장 플레이 엔드게임 → millennium_seed, 마을 전체 손님 ×3 한 달 | 감귤 백 년, 카페 백 년! |
| ev_first_snow | 첫눈 | 12월 | 60% | — | 등산객·한라산 손님 ×2 3일, 도로 결빙 1일 손님 0 | 한라산에 첫눈 왔댄! |
| ev_canola_bloom | 유채꽃 개화 | 3월 | 100% | canola 5개 | 관광객 ×3 한 달, 소음 +2 | 온 밭이 노랗수다. |
| ev_hydrangea_bloom | 수국 만개 | 6월 | 100% | hydrangea 5개 | 여성 손님 ×2 한 달 | 수국이 파랗게 폈어요. |
| ev_pampas_wave | 억새 물결 | 10월 | 100% | pampas 5개 | 사진 이벤트 ×2 한 달 | 억새가 은빛으로 흔들려요. |
| ev_camellia_fall | 동백 낙화 | 1월 | 100% | camellia 5개 | 시니어·커플 손님 ×1.5 한 달 | 동백이 툭툭 떨어지는 계절이우다. |
| ev_tangerine_delivery | 감귤 택배 시즌 | 11~1월 | 100% | tangerine_tree 수확 | 감귤 1개당 1,500 부수입, sorting_house 있으면 ×1.5 | 택배 상자 접는 손이 바빠요. |
| ev_tangerine_bumper | 감귤 풍년 | 11월 | 20% | tangerine_tree 5개 | 수확 ×1.5 | 올해 귤은 유난히 달아. |
| ev_tangerine_poor | 감귤 흉년 | 11월 | 10% | — | 수확 ×0.6 | 올해는 귤이 영 시원찮아. |
| ev_stray_cat | 길고양이 | 매월 | 5% | — | 길고양이 노을 등장 → cat_house 해금 힌트 | 냐옹. |
| ev_warehouse_dig | 폐창고 발굴 | 매월 | 30% | 버튼 1회 | 경관물 랜덤 1개 | 창고 구석에서 뭔가 나왔어요! |
| ev_field_coin | 밭 갈다 동전 | 밭 조성 시 | 5% | — | 자금 300,000 또는 도자기 조각(경관 +2) | 밭에서 옛날 동전이 나왔수다. |
| ev_olle_group | 올레꾼 단체 | 봄·가을 | 4% | 관광지 olle_trail Lv2 | 20명 순차 방문 | 올레 7코스 팀입니다! |
| ev_bus_breakdown | 관광버스 고장 | 매월 | 3% | parking_large 1개 | 단체 6명 3시간 체류(매출 ↑, 좌석 압박) | 버스 고칠 동안 여기서 기다려도 될까요? |
| ev_foreign_vlogger | 외국 브이로거 촬영 | 매월 | 2% | ★3 | 시그니처 촬영 → 외국 손님 인기 +15 | Hello Jeju! |
| ev_secret_chef | 유명 셰프 암행 | 매월 | 2% | 메뉴 20개 | 식사 메뉴 품질 평가 → 성공 시 마일리지 3 | … 잘 먹었습니다. |
| ev_kimchi_gift | 삼춘 김치 선물 | 11~12월 | 10% | 손님 local_auntie 인기 40 | 재료 상자 | 김장했주. 한 통 가져가. |
| ev_blackout | 정전 | 매월 | 2% | — | 하루 조리 불가 | 아이고, 전기가 나갔수다. |
| ev_water_cut | 단수 | 여름 | 2% | pond 없음 | 음료 하루 불가 | 물이 안 나와요! |
| ev_bee_swarm | 벌 떼 | 5~6월 | 4% | beehive 1개 | 꿀 ×3 또는 손님 만족 −10(50/50) | 벌들이 신났수다. |
| ev_lunar_group | 춘절 단체 | 1~2월 | 100% | 손님 group_cn 해금 | 단체 ×2 | 新年快乐! |
| ev_golden_week | 황금연휴 | 5월 | 100% | — | 전체 손님 ×1.5 | 연휴라 사람이 바글바글해요. |
| ev_summer_vacation | 여름 휴가 | 7~8월 | 100% | — | 가족·러닝 손님 ×1.5 | 방학이다! |
| ev_monsoon | 장마 | 6월 | 100% | — | 손님 −20%, 실내 좌석 인기 +5 | 비가 열흘째 오고 있어요. |
| ev_hidden_oreum_view | 숨은 오름 뷰 포인트 발견 | 매월 | 100% | 세트 set_hidden_oreum_view 완성 | 장면 창 → 범위 좌석 요금 +20% 영구 | 여기서 오름이 이렇게 보였구나! |
| ev_rival_open | 라이벌 카페 개점 | 매월 | 10% | 3년차 이상 | 근처 라이벌 → 관광객 −20% 3개월, 가이드북 1위로 철수 | 옆 동네에 카페가 또 생겼대. |
| ev_staff_wedding | 직원 결혼 | 매월 | 1% | 직원 Lv5 이상 | 한 달 휴가, 복귀 시 스탯 +5 | 저 결혼해요! |
| ev_staff_scout | 직원 스카우트 제안 | 매월 | 2% | 직원 Lv7 이상 | 급여 +30% 제안하면 잔류 | 다른 데서 오라는데요… |
| ev_governor_visit | 도지사 방문 | 매월 | 1% | ★4 | 성공 시 부지 확장 50% 할인 | 귀농 성공 사례로 소개하겠습니다. |
| ev_yeongdeung_wind | 영등굿 바람 | 2월 | 100% | — | 바람 2배, 방풍 없는 작물 −20%, 해녀 손님 ×2 | 영등할망 오시는 달이우다. |
| ev_weekend_popup | 주말 팝업 | 매주 토 | 100% | 랭크 2 | 주말 팝업 장소 선택 → 지역 손님 방문 | 이번 주말은 어디로 갈까? |

## 13. 경관 계절 보너스 (12)

### 13.1 경관물
- 값은 §1.1 계절 보너스 열과 동일. 계절 값은 기본 경관에 더한다(상한 30).
| id | 이름 | 기본 경관 | 봄 | 여름 | 가을 | 겨울 |
|---|---|---|---|---|---|---|
| canola | 유채 | 2 | 12 | 0 | 0 | 0 |
| hydrangea | 수국 | 3 | 0 | 9 | 0 | 0 |
| pampas | 억새 | 2 | 0 | 0 | 9 | 0 |
| camellia | 동백 | 3 | 0 | 0 | 0 | 11 |
| palm | 야자수 | 5 | 0 | 3 | 0 | 0 |
| cedar | 삼나무 | 8 | 0 | 0 | 0 | 2 |
| stonewall | 현무암 돌담 | 4 | 0 | 0 | 0 | 0 |
| dolhareubang | 돌하르방 | 3 | 0 | 0 | 0 | 0 |
| water_jar | 물허벅 | 3 | 0 | 0 | 0 | 0 |
| stone_lantern | 석등 | 3 | 0 | 0 | 0 | 0 |
| pond | 연못 | 12 | 0 | 18 | 0 | 0 |
| hackberry_millennium | 천년 팽나무 | 30 | 0 | 10 | 0 | 0 |

## 14. 참조

### 14.1 추가 메뉴 id (15)
- §3 부탁의 `menuSold` 파라미터가 쓰는 메뉴 중 `src/data/menus.json`에 없는 것. v1 §7 히든 레시피 10 + 먹거리 시설 전용 메뉴 5. 필요 시설이 `—`면 히든 레시피(도감 ???).
| id | 이름 | 베이스 | 가격 | 필요 시설 | 재료 |
|---|---|---|---|---|---|
| tangerine_tart | 감귤 타르트 | 디저트 | 6,500 | tart_bakery | tangerine·flour·butter·egg |
| meat_noodle | 고기국수 | 식사 | 8,000 | noodle_shop | pork_black·flour·garlic |
| bomal_kalguksu | 보말칼국수 | 식사 | 8,000 | bomal_kalguksu | seaweed·flour·garlic |
| omegi_rice_cake | 오메기떡 | 디저트 | 3,000 | omegi_stall | rice·sugar·honey |
| peanut_icecream | 우도 땅콩 아이스크림 | 디저트 | 4,000 | peanut_icecream | peanut·milk·cream |
| hallabong_ade | 한라봉 에이드 | 음료 | 4,500 | hallabong_stand | hallabong·ice·honey |
| matcha_latte | 제주 말차 라떼 | 음료 | 5,500 | — | tea_jeju·milk_jeju·honey |
| tangerine_cheesecake | 감귤 치즈케이크 | 디저트 | 6,000 | — | tangerine·cheese·flour·egg |
| peanut_cream_latte | 우도 땅콩 크림 라떼 | 음료 | 5,500 | — | peanut·cream·beans |
| seaweed_croissant | 톳 크루아상 | 디저트 | 4,500 | — | seaweed·flour·butter |
| black_pork_sandwich | 흑돼지 샌드위치 | 식사 | 7,000 | — | pork_black·flour·carrot |
| gosari_pasta | 고사리 파스타 | 식사 | 7,000 | — | gosari·flour·garlic·mushroom |
| spring_coldbrew | 용천수 콜드브루 | 음료 | 5,000 | — | water_spring·beans_roast·ice |
| canola_pancake | 유채꽃 팬케이크 | 디저트 | 5,500 | — | canola_flower·flour·egg·honey |
| abalone_porridge | 전복 죽 | 식사 | 9,000 | — | abalone·rice·seaweed |
