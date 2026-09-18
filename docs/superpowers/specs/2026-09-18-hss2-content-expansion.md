# HSS2 기반 컨텐츠 대규모 확장 스펙 (제주 카페 이야기 v3-content)

작성일: 2026-09-18. 사용자 요구: "위키 잘 참고해서 할 수 있을 만한 컨텐츠 대규모 업데이트" + "난이도가 너무 쉽지 않게".
원본: 온천골 이야기 2(Hot Springs Story 2, 이하 HSS2) 위키 8페이지(§1). 전제: `2026-09-18-v3-overhaul.md`(목표 체인·기능 잠금·밭 폐지·농원·빅 이벤트·셸)이 확정된 상태에서 **그 위에 얹는 컨텐츠 스펙**이다. v3 스펙과 충돌하면 v3 스펙이 이기고, GDD v2 표(`2026-09-17-gdd-v2-tables.md`)와 충돌하면 이 문서가 이긴다.

표기 규칙: 금액은 원(₩). HSS2의 1G = 100원. 손님층 태그 = `all / female / male / youth / adult / senior / group`. 시설 id는 `src/data/generated/v2/facilities.json`의 id, 새 시설은 §3.2에서 정의. 실명·실브랜드·카이로 IP 명칭 금지, 술 금지(HSS2의 펍·맥주 → 보리 음료), 도박 순화(파친코 → 구슬 게임기), 초중생 어휘.

---

## 1. HSS2 원본 요약 (위키 8페이지)

읽은 페이지: Combos / Facilities / Items / Tourism / Targets / Staff / Guides (kairosoft.wiki.gg) + Hot Springs Story 2 개요(fandom). 보조로 같은 위키의 Manual(How to Play 37장)·Tips 페이지를 참조(이전 세션에 색인된 것).

### 1.0 게임 기본 규칙 (fandom 개요 + Manual 요약)

| 항목 | HSS2 값 |
|---|---|
| 화폐 | G |
| 비상금(Emergency Fund) | 30,000G (잔고 부족 시 1회 지원) |
| 게임 "종료" | 10년차 3월 말 — 점수 저장, 이후 계속 플레이 가능, 빠른 모드 해금 |
| 손님 점수 4항목 | Relaxation(쉼) / Entertainment(즐길거리) / Food(먹거리) / Utilities(편의) — 시설 카테고리와 1:1 |
| 시설 스탯 | Popularity(인기, 씨앗 상한 40) / Scenery(경관, 씨앗 상한 30) / Price(요금) / Research Pts 발생 여부 |
| 콤보 판정 | 특정 2시설이 **2칸 이내**(가로·세로·대각) → 한쪽 또는 양쪽 시설의 특정 손님층 적합도 상승. 같은 콤보 여러 번 가능, 한 시설이 여러 콤보에 동시 참여 가능 |
| 목욕 효과(Bath Effects) | 특정 시설 3~4개가 탕 근처에 있으면 탕에 특수 효과(손님층 지정). 확장 시 "온천 원천 발견" 가능 |
| 동시 건설 수 | 목수 수(초기 2, 마일리지 상점에서 30/81/138메달로 추가) |
| 동종 건설비 상승 | 같은 종류를 많이 지을수록 건설비 상승 |
| 리조트 스탯 | Rank(시설·경관·인기·부탁 완료로 상승) / Stamina(직원 총 체력) / Dirt(더러움 — 손님 감소·불만족, 직원 청소로 해결) |
| 직원 스탯 4 | Energy(체력: 지속 근무·속도) / Strength(힘: 이불 운반·야생동물 쫓기) / Tech(기술: 청소 효율·연구 포인트) / Smile(미소: 손님 기분·요구 만족) |
| 휴게실 | 휴게실 1개당 직원 3명 추가 고용 가능 |
| 요리 | 레시피 발견 → 주방 건설 → 식음 시설의 메뉴 수·품질 상승 |
| 홍보 | 직원이 광고 활동 → 인기 상승, 체력 소모 |
| 관광 명소 | 부탁 완료로 개방. Appeal(매력) 높을수록 관광객↑. Visitors(방문객) 일정 수 도달 시 상품. 투어 버스(셔틀) 설치 시 방문객↑·계절별 숙박객↑. 투어 그룹(단체 숙박 부탁): 매력·적합도 높은 명소를 고르면 점수↑ |
| 랭킹 | 매년 말 전국 4대 리조트 발표(시설·환대 등 종합) → 상금 + 별(★) |
| 투자 | 투자 → 새 타깃·아이템·시설 해금, 특별 손님 초대 |
| 다이아 | 마일리지(메달)로 교환, 새 게임에서 재수집 |

### 1.1 Combos (콤보) — 페어 55 + 목욕 효과 10

열: `Facility 1 | Facility 2 | Effect`. Effect는 "적용 시설(한쪽/양쪽): 손님층". "Room"은 Tatami Room 또는 Western Room.

| # | 시설 1 | 시설 2 | 효과 |
|---|---|---|---|
| 1 | Room | Restroom | Room: All |
| 2 | Room | Home Theater | Room: All |
| 3 | Room | Auditorium | Room: All |
| 4 | Room | Pachinko Mchn | Room: All |
| 5 | Room | Arcade | Room: All |
| 6 | Room | Karaoke Room | Room: All |
| 7 | Room | Bowling Alley | Room: All |
| 8 | Room | Rest Stop | Room: All |
| 9 | Room | Linen Room | Room: All |
| 10 | Tatami Room | Tatami Room | Tatami Room: All |
| 11 | Western Room | Western Room | Western Room: All |
| 12 | Salon | Yoga Studio | Both: Women |
| 13 | Yoga Studio | Sports Gym | Both: Women |
| 14 | Lounge | Gallery | Lounge: Adults, Seniors |
| 15 | Lounge | Gumball Machine | Lounge: Youth |
| 16 | Lounge | Computer Room | Lounge: Youth, Adults |
| 17 | Restaurant | Ramen Stall | Both: All |
| 18 | Modern Restaurant | Cafe | Both: All |
| 19 | Coffee Shop | Rest Stop | Both: All |
| 20 | Coffee Shop | Tea Room | Both: Seniors |
| 21 | Coffee Shop | Reading Room | Both: All |
| 22 | Cafe | Fortuneteller | Both: All |
| 23 | Cafe | Auditorium | Both: All |
| 24 | Souvenir Stnd | Gumball Machine | Both: Youth |
| 25 | Souvenir Stnd | Sushi Restaurant | Souvenir Stnd: All |
| 26 | Rest Stop | Gallery | Both: Adults, Seniors |
| 27 | Rest Stop | Sports Gym | Both: All |
| 28 | Rest Stop | Hot Spring Bath | Both: All |
| 29 | Rest Stop | Restroom | Rest Stop: All |
| 30 | Gallery | Ceramics Workshop | Both: All |
| 31 | Gallery | Bowling Alley | Gallery: All |
| 32 | Tea Room | Flower Workshop | Both: Women |
| 33 | Pachinko Mchn | Fortuneteller | Pachinko Mchn: Men |
| 34 | Pachinko Mchn | ATM | Pachinko Mchn: All |
| 35 | Boutique | Flower Workshop | Boutique: Women |
| 36 | Boutique | Tea Room | Boutique: Women |
| 37 | Auditorium | Karaoke Room | Auditorium: Adults |
| 38 | Gumball Machine | Arcade | Both: Youth |
| 39 | Pinball Machine | Pachinko Mchn | Both: Seniors |
| 40 | Pop Gun Gallery | Archery Range | Both: All |
| 41 | Sports Gym | Hot Spring Bath | Sports Gym: All |
| 42 | Drum Bath | Cauldron Bath | Both: All |
| 43 | Sit-Down Bath | Lie-Down Bath | Both: All |
| 44 | Sauna | Cool Bath | Both: All |
| 45 | Vending Mchn | Food Vending Machine | Both: All |
| 46 | Outdoor Seating | Vending Mchn | Both: Youth |
| 47 | Outdoor Seating | Lemonade Stall | Both: Seniors |
| 48 | Outdoor Seating | Octopus Fritter Stall | Both: All |
| 49 | Outdoor Seating | Roast Chestnut Cart | Both: Women |
| 50 | Reading Room | Restroom | Reading Room: All |
| 51 | Reading Room | Computer Room | Both: Youth |
| 52 | Reading Room | Cafe | Reading Room: All |
| 53 | Home Theater | Restroom | Home Theater: All |
| 54 | Flower Workshop | Restroom | Both: All |
| 55 | Computer Room | Candy Store | Computer Room: Youth, Adults |

목욕 효과(Bath Effects) — 열: `Name | Buildings | Effects | Remarks`

| 이름 | 필요 시설 | 효과(손님층) | 비고 |
|---|---|---|---|
| Jacuzzi | Rest Stop ×1, Ornamental Rocks ×1 | Elderly | 확장 시 "원천" 발견 가능 |
| Silky Smooth | Salon ×1, Candy Store ×1, Hydrangea ×2 | Women | 확장 시 "원천" 발견 가능 |
| Flower Bath | Flower Workshop ×1, Flower Shop ×2, Cherry Tree ×1 | Women | |
| Salt Bath | Sports Gym ×1, Yoga Studio ×1, Sauna ×1 | Women | |
| Luck Bath | Restroom ×1, Pachinko Mchn ×1, Gumball Machine ×1 | Men | |
| Humming Bath | Karaoke Room ×1, Home Theater ×1, Auditorium ×1 | Men | |
| Eureka Bath | Gallery ×1, Computer Room ×1, Reading Room ×1 | Youth | 확장 시 "원천" 발견 가능 |
| Massage Bath | Massage Chair ×1, Massage Parlor ×1, Fir Tree ×1 | Adults | |
| Sulphur Bath | Waterfall Shower ×1, Drum Bath ×1, Little Statue ×1 | Elderly | |
| Fast Friends | Ping Pong Tbl ×1, Karaoke Room ×1, Arcade ×1 | Groups | |

핵심 규칙: (1) 거리 = 2칸 이내(체비쇼프). (2) 효과 = 손님층 적합도(compatibility) 상승 — 수치는 위키에 없음(게임 내 ◎/○ 표시). (3) 누적 허용: 같은 콤보 중복, 한 시설이 여러 콤보 참여. (4) 목욕 효과 = 3~4시설 세트 → 탕 1개에 손님층 효과.

### 1.2 Facilities (시설) — 환경 24 + 시설 20 + 매장 22 + 야외 22 = 88행

열(시설·매장·야외): `Image | Name | Type | Initial Cost (G) | Build Time | Upkeep (G) | Size (W×L) | Initial Stats { Price(G) | Popularity | Scenery } | Unlock Condition`. 카테고리 아이콘 4종: Relaxation / Utilities / Food / Entertainment. ∅ = 없음/해당 없음, 빈칸 = 위키 미기재.

환경(Environment) — 열: `Name | Initial Cost | Build Time | Upkeep | Effect(Normal) | Effect(Effective 계절) | Size | Unlock`

| 이름 | 비용 | 건설 | 유지 | 효과 | 계절 효과 | 크기 | 해금 |
|---|---|---|---|---|---|---|---|
| Floor | 100 | | | ∅ | ∅ | 0.5×0.5 | 초기 |
| Removal | ∅ | | | ∅ | ∅ | 0.5×0.5 | 초기 |
| Flower Seeds | 6,000 | | | +1 Scenery | ∅ | 2×2 | Wairo Shop 구매 |
| Adjust | ∅ | | | ∅ | ∅ | ∅ | 초기 |
| Main Gate | 170,000 | | | ∅ | ∅ | 2×0.5 | Architect 만족 |
| Front Desk | 90,000 | | | ∅ | ∅ | 3×2 | Architect 만족 |
| Break Room | 54,000 | 2h | 500 | ∅ | ∅ | 1×1 | 초기 |
| Linen Room | 21,000 | 2h | 250 | ∅ | ∅ | 1×1 | 초기 |
| Hydrangea | 25,000 | 2h | | +4 | 여름 +6 | 1×1 | 초기 |
| Azalea / Enkianthus Shrub | | 2h | | +6 | 봄 +9 | 1×1 | |
| Pink Azalea | | 2h | | +8 | 봄 +12 | 1×1 | |
| Black Bamboo | 5,000 | | | +2 | ∅ | 0.5×0.5 | |
| Pine Tree | ∅ | ∅ | | +4 | | 1×1 | |
| Plum Tree | ∅ | ∅ | | +4 | 봄 +7 | 1×1 | |
| Bamboo | ∅ | ∅ | | +5 | | 1×1 | |
| Maple Tree | ∅ | ∅ | | +6 | 가을 +9 | 1×1 | |
| Magnolia | ∅ | ∅ | | +7 | 봄 +10 | 1×1 | |
| Holly Bush | ∅ | ∅ | | +7 | ∅ | 1×1 | |
| Myrtle | ∅ | ∅ | | +7 | 여름 +10 | 1×1 | |
| Cherry Tree | | | | +8 | 봄 +12 | 1×1 | |
| Ginkgo Tree | | | | +9 | | 1×1 | |
| Fir Tree | | | | +8 | 겨울 +12 | 1×1 | |
| Wooden Lantern | ∅ | ∅ | | +5 | ∅ | 1×1 | |
| Kitchen | 50,000 | 6h | ∅ | ∅ | ∅ | 2×1.5 | |

시설(Facilities, Relaxation 위주)

| 이름 | 비용 | 건설 | 유지 | 크기 | 요금 | 인기 | 경관 | 해금 |
|---|---|---|---|---|---|---|---|---|
| Tatami Room | 4,000 | 1h | 500 | 1×1 | 4,000 | 18 | 4 | 초기 |
| Western Room | 4,000 | 1h | 500 | 1×1 | 4,000 | 18 | 4 | |
| Restroom | 15,000 | 1h | 500 | 1×1 | ∅ | 7 | 3 | 초기 |
| Massage Chair | 12,000 | 1h | 500 | 1×1 | 700 | 16 | 1 | Rank 8 (상점 150,000G) |
| Yoga Studio | 50,000 | 4h | 500 | 1.5×1 | 2,600 | 36 | 4 | |
| Lounge | 300,000 | 8h | 1,000 | 2.5×2.5 | ∅ | 38 | 13 | Nobleman 인기 30 |
| Rest Stop | 5,000 | 2h | 500 | 1×1 | 600 | 12 | 1 | 초기 |
| Gallery | 70,000 | 2h | 500 | 1×1 | ∅ | 14 | 5 | Painter 인기 30 |
| Tea Room | 35,000 | 2h | 1,000 | 1×1 | 1,600 | 19 | 8 | Tea Master 인기 40 |
| Reading Room | 50,000 | 2h | 500 | 1×1 | ∅ | 16 | 4 | Skater 인기 30 |
| Ceramics Workshop | 86,000 | 2h | 500 | 1×1 | ∅ | 24 | 5 | ★2 |
| Flower Workshop | 72,000 | 2h | 1,000 | 1×1 | 2,600 | 36 | 9 | 플로리스트 초대·만족 |
| Home Theater | 120,000 | 2h | 500 | 1×1 | ∅ | 28 | 3 | Movie Director 인기 60 |
| Auditorium | 180,000 | 8h | 2,000 | 2×2 | 3,200 | 48 | 9 | 공연자 초대·만족 |
| Gumball Machine | 8,000 | 1h | 500 | 1×1 | 1,000 | 10 | 1 | 1년 9월 (상점 60,000G) |
| ATM | 10,000 | 1h | 2,000 | 1×1 | ∅ | | | |
| Hot Spring Bath | 25,000 | 5h | 750 | 2×1.5 | ∅ | 20 | 10 | 1년 6월 |
| Spring Bath (L) | 120,000 | 7h | 1,000 | 2.5×2.5 | | 25 | 12 | |
| Spring Bath (XL) | 200,000 | 9h | 1,800 | 3.5×3 | | 30 | 14 | |
| Open-Air Bath | 140,000 | 12h | 2,000 | 4×3 | | 30 | 20 | Chimpan Z 초대·만족 |

매장(Stores)

| 이름 | 비용 | 건설 | 유지 | 크기 | 요금 | 인기 | 경관 | 해금 |
|---|---|---|---|---|---|---|---|---|
| Salon | 30,000 | 2h | 1,000 | 1×1 | 3,200 | 26 | 7 | 미용사 초대·만족 |
| Restaurant | 21,000 | 2h | 500 | 1×1 | 1,000 | 14 | 3 | 초기 |
| Ramen Stall | 43,000 | 2h | 1,000 | 1×1 | 3,160 | | 1 | |
| Sushi Restaurant | 75,000 | 2h | 1,000 | 1×1 | 4,150 | | 5 | DJ 인기 30 |
| Modern Restaurant | 110,000 | 4h | 2,000 | 1.5×1.5 | 7,250 | | 12 | The Eggeria Lv4 |
| Exclusive Restaurant | 140,000 | 4h | 2,000 | 1.5×1.5 | 7,000 | 48 | 15 | Governor 인기 30 |
| Coffee Shop | 40,000 | 2h | 1,000 | 1×1 | 1,000 | 20 | 5 | |
| Candy Store | 55,000 | 2h | 1,000 | 1×1 | 3,000 | 30 | 6 | 쇼콜라티에 초대·만족 |
| Cafe | 70,000 | 2h | 1,000 | 1×1 | 5,350 | 36 | 8 | 부탁 Mixer & Shaker |
| Souvenir Stnd | 26,000 | 4h | 1,000 | 1.5×1 | 2,600 | 12 | 3 | 초기 |
| Fortuneteller | 42,000 | 2h | 1,000 | 1×1 | 2,000 | 28 | 6 | 점술사 초대·만족 |
| Bakery | 100,000 | 2h | 1,000 | 1×1 | 5,100 | 24 | 10 | 부탁 Flour Power |
| Boutique | 60,000 | 4h | 1,000 | 1.5×1 | 4,200 | 21 | 8 | |
| Pinball Machine | 18,000 | 2h | 1,000 | 1×1 | 1,600 | 18 | 4 | 상점 120,000G |
| Pachinko Mchn | 40,000 | 2h | 500 | 1×1 | 3,200 | 4 | 3 | |
| Arcade | 82,000 | 2h | 500 | 1×1 | 2,500 | 21 | 3 | Pro Gamer 인기 30 |
| Karaoke Room | 110,000 | 2h | 500 | 1×1 | 3,000 | 31 | 5 | Guitarist 인기 30 |
| Pop Gun Gallery | 65,000 | 4h | 1,000 | 1.5×1 | 3,200 | 28 | 8 | Hunter 인기 30 |
| Sports Gym | 90,000 | 2h | 500 | 1×1 | 2,700 | 24 | 5 | Food Fighter 인기 60 |
| Archery Range | 80,000 | 4h | 1,000 | 1.5×1 | 3,200 | 28 | 9 | ★3 |
| Ping Pong Tbl | 70,000 | 5h | 500 | 2×1 | 3,000 | 38 | 7 | Professor 인기 30 |
| Bowling Alley | 240,000 | 8h | 2,000 | 3×1.5 | 4,200 | 45 | 6 | ★5 |

야외(Outdoor)

| 이름 | 비용 | 건설 | 유지 | 크기 | 요금 | 인기 | 경관 | 해금 |
|---|---|---|---|---|---|---|---|---|
| Wooden Veranda | ∅ | 5,800(?) | ∅ | 1×1 | ∅ | | | |
| Stone Floor | 100 | | | 0.5×0.5 | | | | |
| Drum Bath | 6,000 | 0h | 200 | 0.5×0.5 | ∅ | 14 | 9 | |
| Footbath | 4,000 | 2h | 200 | 1×1 | | 10 | 6 | 상점 160,000G |
| Sit-Down Bath | 16,000 | 2h | 200 | 1×1 | | 16 | 5 | |
| Cauldron Bath | 25,000 | 2h | 200 | 1×1 | | 19 | 11 | Novelist 인기 30 |
| Lie-Down Bath | 36,000 | 4h | 200 | 1.5×1 | | 19 | 7 | Chessmaster 인기 30 |
| Hot Tub | 64,000 | 6h | 200 | 1.5×1.5 | | 21 | 5 | Supermodel 인기 30 |
| Cool bath | 25,000 | 2h | 200 | 1×1 | | 16 | 3 | Diver 인기 30 |
| Sauna | 100,000 | 6h | 200 | 1.5×1.5 | | 31 | 5 | 해외 투어 완료 |
| Waterfall Shower | 80,000 | 2h | 200 | 1×1 | | 34 | 13 | ★4 |
| Kairobath | 194,000 | 4h | 200 | 1.5×1 | | 48 | 16 | 카이로봇 초대·만족 |
| Vending Mchn | 5,000 | 0h | 200 | 0.5×0.5 | 600 | 4 | 1 | Rank 7 |
| Food Vending Machine | 8,000 | 0h | 400 | 0.5×0.5 | 400 | 12 | 3 | Rank 22 |
| Lemonade Stall | 4,700 | 1h | 250 | 1×1 | 1,310 | 23 | 3 | Chief Maid 인기 30 |
| Octopus Fritter Stall | 6,000 | 1h | 250 | 1×1 | 1,000 | 19 | 3 | |
| Roasted Chestnut Cart | 14,000 | 1h | 250 | 1×1 | 1,400 | 15 | 4 | Trader 인기 30 |
| Massage Parlor | 20,000 | 1h | 250 | 1×1 | 700 | 28 | 2 | Masseur 인기 30 |
| Flower Shop | 32,000 | 1h | 250 | 1×1 | 1,000 | 24 | 8 | Bonsai Artist 인기 30 |
| Antique Store | 55,000 | 1h | 250 | 1×1 | 1,700 | 21 | 7 | Landlord 인기 30 |
| Magician | 80,000 | 1h | 500 | 1×1 | 700 | 36 | 11 | Arcade(명소) Lv4 |
| Outdoor Seating | 10,000 | 0h | 100 | 1×0.5 | ∅ | 14 | 7 | Cameraman 인기 30 |

핵심 규칙: (1) 탕(Bath)만 **크기 단계**가 있다 — Hot Spring Bath(25,000G, 인기 20, 경관 10) → L(120,000G, 25, 12) → XL(200,000G, 30, 14). 그 외 시설은 단계가 없고 **씨앗**으로 인기(상한 40)·요금·경관(상한 30)을 올린다. (2) 해금 6종: 초기 / Rank N / 손님 인기 30·40·60 / ★2~5 / 부탁·초대 / 명소 Lv4 / 날짜(1년 6월·9월) / 상점 구매. (3) 유지비는 월 200~2,000G(건설비의 0.2~12%로 편차 큼). (4) 건설 시간 0~12h.

### 1.3 Items (아이템) — Wairo 상점 8 + 응모권 상점 7 + 강화 아이템 18 + 환경 장식 33 = 66행

Wairo Shop(마일리지=메달 상점) — 열: `Item | Description | Cost | Remarks`

| 아이템 | 설명 | 가격(메달) | 비고 |
|---|---|---|---|
| Diamond Exchange | 다이아 1 → 메달 5 | 1 다이아 | |
| Carpenter | 목수(동시 건설) 추가 | 1st 30 / 2nd 81 / 3rd 138 | |
| Bearington Hammer | 주변 나무 제거 | 40 | 최대 10 |
| Raffle Ticket | 응모권(긁는 복권, 최고상 여행권) | 25 | |
| Popularity Seed | 시설 인기 UP | 10 | 인기 상한 40 |
| Price Seed | 시설 요금 UP | 10 | |
| Popularity Seed Pack | 인기 씨앗 5개 | 45 | 상한 40 |
| Price Seed Pack | 가격 씨앗 5개 | 45 | |

Raffle Shop(응모권) — 유니폼 5 + 씨앗·열매 2

| 항목 | 해금 |
|---|---|
| Hawaiian Shirt | 특별상 1회째 |
| Hotel Uniform | 특별상 2회째 |
| Maid Outfit | 특별상 3회째 |
| Swimwear | 특별상 4회째 |
| Santa Costume | 특별상 5회째 |
| Scenery Seed | 시설 경관 UP(상한 30) |
| Popularity Fruit | 시설 인기 UP |

Store(강화 아이템) — 열: `Item | Description | Best on(잘 맞는 시설)`

| 아이템 | 설명 | 잘 맞는 시설 |
|---|---|---|
| Soda | 탄산음료 | Lounge 계열, Hot Springs |
| Milk | 아침 배달 우유 | Lounge 계열 |
| Coffee | 향 좋은 커피 | Lounge 계열 |
| Charcoal | 구이용 숯 | Restaurants |
| Bath Salts | 입욕제 | Stores, Hot Springs, Flower Shop, Ceramics Workshop |
| Potpourri | 말린 꽃·과일 향 | Stores, Restrooms, Flower Shop |
| Honey | 꿀(선물용) | Restaurants, Roasted Chestnut Cart |
| Flower Poster | 꽃 포스터 | Stores, Lounge 계열, Flower Shop |
| Comic Books | 만화책 | Reading Rooms, Stores, Ramen Stall, Restroom, Coffee Shop |
| Vinyl Album | LP판 | Cafes, Yoga Studio, Antique Store |
| Floor Cushion | 방석 | Tatami Rooms, Restaurants |
| Teddy Bear | 곰인형 | Stores, Gumball Machines |
| Track Shoes | 운동화 | Ping Pong, Exercise Machines, Restrooms, Sports Gym, Western Room, Yoga Studio, Boutique |
| Glasses | 안경 | Reading Rooms, Computer Rooms, Pop Gun Gallery, Archery Range, Boutique |
| Hanging Scroll | 족자 | Tatami Rooms, Tea Rooms, Gallery, Flower Workshop, Antique Store, Exclusive Restaurant |
| TV | TV | Restaurants, Lounge 계열, Arcade |
| Urn | 항아리 | Guest Rooms, Galleries, Ceramics Workshop |
| Gold Leaf | 금박 | Western Rooms, Stores |

Environment(장식) — 열: `Decoration | Effect | Remarks`

| 장식 | 효과 | 비고 |
|---|---|---|
| Flower Seeds | 경관 +1 | |
| Hydrangea | +4 (개화 +6) | |
| Azalea | +6 (개화 +8) | |
| Pink Azalea | +8 (개화 +12) | |
| Black Bamboo | +2 | |
| Pine Tree | +4 (개화 +7) | |
| Plum Tree | +5 (개화 +9) | |
| Bamboo | +5 | |
| Palm Tree | +5 | |
| Maple Tree | +6 (가을 +9) | |
| Ginkgo Tree | +5 (가을 +9) | |
| Magnolia | +7 | |
| Holly Bush | +7 | |
| Camellia | +7 (개화 +10) | |
| Myrtle | +7 (개화 +10) | |
| Cherry Tree | +7 (개화 +11) | |
| Fir Tree | +8 (겨울 +12) | |
| White Pine | +9 | |
| Checkerboard Lawn | (미기재) | |
| Plant | 이동 속도 +2 | |
| Large Plant | 이동 속도 +3 | |
| Seasonal Plant | 이동 속도 +4 | |
| Ornamental Rocks | +2 | |
| Mossy Stone | +4 | |
| Lantern | +3 | |
| Wooden Lantern | +5 | |
| Beckoning cat | (미기재) | |
| Little Statue | +3 | 주변 경관물 전부 소폭↑ |
| Racoon Statue | +3 | |
| Bamboo Fountain | +7 | |
| Lily Pond | +12 (여름 +18) | |
| Millenium Cherry Blossom | +4 (개화 +12) | |
| Millenium Pine | +30 | 100주년 이후 획득 |

핵심 규칙: 아이템 종류 = ①메달 상점(기능·씨앗) ②응모권 추첨(유니폼·씨앗·열매) ③강화 아이템(시설에 사용, "잘 맞는 시설"이면 효과↑) ④경관 장식(맵 배치, 계절 보너스) ⑤이동 속도 식물. 입수처 = 상점 구매 / 부탁 보상 / 손님 효과("Items") / 응모권 / 100주년.

### 1.4 Tourism (관광 명소) — 4분류 × 6 = 24곳, Lv1~5

열: `Tourist Spot | Appeal Lv1 | Appeal Lv5 | Cost Lv2..Lv5(위키 빈칸) | Unlock(Lv2·Lv4에서 열리는 것) | Unlock Condition`. "Every level 2 unlocks a request to open up a new target."

| 분류 | 명소 | 매력 Lv1 | 매력 Lv5 | Lv2 해금 | Lv4 해금 | 개방 조건 |
|---|---|---|---|---|---|---|
| See | Canola Flowers | 12 | 64 | Illustrator | | Dumpling Shop Lv4 |
| See | Shrine | 15 | 73 | Priestess | | Canola Flowers Lv4 |
| See | Botanical Gardens | 18 | 82 | | | Shrine Lv4 |
| See | Wild Life Park | 24 | 100 | | | Botanical Gardens Lv4 |
| See | Astronomy Tower | 27 | 109 | Inventor | | Wild Life Park Lv4 |
| See | Castle | 33 | 127 | | | Astronomy Tower Lv4 |
| Eat | Dumpling Shop | 9 | 55 | | | 초기 |
| Eat | Café | 15 | 73 | | | Dumpling Shop Lv4 |
| Eat | Steak House | 18 | 82 | Food Fighter | | Café Lv4 |
| Eat | Noodle Shop | 21 | 91 | Drummer | | Steak House Lv4 |
| Eat | Dairy | 30 | 118 | | | Noodle Shop Lv4 |
| Eat | The Eggeria | 33 | 127 | | | Dairy Lv4 |
| Play | Campgrounds | 15 | 73 | Prgrmmr | | 초기 |
| Play | Dinosaur Land | 18 | 82 | Hunter | | Campgrounds Lv4 |
| Play | Ski Slope | 24 | 100 | Skier | | Dinosaur Land Lv4 |
| Play | Golf Club | 27 | 109 | Pro Golfer | | Ski Slope Lv4 |
| Play | Amusement Park | 33 | 127 | Performer | | Golf Club Lv4 |
| Play | Arcade | 45 | 163 | | | Amusement Park Lv4 |
| Nature | Soothing Forest | 12 | 64 | Birdwatcher | Pianist(Lv5) | 초기 |
| Nature | Murky Swamp | 15 | 73 | | | Soothing Forest Lv4 |
| Nature | Cloudy Mountains | 18 | 82 | | | Murky Swamp Lv4 |
| Nature | Cooling Waterfall | 21 | 91 | | | Cloudy Mountains Lv4 |
| Nature | Limestone Caves | 24 | 100 | Spelunker | | Cooling Waterfall Lv4 |
| Nature | Toasty Volcano | 30 | 118 | | Tea Expert(Lv4) | Limestone Caves Lv4 |

핵심 규칙: (1) 매력 Lv1 9~45 → Lv5 55~163(≈ ×4.4~5.5). (2) 투자금은 위키 미기재. (3) Lv2에서 새 타깃(손님)·부탁, 앞 명소 Lv4가 다음 명소 개방. (4) 매력 → 마을 관광객 수 → 리조트 잠재 손님. 방문객 수 목표 달성 시 상품. 투어 버스로 방문객↑.

### 1.5 Targets (타깃 손님) — 106종

**주의**: HSS2의 "Targets"는 목표(퀘스트)가 아니라 **타깃 손님층**이다. 열: `Target | Effect(만족 시 효과) | Starting Money(G) | Unlock Condition(부탁명) | Unlocks Request(이 손님이 여는 다음 부탁)`. 효과 6종: Items / Funds up! / Advertising / Research Points / Facility Popularity up! / Received Raffle Ticket!. 부탁(Request) 완료 → 다음 타깃 해금이 체인.

| # | Target | Effect | 소지금 | 해금 부탁 | 여는 부탁 |
|---|---|---|---|---|---|
| 1 | Student | Items | 11,200 | 초기 | Foreign exchange |
| 2 | Biz-man | Funds up! | 11,900 | | Hush money |
| 3 | Biz-woman | Funds up! | 12,600 | | Lv40 Help meowt |
| 4 | Housewife | Advertising | 16,300 | | License to grill, Tickled pink Lv59 |
| 5 | Hiker | Items | | | Making it official |
| 6 | Landlord | Funds up! | | Making it official | One man's trash |
| 7 | Cat Sitter | Items | | Help meowt | Fixing up the place? / Massage parlor |
| 8 | Manager | Funds up! | | Hush Money | Hospitality funding |
| 9 | G. Manager | Funds up! | | Hospitality funding | Put in a good word |
| 10 | COO | Funds up! | | Put in a good word | Secretary wanted, Lv50 corporate takeover |
| 11 | CEO | Funds up! | | Corporate takeover | High dining |
| 12 | Fitness Coach | Advertising | | | Greet the sun |
| 13 | Rapper | Advertising | | Foreign Exchange | Refined tastes |
| 14 | TV Host | Advertising | | Refined tastes | Whose line is it |
| 15 | Birdwatcher | Items | | Birdwatching hide | |
| 16 | Secretary | Raffle Ticket | | | |
| 17 | Antique Dlr | Raffle Ticket | | Work night out success? | |
| 18 | Chef | Items | | License To Grill | Sweet as candy |
| 19 | Bookworm | Research | | Brushing up | Lay down a beat |
| 20 | DJ | Facility Pop | | Lay Down a Beat | So much sushi |
| 21 | Skater | Items | | | Pursuit of knowledge |
| 22 | Poseur Surfer | Items | | Surf's Up | Sound investment |
| 23 | Trader | Funds up! | | Sound Investment | A winter favorite |
| 24 | M. Artist | Raffle Ticket | | Get in the ring | Plushies please |
| 25 | Masseur | Advertising | | Massage parlor | Check ups on demand |
| 26 | Cosplayer | Raffle Ticket | | Cosplay convention | New wardrobe |
| 27 | Plumber | Facility Pop | | New wardrobe | |
| 28 | Dye Artist | Raffle Ticket | | To dye for | Trendy town |
| 29 | Designer | Items | | Trendy town | Haute couture |
| 30 | DIYer | Facility Pop | | Do it yourself | Record player repair |
| 31 | Bass Angler | Items | | Cool as a cucumber | Fishing for info, lv60 get hooked |
| 32 | Famous Angler | Items | | Fishing for info | |
| 33 | Angler Couple | Items | | Get hooked | |
| 34 | Pastry Chef | Items | | Sweet as candy | |
| 35 | Prgrmmr | Research | | The great outdoors | eSports scene, lv60 cushion the blow |
| 36 | Pro Gamer | Research | | eSports scene | Arcade game gallery |
| 37 | Safari Guide | Items | | A guiding hand | Fur and fluff |
| 38 | Jockey | Research | | Burning Rubber | Wild blue yonder |
| 39 | Flight Attendant | Advertising | | Wild blue yonder | Till the fat lady sings |
| 40 | Opera Sngr | Advertising | | Till the fat lady sings | Home away from home |
| 41 | Noblewmn | Funds up! | | Home away from home | |
| 42 | Chief Maid | Facility Pop | | Maid cafe | Citussy cravings |
| 43 | Detective | Funds up! | | Back behind the wheel | Mystery mastery |
| 44 | Pharmacist | Funds up! | | Medicine man | |
| 45 | Comedian | Advertising | | Whose line is it | Just a trim |
| 46 | Dog Groomer | Advertising | | Fur and Fluff | Beauty school hopeful |
| 47 | Drummer | Funds up! | | Noodle Shop Lv2 | Busted, lv60 if the price is right |
| 48 | Professor | Research | | Mystery mastery | Table for tennis |
| 49 | Nursery Worker | Advertising | | Childcare options | New home |
| 50 | Cameraman | Research | | We've been framed | Take a load off, lv60 full page spread |
| 51 | Yng Couple | Items | | Coupon quest | Down the aisle |
| 52 | Inventor | Items | | | Footwear finance |
| 53 | Cartoonist | Items | | Assistants wanted | Career change |
| 54 | Painter | Research | | Career change | A folk in the road |
| 55 | Journalist | Advertising | | Local publications | Writer's retreat |
| 56 | Novelist | Research | | Writer's retreat | Rub a dub |
| 57 | Spelunker | Items | | Limestone Caves lv2 | Rolling stones |
| 58 | Beautician | Items | | Beauty school hopeful | Go with the fro |
| 59 | Guitarist | Funds up! | | Busted | Hand me the mic |
| 60 | Ballroom Dancer | Raffle Ticket | | Swanky Soiree | Kagura classroom |
| 61 | Folk Dancer | Raffle Ticket | | Kagura classroom | Scroll scramble |
| 62 | Cowboy | Research | | Cattle wrangler | Burning rubber |
| 63 | Boxer | Research | | | |
| 64 | Outdoorswoman | Items | | Take a hike | Lv60 exchange of vows, vocal training |
| 65 | Voice Actor | Items | | Vocal training | Virtual famous |
| 66 | VR Pop Singer | Advertising | | Virtually famous | A word from our sponsors, lv60 Collab request |
| 67 | VR Pop Band | Advertising | | Collab request | |
| 68 | Hiker Family | Advertising | | Exchange of vows | |
| 69 | Illustrator | Facility Pop | | Back to the drawing board | Assistants wanted |
| 70 | Pro Golfer | Advertising | | Golf club lv2 | Academy aspirations |
| 71 | Chairprsn | Funds up! | | Academy aspirations | Vision for the future |
| 72 | Apothecary | Funds up! | | Notion potion | |
| 73 | Hunter | Items | | Jurassic hunt | Sharp shooting |
| 74 | Skier | Funds up! | | Hit the slopes | Snowboarding class, lv60 don't be afraid |
| 75 | Snowboarder | Items | | Snowboarding class | Maple madness |
| 76 | Cook | Items | | If you can't take the heat | Fan club |
| 77 | Local Singer | Advertising | | Fan club | True artiste |
| 78 | Artist | Advertising | | True artiste | My big break |
| 79 | Researcher | Research | | Seeker of knowledge | |
| 80 | Food Fighter | Items | | | Some Mo Sumo, lv60 hit the gym |
| 81 | Sumo Wrestler | Research | | Some Mo Sumo | |
| 82 | Diver | Funds up! | | Take the plunge | |
| 83 | Amateur Model | Items | | Full page spread | |
| 84 | Con Artist | Funds up! | | 8 balls (★5 이후) | Billiards tourney |
| 85 | Celebrity | Funds up! | | Billiards tourney | |
| 86 | Old Couple | Raffle Ticket | | Stretch your legs | |
| 87 | Bonsai Artist | Facility Pop | | Little trees, big dreams | Fresh flowers |
| 88 | Priestess | Items | | Spiritual atmosphere | High spirits |
| 89 | Medium | Raffle Ticket | | High spirits | |
| 90 | Artisan | Research | | Culture for the masses | Plum crazy, lv60 fashion show |
| 91 | Pop Singer | Advertising | | My big break | |
| 92 | Yng Family | Advertising | | | |
| 93 | Governor | Funds up! | | Election campaign | Welcome ceremony |
| 94 | Rich Heir | Funds up! | | Welcome ceremony | |
| 95 | Pianist | Funds up! | | Tickling the Ivories (Soothing Forest Lv5) | |
| 96 | Nobleman | Funds up! | | | Lounging around |
| 97 | Super Model | Advertising | | Fashion show | Hot tub |
| 98 | Announcer | Advertising | | A word from our sponsors | Casting call |
| 99 | Actress | Advertising | | Casting call | Cherry trees |
| 100 | Spy | Funds up! | | If the price is right | Urn |
| 101 | Skier Couple | Research | | Dont be afraid | |
| 102 | Noble Family | Items | | Castle level 2 | |
| 103 | Tourist Family | Funds up! | | | |
| 104 | Performer | Funds up! | | Amusement Park lv2 | Life on the silver screen |
| 105 | Movie Director | Advertising | | Life on the silver screen | A new voice in cinema |
| 106 | Chess Master | Research | | Castle lv3 | Lay back and relax |

핵심 규칙: (1) 손님 타입 106행(위키 표 기준; 게임 내 "100종+"). (2) 효과 6종은 손님이 **만족하고 떠날 때** 발동. (3) 부탁 체인: 손님 A 만족 → 부탁 → 완료 시 손님 B 해금 + 시설/아이템. "Lv40/50/59/60"은 그 손님의 인기(popularity) 조건. (4) 일부 해금은 명소 Lv2·3·5, ★5, 특정 부탁 완료. (5) 소지금은 초반 4종만 기재(11,200~16,300G).

### 1.6 Staff (직원) — 채용 5 + 직원 20

채용 방법 — 열: `Recruiting Method | Cost(G) | Unlock Condition`

| 방법 | 비용 | 해금 |
|---|---|---|
| Attract Passerby | 5,000 | 초기 |
| Recruitment Site | 50,000 | |
| Magazine Ads | 80,000 | |
| Call for Interns | 200,000 | 멧돼지 퇴치 |
| College Presentation | 500,000 | 늑대 퇴치 |

직원 목록 — 열: `Name | Energy(초기/상한) | Strength | Tech | Smile | Max Level | Initial Salary(G) | Recruiting Method`. 상한은 응모권 특별상 없이 기준.

| 이름 | 체력 | 힘 | 기술 | 미소 | 최대 Lv | 초기 급여 | 채용 |
|---|---|---|---|---|---|---|---|
| Jacques Cuzzi | 0/2 | 0/2 | 0/3 | 0/2 | 9 | 400 | 초기 |
| Flora Butterworth | 1/5 | 0/2 | 1/5 | 0/3 | 15 | 800 | Recruitment Site |
| Ryan West | 0/2 | 0/2 | 1/5 | 1/4 | 13 | 700 | Recruitment Site |
| Charles Pendragon | 1/4 | 0/2 | 1/4 | 0/2 | 12 | 700 | Recruitment Site |
| Bobby Freeman | 0/1 | 1/5 | 1/4 | 0/1 | 11 | 600 | Attract Passersby |
| Stella Fielding | 0/2 | 0/1 | 0/3 | 1/4 | 10 | 700 | Attract Passersby |
| Sylvia Boon | 0/3 | 1/4 | 0/2 | 0/2 | 12 | 500 | Attract Passersby |
| Terry Sandman | 0/3 | 1/4 | 1/5 | 1/4 | 16 | 900 | Magazine Ads |
| Rose Hillier | 1/4 | 1/5 | 1/5 | 1/3 | 17 | 900 | Magazine Ads |
| Igazo Shinobu | 0/2 | 2/7 | 2/7 | 0/2 | 18 | 1000 | Magazine Ads |
| Gail Miller | 1/4 | 2/7 | 1/4 | 1/4 | 19 | 1200 | Magazine Ads |
| Mary Piper | 0/2 | 0/3 | 0/8 | 0/7 | 20 | 1200 | Call for Interns |
| Tina Waters | 2/7 | 1/6 | 1/5 | 0/2 | 20 | 1300 | Call for Interns |
| Mabel Lee | 1/3 | 2/7 | 1/4 | 2/7 | 21 | 1500 | Call for Interns |
| Emily Angelou | 1/5 | 2/8 | 0/3 | 1/6 | 22 | 1500 | Call for Interns |
| Summer Brownstone | 2/6 | 1/4 | 2/7 | 1/6 | 23 | 1700 | College Presentation |
| Florence Seacole | 1/5 | 1/6 | 2/6 | 1/7 | 24 | 1900 | College Presentation |
| Tammy Walker | 2/6 | 0/2 | 2/9 | 2/8 | 25 | 2000 | College Presentation |
| Gemma Platt | 1/5 | 2/8 | 3/9 | 1/4 | 26 | 2200 | College Presentation |
| Buttons | 1/5 | 1/4 | 1/9 | 1/5 | 23 | 1600 | 소라(Conch) 사용 |

핵심 규칙: (1) 스탯 0~9, 초기 0~3, 상한 1~9. (2) 최대 레벨 9~26 — 채용 단계가 높을수록 상한·최대 레벨·급여 모두 높다. (3) 급여 400~2,200G/월. (4) 별도의 훈련(연수) 시스템은 위키에 없음 — 레벨업은 근무·홍보로, 상한 돌파는 응모권 특별상. (5) 직종 개념 없음(모든 직원이 청소·접객·이불·홍보를 공통 수행, 스탯이 효율 결정). (6) 휴게실당 +3명.

### 1.7 Guides (가이드북) — 11종

열: `Name | Prize for 1st place | Unlock Condition | Remarks`

| 가이드북 | 1위 상금 | 연구 | 씨앗 | 해금 | 비고 |
|---|---|---|---|---|---|
| Local Springs | 100,000G | 100 | 인기 ×2, 가격 ×2 | 1년 7월 | 전작에도 있음 |
| Prefectural Springs | 300,000G | 1,000 | 인기 ×2, 가격 ×2 | Local Springs 1위 | |
| Touring Japan | 600,000G | 4,000 | 인기 ×2, 가격 ×2 | Prefectural 1위 | |
| Le Nichelin Guide | 1,000,000G | 10,000 | 인기 ×2, 가격 ×2 | Touring Japan 1위 | |
| Glamour Springs | 300,000G | 600 | 인기·가격 ×1, Glamour Seed ×1 | | |
| Top 100 Springs | 700,000G | 4,500 | 인기·가격 ×1, Fame Seed ×1 | Glamour Springs 1위 | |
| Gourmet Springs | 600,000G | 3,000 | 인기·가격 ×1, Gourmet Seed ×1 | | |
| Relaxing Springs | 400,000G | 2,000 | 인기·가격 ×1, Relaxation Seed ×1 | | |
| Travel Wonderland | 500,000G | 2,000 | 인기·가격 ×1, Entertainment Seed ×1 | | |
| Warm Welcomes | 200,000G | 200 | 인기·가격 ×1, Hospitality Seed ×1 | 초기 | |
| No. Wario Guide | 120,000G + 메달 10 | 2,000 | 인기·가격 ×1 | | 매호 타깃 변동 |

핵심 규칙: (1) 종합 4단계 사다리(Local → Prefectural → Touring Japan → Le Nichelin)는 앞 가이드 1위가 다음 해금. (2) 테마 가이드 6종(Glamour/Top100/Gourmet/Relaxing/Wonderland/Warm Welcomes)은 각 테마 점수(경관·명성·먹거리·쉼·즐길거리·환대)로 심사. (3) 순위 조건(가중치 수치)·라이벌 성장 곡선은 위키 미기재 — Manual: "시설·환대 등 종합". (4) 상금 100,000 → 1,000,000G, 연구 100 → 10,000(×100 지수 증가).

### 1.8 위키에서 못 읽은 것

| 항목 | 상태 |
|---|---|
| 콤보 효과의 수치(적합도 +얼마) | 위키 미기재(◎/○ 표시만) → §3.1에서 우리 수치 확정 |
| 명소 Lv2~5 투자금 | 표 열은 있으나 전부 빈칸 → §3.4에서 확정 |
| Targets 소지금(5행 이후) | 빈칸 → 현재 guests.json의 money 유지 |
| 가이드북 심사 가중치·라이벌 수·성장 | 미기재 → §3.7에서 확정 |
| 직원 훈련·승급 조건 | 시스템 없음 → §3.6에서 신설 |
| 시설 업그레이드 Lv | 탕 S/L/XL만 존재 → §3.2에서 전 시설 Lv1~3 신설 |
| Facilities 표의 Environment 일부 비용(∅) | 게임 내 상점 구매·부탁 보상이라 비용 없음 |
| fandom 개요 페이지 | 기본 정보(비상금 30,000G·10년 종료)만 유효, 나머지는 광고·네비 |
| Targets 표 마지막 청크 | 페이지 끝(Chess Master)까지 읽음, 추가 행 없음 |

---

## 2. 현재 게임과의 갭 분석

기준: `src/data/generated/v2/*.json`, `.worktrees/v3/src/data/goals.json`(60), `events_v3.json`(27), `src/sim/*.ts`(v3 워크트리). 헤드리스 봇 3년 실행(seed 1): 1년차 말 자금 2,079만(시작 500만의 4.2배), 3년차 말 8,687만, 직원 3명 고정, ★2, 랭크 8, 적자 달 0.

| 항목 | HSS2 | 현재 | 상태 | 갭 |
|---|---|---|---|---|
| 콤보(페어) | 55, 거리 2, 손님층 적합도 | 45 (`combos.json`: pop ±3/±6, fee ±5/±10%, hidden) | 부분 | +15개, 누적 상한·중복 규칙 미정 |
| 세트(목욕 효과) | 10 (3~4시설 → 탕 효과) | 14 (`sets.json`: 인기 ×1.1~1.5 + 특수) | 있음 | "명당 발견" 연출·특수 효과 종류 보강 |
| 시설 종류 | 64 기능 시설 + 24 환경 = 88 | 109 (기능 57 + 농원 7 + 경관 36 + 랜드마크 9) | 있음 | HSS2 계열 중 없는 것 44종(족욕·안마·오락·공연·차실·미용 등) |
| 시설 단계 | 탕 S/L/XL, 씨앗 상한 인기 40·경관 30 | 단계 없음, 씨앗 상한 동일 | 없음 | 전 시설 Lv1~3 증축 신설 |
| 동종 건설비 상승 | 있음 | +10%/동종(GDD) | 있음 | — |
| 노후·더러움(Dirt) | 있음(청소 직원) | 없음 | 없음 | 청결 시스템 신설 |
| 아이템 — 메달 상점 | 8 | 14 (`mileage_shop.json`) | 있음 | — |
| 아이템 — 응모권 상점 | 7 | 8 (`ticket_shop.json`) | 있음 | — |
| 강화 아이템 | 18 | 20 (`items.json`) | 있음 | 새 시설 40종에 "잘 맞는 시설" 매핑 필요 |
| 특수 아이템 | (부탁 보상 형태) | 12 (`special_items.json`) | 있음 | 손님 선물·직원 연수권 신설 |
| 경관 장식 | 33 (계절 보너스) | 36 (경관 12 계절 보너스) | 있음 | 이동 속도 식물 3종 없음 |
| 관광 명소 | 24, Lv1~5, Lv2·4 해금 | 24, Lv1~5, `lv2GuestId`·`lv4QuestId` | 있음 | Lv별 조건이 투자금뿐 → 방문객·년차·★ 조건 추가, 방문객 상품·투어 버스·투어 개최 없음 |
| 손님(Targets) | 106, 효과 6종, 부탁 체인 | 103, 효과 6종, 30체인 (`guests.json`·`quests.json`) | 있음 | 소지금 조건(Lv40/50/60 인기 조건) 형태 미구현 |
| 목표(순차 체인) | (HSS2엔 없음 — 부탁+랭크가 역할) | 60 (`goals.json`) | 부분 | 100+로 확장, 난이도 곡선 |
| 직원 풀 | 20, 스탯 0~9, 최대 Lv 9~26, 급여 400~2,200G | 27, 스탯 0~99, 최대 Lv 5~12, 급여 40만~220만 | 있음 | — |
| 채용 | 5단계 5,000~500,000G | 5단계 50만~5,000만 | 있음 | — |
| 직원 훈련(연수) | 없음 | 없음(연구로 승급) | 없음 | 연수 시스템 신설(사용자 요구) |
| 직종 | 없음(공통) | 6 (`staff_roles.json`, field 삭제 예정) | 있음 | 청소·농원·홍보 직종 추가 |
| 특기(스킬) | 없음 | 20 (`skills.json`) | 있음 | +10 |
| 유니폼 | 5 | 5 | 있음 | — |
| 가이드북 | 11 | 11 (`guidebooks.json`, 심사 6키) | 있음 | 심사 가중치 표·라이벌 9곳 성장 곡선 명시 |
| 랭크 | Rank(상승만) | 랭크 1~10 (`rank.ts`, 내려가지 않음) | 있음 | ★ 유지 심사(강등) 신설 |
| 라이벌 | 랭킹 경쟁자(성장 미기재) | 6 (`rivals.json`, 3년차부터, +10%/년) | 있음 | 2년차부터, 가이드북 라이벌 9곳과 통합 |
| 이벤트 | 계절·특별 손님 | 27 (`events_v3.json`) + 42 (`events.json`) | 있음 | 페널티 수치화(태풍 수리비 2만 → 시설 비례) |
| 비상금 | 30,000G 1회 | 정착지원금 300만(잔고 < 40만) | 있음 | 실패 상태(경고·대출·목표 지연) 없음 |
| 엔딩 | 10년차 3월 | 15년 | 있음 | 10년차 점수 계산 목표 추가 |

**요약**: 데이터 표는 HSS2와 거의 대등(손님·명소·가이드북·상점은 이미 같은 수). 없는 것은 ①시설 Lv ②청결/노후 ③연수 ④목표 100+ ⑤난이도(비용·실패·강등). 이 다섯이 이 문서의 신설 축이다.

---

## 3. 확장 스펙 (제주 버전)

### 3.1 콤보 (페어 60 + 명당 효과 12)

**판정 규칙 (HSS2 그대로 + 수치 확정)**
1. 거리: 두 시설의 **점유 칸 중 가장 가까운 칸 쌍**이 체비쇼프 거리 ≤ 2 (가로·세로·대각). 길·담 무관, 필지 경계 무관(둘 다 소유 필지).
2. 중복: 같은 콤보는 상대가 **다른 개체**일 때마다 다시 센다. 예) 야외 테이블 1개 주변에 감귤나무 3그루 → `귤밭 뷰` ×3.
3. 누적 상한: 한 시설이 받는 콤보 합계는 **인기 +12 / 요금 +20%** 까지, 하락 콤보는 **인기 −9 / 요금 −15%** 까지. 상승·하락은 따로 합산 후 더한다.
4. 손님층 효과: `target`이 `all`이 아니면, 그 태그 손님이 이 시설을 고를 확률 ×1.3(콤보 1개당, 최대 ×2.0) + 만족도 +5. `all`이면 모든 손님 만족도 +3.
5. 등급: `up`(+3/+5%) · `upup`(+6/+10%) · `down`(−3/−5%). hidden 콤보는 도감에 "???"로, 처음 발견 시 대화창 + 응모권 1.
6. 시설 Lv(§3.2)가 오르면 콤보 보너스에 Lv 계수 ×1.0/×1.25/×1.5.

**콤보 표 60** (앞 45개는 현재 `combos.json` 그대로 유지, 46~60 신규. 열: id | 시설 a | 시설 b | 적용 | 손님층 | 등급 | hidden | HSS2 원형)

| # | id | a | b | 적용 | 손님층 | 등급 | hidden | 원형 |
|---|---|---|---|---|---|---|---|---|
| 1 | cb_tangerine_view | table_out | tangerine_tree | both | all | up | N | Room×Rest Stop |
| 2 | cb_shade_bench | bench_stonewall | hackberry_shade | a | senior | up | N | Rest Stop×Gallery |
| 3 | cb_guardian_pair | dolhareubang_pair | dolhareubang | a | all | up | N | Tatami×Tatami |
| 4 | cb_canola_window | window_seat | canola | a | female | up | Y | — |
| 5 | cb_fire_pampas | fire_pit | pampas | both | youth | up | Y | — |
| 6 | cb_camellia_books | bookshelf | camellia | a | adult | up | Y | — |
| 7 | cb_kids_chicken | kids_table | chicken_coop | a | group | up | Y | — |
| 8 | cb_kids_roaster | kids_table | roaster | a | group | down | N | (소음) |
| 9 | cb_books_parking | bookshelf | parking | a | all | down | N | (소음) |
| 10 | cb_souvenir_parking | souvenir | parking | a | group | up | Y | — |
| 11 | cb_souvenir_photo | souvenir | photo_spot | both | female | upup | Y | Souvenir×Gumball |
| 12 | cb_counter_roaster | counter | roaster | a | adult | upup | Y | Coffee Shop×Tea Room |
| 13 | cb_hammock_cedar | hammock | cedar | a | adult | up | Y | — |
| 14 | cb_picnic_orchard | picnic | tangerine_tree | a | group | up | Y | (field → 감귤나무로 치환, 밭 폐지) |
| 15 | cb_oreum_observatory | oreum_bench | observatory | both | all | upup | N | Rest Stop×Hot Spring |
| 16 | cb_wall_orchard | stonewall | tangerine_tree | b | all | up | N | (field → 감귤나무) |
| 17 | cb_bee_canola | beehive | canola | a | all | up | N | — |
| 18 | cb_bee_camellia | beehive | camellia | a | all | up | N | — |
| 19 | cb_jar_bench | water_jar | bench_stonewall | b | senior | up | Y | — |
| 20 | cb_lantern_path | stone_lantern | lantern_path | both | all | up | Y | — |
| 21 | cb_pond_hydrangea | pond | hydrangea | both | female | up | Y | — |
| 22 | cb_cat_books | cat_house | bookshelf | b | female | up | Y | — |
| 23 | cb_vending_bigtable | vending | table_big | b | group | up | N | Vending×Food Vending |
| 24 | cb_gallery_sofa | gallery | sofa | both | adult | up | Y | Lounge×Gallery |
| 25 | cb_jam_orchard | jam_workshop | tangerine_tree | a | group | up | Y | — |
| 26 | cb_restroom_indoor | restroom | table_in | b | all | up | N | Room×Restroom |
| 27 | cb_terrace_palm | terrace_seat | palm | a | youth | up | Y | — |
| 28 | cb_wifi_sofa | wifi_zone | sofa | both | youth | up | N | Lounge×Computer Room |
| 29 | cb_stroller_kids | stroller_park | kids_table | b | group | up | N | — |
| 30 | cb_dog_picnic | dog_park | picnic | both | adult | up | Y | — |
| 31 | cb_snap_camellia | snap_studio | camellia | a | female | up | Y | — |
| 32 | cb_karaoke_books | karaoke | bookshelf | b | all | down | N | (소음) |
| 33 | cb_greenhouse_hallabong | greenhouse_seat | hallabong_house | a | all | up | Y | — |
| 34 | cb_toenmaru_jar | toenmaru | water_jar | a | senior | up | Y | — |
| 35 | cb_pork_barley | black_pork_grill | barley_pub | both | male | upup | N | Restaurant×Ramen Stall |
| 36 | cb_mulhoe_hut | haenyeo_mulhoe | haenyeo_hut | a | adult | up | Y | — |
| 37 | cb_tea_oreum | tea_field | oreum_bench | b | female | up | Y | — |
| 38 | cb_pottery_gallery | pottery_studio | gallery | both | adult | up | Y | Gallery×Ceramics |
| 39 | cb_horse_picking | horse_riding | picking_experience | both | group | up | N | — |
| 40 | cb_scooter_parking | scooter_rental | parking_large | a | youth | up | N | — |
| 41 | cb_rooftop_palm | rooftop | palm | a | youth | up | Y | — |
| 42 | cb_hall_hackberry | tangerine_hall | hackberry_millennium | both | all | upup | Y | — |
| 43 | cb_bike_scooter | bike_rack | scooter_rental | b | youth | up | N | — |
| 44 | cb_ade_peanut | hallabong_stand | peanut_icecream | both | youth | up | N | Outdoor Seating×Lemonade |
| 45 | cb_boardgame_karaoke | boardgame_room | karaoke | a | youth | down | N | (소음) |
| 46 | cb_footbath_pavilion | footbath | rest_pavilion | both | all | up | N | Rest Stop×Hot Spring Bath |
| 47 | cb_drum_cauldron | drum_footbath | cauldron_footbath | both | all | up | N | Drum Bath×Cauldron Bath |
| 48 | cb_sauna_cool | sauna_hut | cool_footbath | both | all | up | N | Sauna×Cool Bath |
| 49 | cb_lie_hot | lie_footbath | hot_tub_terrace | both | all | up | N | Sit-Down×Lie-Down |
| 50 | cb_yoga_salon | yoga_class | hair_salon | both | female | up | N | Salon×Yoga Studio |
| 51 | cb_yoga_fitness | yoga_class | fitness_corner | both | female | up | N | Yoga×Sports Gym |
| 52 | cb_tea_flower | tea_house | flower_workshop | both | female | up | N | Tea Room×Flower Workshop |
| 53 | cb_clothes_flower | clothing_shop | flower_workshop | a | female | up | N | Boutique×Flower Workshop |
| 54 | cb_capsule_arcade | capsule_machine | retro_arcade | both | youth | up | N | Gumball×Arcade |
| 55 | cb_pinball_marble | pinball | marble_game | both | senior | up | N | Pinball×Pachinko |
| 56 | cb_shooting_archery | shooting_booth | archery_range | both | all | up | N | Pop Gun×Archery |
| 57 | cb_lounge_gallery | lounge | gallery | a | adult | up | N | Lounge×Gallery (성인·시니어 → adult) |
| 58 | cb_concert_karaoke | concert_hall | karaoke | a | adult | up | N | Auditorium×Karaoke |
| 59 | cb_theater_restroom | home_theater | restroom | a | all | up | N | Home Theater×Restroom |
| 60 | cb_marble_atm | marble_game | atm | a | all | up | N | Pachinko×ATM |

**명당 효과 12 (HSS2 Bath Effects → 제주 "명당")** — 세트(`sets.json` 14)는 유지하고, 그 위에 **좌석/족욕 시설 1개**를 중심으로 반경 2칸의 시설 조합으로 판정하는 "명당"을 추가한다. 발동 시 해당 시설에 손님층 배수 ×1.5 + 인기 +5, 처음 발견 시 대화창("여기가 명당이여!") + 응모권 2. 명당은 시설 1개당 1종만(가장 먼저 만족한 것).

| id | 이름 | 중심 시설 | 필요(반경 2칸) | 손님층 | 원형 |
|---|---|---|---|---|---|
| spot_bubble | 거품 족욕 명당 | footbath | rest_pavilion ×1, basalt_rock ×1 | senior | Jacuzzi |
| spot_silky | 매끈 피부 명당 | footbath | hair_salon ×1, candy_shop ×1, hydrangea ×2 | female | Silky Smooth |
| spot_flower | 꽃 족욕 명당 | drum_footbath | flower_workshop ×1, flower_shop ×2, camellia ×1 | female | Flower Bath |
| spot_salt | 소금 족욕 명당 | cauldron_footbath | fitness_corner ×1, yoga_class ×1, sauna_hut ×1 | female | Salt Bath |
| spot_luck | 행운 명당 | capsule_machine | restroom ×1, marble_game ×1, pinball ×1 | male | Luck Bath |
| spot_hum | 콧노래 명당 | karaoke | home_theater ×1, concert_hall ×1 | male | Humming Bath |
| spot_eureka | 번뜩임 명당 | bookshelf | gallery ×1, pc_zone ×1, wifi_zone ×1 | youth | Eureka Bath |
| spot_massage | 안마 명당 | massage_chair | massage_booth ×1, cedar ×1 | adult | Massage Bath |
| spot_waterfall | 물맞이 명당 | waterfall_shower | drum_footbath ×1, dolhareubang ×1 | senior | Sulphur Bath |
| spot_friends | 단짝 명당 | pingpong | karaoke ×1, retro_arcade ×1 | group | Fast Friends |
| spot_oreum | 오름 바람 명당 | oreum_bench | pampas ×3, observatory ×1 | all | (제주 고유) |
| spot_orchard | 귤밭 그늘 명당 | table_out | tangerine_tree ×4, stonewall ×2 | group | (제주 고유) |

### 3.2 시설 — 신규 44종 + 전 시설 업그레이드 Lv1~3

#### 3.2.1 신규 시설 44 (HSS2 계열 중 현재 없는 것)

열: id | 이름 | 카테고리 | 티어 | 크기 | 건설비 | 유지비/월(1.5%) | 요금 | 인기 | 경관 | 소음 | 건설일 | 해금 | HSS2 원형. 요금 `null` = 좌석형(메뉴 매출). 해금 `goal:gNN`은 §3.5 목표 번호.

| id | 이름 | 카테고리 | 티어 | 크기 | 건설비 | 유지비 | 요금 | 인기 | 경관 | 소음 | 일 | 해금 | 원형 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| footbath | 족욕탕 | rest | small | 1×1 | 400,000 | 6,000 | 2,000 | 10 | 6 | 0 | 1 | goal:g21 | Footbath |
| drum_footbath | 드럼통 족욕 | rest | small | 1×1 | 600,000 | 9,000 | 2,000 | 14 | 9 | 0 | 1 | goal:g41 | Drum Bath |
| cauldron_footbath | 가마솥 족욕 | rest | small | 1×1 | 2,500,000 | 38,000 | 5,000 | 19 | 11 | 0 | 1 | goal:g48 | Cauldron Bath |
| lie_footbath | 눕는 족욕 벤치 | rest | medium | 2×1 | 3,600,000 | 54,000 | 6,000 | 19 | 7 | 0 | 3 | segment:retired_teacher 30 | Lie-Down Bath |
| hot_tub_terrace | 온수 족욕 풀 | rest | medium | 2×2 | 6,400,000 | 96,000 | 8,000 | 21 | 5 | 0 | 3 | segment:influencer 30 | Hot Tub |
| cool_footbath | 냉수 족욕 | rest | small | 1×1 | 2,500,000 | 38,000 | 5,000 | 16 | 3 | 0 | 1 | segment:diver 30 | Cool bath |
| open_air_footbath | 노천 족욕탕 | rest | large | 2×2 | 14,000,000 | 210,000 | 8,000 | 30 | 20 | 0 | 7 | goal:g63 | Open-Air Bath |
| waterfall_shower | 폭포 물맞이 | rest | small | 1×1 | 8,000,000 | 120,000 | 10,000 | 34 | 13 | 1 | 1 | goal:g74 | Waterfall Shower |
| sauna_hut | 찜질 움막 | rest | medium | 2×2 | 10,000,000 | 150,000 | 10,000 | 31 | 5 | 0 | 3 | goal:g81 | Sauna |
| massage_chair | 안마 의자 | rest | small | 1×1 | 1,200,000 | 18,000 | 3,000 | 16 | 1 | 0 | 1 | goal:g33 | Massage Chair |
| rest_pavilion | 쉼터 정자 | rest | small | 1×1 | 500,000 | 8,000 | null | 12 | 1 | 0 | 1 | goal:g25 | Rest Stop |
| lounge | 감귤 라운지 | rest | large | 2×2 | 30,000,000 | 450,000 | null | 38 | 13 | 0 | 7 | goal:g76 | Lounge |
| atm | 현금 인출기 | convenience | small | 1×1 | 1,000,000 | 15,000 | 0 | 0 | 0 | 0 | 1 | goal:g53 | ATM |
| food_vending | 간식 자판기 | convenience | small | 1×1 | 800,000 | 12,000 | 4,000 | 12 | 3 | 1 | 1 | rank:6 | Food Vending Machine |
| cleaning_room | 청소 도구실 | convenience | small | 1×1 | 2,100,000 | 32,000 | null | 0 | 0 | 0 | 1 | goal:g26 | Linen Room |
| locker | 짐 보관함 | convenience | small | 1×1 | 600,000 | 9,000 | 1,000 | 6 | 0 | 0 | 1 | rank:4 | (편의 보강) |
| lemonade_cart | 레몬에이드 카트 | food | small | 1×1 | 470,000 | 7,000 | 3,000 | 23 | 3 | 0 | 1 | goal:g40 | Lemonade Stall |
| sweet_potato_cart | 군고구마 카트 | food | small | 1×1 | 1,400,000 | 21,000 | 3,000 | 15 | 4 | 0 | 1 | segment:market_auntie 30 | Roasted Chestnut Cart |
| hanchi_cart | 한치 튀김 카트 | food | small | 1×1 | 600,000 | 9,000 | 4,000 | 19 | 3 | 1 | 1 | segment:angler 30 | Octopus Fritter Stall |
| candy_shop | 제주 사탕 가게 | food | small | 1×1 | 5,500,000 | 83,000 | 3,000 | 30 | 6 | 0 | 1 | goal:g89 | Candy Store |
| tea_house | 제주 차실 | food | small | 1×1 | 3,500,000 | 53,000 | 5,000 | 19 | 8 | 0 | 1 | goal:g43 | Tea Room |
| brunch_house | 브런치 식당 | food | large | 2×2 | 11,000,000 | 165,000 | 12,000 | 36 | 12 | 1 | 7 | goal:g60 | Modern Restaurant |
| fine_dining | 오름 뷰 다이닝 | food | large | 2×2 | 14,000,000 | 210,000 | 25,000 | 48 | 15 | 0 | 7 | goal:g77 | Exclusive Restaurant |
| capsule_machine | 캡슐 뽑기 | fun | small | 1×1 | 800,000 | 12,000 | 1,000 | 10 | 1 | 1 | 1 | goal:g35 | Gumball Machine |
| pinball | 핀볼 기계 | fun | small | 1×1 | 1,800,000 | 27,000 | 2,000 | 18 | 4 | 2 | 1 | mileage:ms_pinball | Pinball Machine |
| marble_game | 구슬 게임기 | fun | small | 1×1 | 4,000,000 | 60,000 | 3,000 | 4 | 3 | 2 | 1 | goal:g93 | Pachinko(순화) |
| retro_arcade | 레트로 오락실 | fun | medium | 2×1 | 8,200,000 | 123,000 | 2,500 | 21 | 3 | 3 | 3 | goal:g72 | Arcade |
| shooting_booth | 사격 게임 부스 | fun | medium | 2×1 | 6,500,000 | 98,000 | 3,000 | 28 | 8 | 2 | 3 | goal:g94 | Pop Gun Gallery |
| archery_range | 활쏘기 체험 | fun | medium | 2×1 | 8,000,000 | 120,000 | 3,000 | 28 | 9 | 1 | 3 | goal:g78 | Archery Range |
| pingpong | 탁구대 | fun | medium | 2×1 | 7,000,000 | 105,000 | 3,000 | 38 | 7 | 2 | 3 | goal:g59 | Ping Pong Tbl |
| mini_bowling | 미니 볼링 레인 | fun | large | 3×2 | 24,000,000 | 360,000 | 5,000 | 45 | 6 | 3 | 7 | goal:g70 | Bowling Alley |
| yoga_class | 요가 클래스 | fun | medium | 2×1 | 5,000,000 | 75,000 | 5,000 | 36 | 4 | 0 | 3 | goal:g66 | Yoga Studio |
| fitness_corner | 운동 코너 | fun | small | 1×1 | 9,000,000 | 135,000 | 3,000 | 24 | 5 | 2 | 1 | segment:running_crew 60 | Sports Gym |
| flower_workshop | 꽃꽂이 공방 | fun | small | 1×1 | 7,200,000 | 108,000 | 8,000 | 36 | 9 | 0 | 1 | goal:g88 | Flower Workshop |
| hair_salon | 헤어 살롱 | fun | small | 1×1 | 3,000,000 | 45,000 | 10,000 | 26 | 7 | 0 | 1 | goal:g79 | Salon |
| tarot_booth | 타로 부스 | fun | small | 1×1 | 4,200,000 | 63,000 | 2,000 | 28 | 6 | 0 | 1 | goal:g95 | Fortuneteller |
| magic_stage | 마술 공연 무대 | fun | small | 1×1 | 8,000,000 | 120,000 | 3,000 | 36 | 11 | 2 | 1 | goal:g83 | Magician |
| vintage_shop | 빈티지 소품점 | fun | small | 1×1 | 5,500,000 | 83,000 | 4,000 | 21 | 7 | 0 | 1 | goal:g84 | Antique Store |
| clothing_shop | 감성 옷가게 | fun | medium | 2×1 | 6,000,000 | 90,000 | 8,000 | 21 | 8 | 0 | 3 | goal:g85 | Boutique |
| flower_shop | 꽃집 | fun | small | 1×1 | 3,200,000 | 48,000 | 3,000 | 24 | 8 | 0 | 1 | goal:g44 | Flower Shop |
| home_theater | 영화 감상실 | fun | small | 1×1 | 12,000,000 | 180,000 | 0 | 28 | 3 | 1 | 1 | goal:g87 | Home Theater |
| concert_hall | 작은 공연장 | fun | large | 2×2 | 18,000,000 | 270,000 | 5,000 | 48 | 9 | 4 | 7 | goal:g71 | Auditorium |
| pc_zone | PC 존 | fun | small | 1×1 | 5,000,000 | 75,000 | 1,000 | 16 | 2 | 1 | 1 | segment:digital_nomad 30 | Computer Room |
| massage_booth | 안마 부스 | fun | small | 1×1 | 2,000,000 | 30,000 | 5,000 | 28 | 2 | 0 | 1 | goal:g98 | Massage Parlor |

(44행. `locker`·`food_vending`·`pinball`·`pc_zone` 4종은 목표가 아닌 랭크/상점/손님 해금이라 트랙 A가 일정상 뒤로 미룰 수 있는 후보다. `carrot_field`(당근밭)는 v3 워크트리 `objects.json`의 농원 시설로 이미 존재한다.) 합계 109 + 44 = **153종**. 카테고리별: 쉼 30 · 편의 18 · 먹거리 18 · 즐길거리 35 · 농원 6(밭 삭제) · 경관 36 · 랜드마크 9 + 폐창고 1.

강화 아이템 "잘 맞는 시설" 추가 매핑(기존 20종에 새 시설 편입): 제주 소금 → +sauna_hut·cauldron_footbath / 원두 샘플 → +tea_house / 소라 장식 → +footbath·open_air_footbath / 갈옷 방석 → +rest_pavilion·lie_footbath / 만화책 → +pc_zone·lounge / LP판 → +yoga_class·vintage_shop / 운동화 → +fitness_corner·pingpong·archery_range / 안경 → +pc_zone·shooting_booth·archery_range / 족자 → +tea_house·flower_workshop·vintage_shop·fine_dining / TV → +lounge·retro_arcade·brunch_house / 도자기 항아리 → +lounge / 금박 → +fine_dining·clothing_shop / 제주 차 세트 → +tea_house·lounge / 꿀 → +sweet_potato_cart·candy_shop / 꽃밭 포스터 → +flower_shop·hair_salon / 초롱 → +waterfall_shower.

#### 3.2.2 업그레이드 Lv1~3 (HSS2 탕 S/L/XL 규칙의 일반화)

HSS2에서 크기 단계가 있는 것은 탕뿐(25,000 → 120,000 → 200,000G, 인기 20→25→30, 경관 10→12→14). 이를 **모든 기능 시설(쉼·편의·먹거리·즐길거리·농원·랜드마크)** 에 "증축"으로 일반화한다. 경관 장식은 Lv 없음. 크기는 그대로(맵 재배치 불필요 — HSS2와 다른 점).

| 항목 | Lv1(건설) | Lv2 | Lv3 |
|---|---|---|---|
| 비용 | 건설비 | 건설비 × 0.8 | 건설비 × 1.5 |
| 공사 기간 | 티어별 1/3/7일 | 같음 | 같음 (공사 중 이용 불가) |
| 인기 | 기본 | +4 | +8 (씨앗 상한 40과 별도로 합산 → 최대 48) |
| 경관 | 기본 | +2 | +4 |
| 요금 | 기본 | +10% | +20% (좌석형은 메뉴 매출 +5% / +10%) |
| 유지비 | 건설비 1.5%/월 | ×1.25 | ×1.5 |
| 콤보 계수 | ×1.0 | ×1.25 | ×1.5 |
| 이용 정원(좌석형) | w×h | +1석 | +2석 |
| 조건 | — | 누적 이용 100회 **또는** 그 시설 종류 인기 30 이상 | 누적 이용 500회 **그리고** ★ ≥ 티어별(소 2·중 3·대 4) |
| 노후 리셋 | — | 증축 시 노후 0 | 증축 시 노후 0 |

동종 건설비 상승(+10%/동종)은 Lv 비용에도 적용(기준 = 현재 건설비). 스프라이트: Lv2는 간판/차양 추가, Lv3는 지붕 색 변경(트랙 A 렌더 후속, 데이터는 `level: 1|2|3`).

**티어별 예시(확정 수치)**

| 시설 | 티어 | Lv1 비용 / 인기 / 경관 / 요금 | Lv2 비용 / 인기 / 경관 / 요금 | Lv3 비용 / 인기 / 경관 / 요금 |
|---|---|---|---|---|
| table_out 야외 테이블 | 소 | 40만 / 10 / 0 / 메뉴 | 32만 / 14 / 2 / 메뉴+5% | 60만 / 18 / 4 / 메뉴+10% |
| photo_spot 포토존 | 소 | 100만 / 18 / 2 / 1,000 | 80만 / 22 / 4 / 1,100 | 150만 / 26 / 6 / 1,200 |
| tart_bakery 감귤 타르트 베이커리 | 중 | 450만 / 20 / 1 / 6,500 | 360만 / 24 / 3 / 7,150 | 675만 / 28 / 5 / 7,800 |
| footbath 족욕탕 | 소 | 40만 / 10 / 6 / 2,000 | 32만 / 14 / 8 / 2,200 | 60만 / 18 / 10 / 2,400 |
| open_air_footbath 노천 족욕탕 | 대 | 1,400만 / 30 / 20 / 8,000 | 1,120만 / 34 / 22 / 8,800 | 2,100만 / 38 / 24 / 9,600 |
| horse_riding 승마 체험 | 대 | 1,800만 / 30 / 2 / 20,000 | 1,440만 / 34 / 4 / 22,000 | 2,700만 / 38 / 6 / 24,000 |
| tangerine_tree 감귤나무(농원) | 소 | 60만 / 4 / 1 / 감귤 6개/월 | 48만 / 6 / 3 / 감귤 9개/월 | 90만 / 8 / 5 / 감귤 12개/월 |
| observatory 오름 전망대(랜드마크) | 대 | 2,000만 / 20 / 15 / 3,000 | 1,600만 / 24 / 17 / 3,300 | 3,000만 / 28 / 19 / 3,600 |

#### 3.2.3 노후·청결 (HSS2 Dirt → 제주 "청결")

| 항목 | 규칙 |
|---|---|
| 시설 노후 | 완공(또는 증축) 후 24개월 경과 시 6개월마다 인기 −1(최대 −6). 카드에 "낡았어요" 표시. 수리 = 건설비 × 10%, 노후 0으로 |
| 카페 청결 0~100 | 매일 −(손님 수 ÷ 20) 감소, 청소 직원(직종 `clean`) 1명당 하루 +(기술 ÷ 5) 회복, 청소 도구실 있으면 회복 ×1.5. 시작 100 |
| 청결 효과 | 80 이상: 만족 +3. 50 미만: 손님 수 ×0.8, 만족 −5. 30 미만: 손님 수 ×0.6, 슬픈 아이콘, 가이드북 심사 −10 |
| 청결 관련 시설 | restroom·cleaning_room·storage: 청결 감소 −20%씩(최대 −60%) |

### 3.3 아이템

#### 3.3.1 종류 체계 (HSS2 5종 + 제주 추가 2종)

| 종류 | HSS2 | 제주 | 사용 방법 | 데이터 파일 |
|---|---|---|---|---|
| 기능(메달 상점) | Carpenter·Hammer·Raffle Ticket·Seeds | 일꾼 삼춘·곡괭이·응모권·씨앗·스카우트권 | 즉시 사용 | `mileage_shop.json` |
| 응모권 추첨 | 유니폼·경관 씨앗·인기 열매 | 동일 | 추첨 → 인벤토리 | `ticket_shop.json` |
| 강화 아이템 | Store 18 | 20 (유지) | 시설 1개에 사용, "잘 맞는 시설"이면 효과 ×2 | `items.json` |
| 경관 장식 | Environment 33 | 경관 36 (+ 이동 속도 화분 3 신설) | 맵 배치 | `facilities.json`(scenery) |
| 특수 아이템 | (부탁 보상) | 12 (유지) + 6 신설 | 소지 시 상시 효과 / 해금 | `special_items.json` |
| 손님 선물 **(신설)** | — | 8 | 손님 카드 `선물하기` → 그 손님 타입 인기 +, 단골 확률 | `gifts.json` |
| 직원 연수권 **(신설)** | — | 5 | 직원 카드 `연수 보내기` → 3일 자리 비움, 스탯↑ | `trainings.json` (§3.6) |

**입수처 6종**: `mileage`(마일리지 상점) / `ticket`(응모권 추첨) / `goal`(목표 보상) / `guestEffect`(손님 효과 "아이템") / `quest`(부탁 보상) / `event`(이벤트·방문객 상품). 손님 효과 "아이템"은 만족 퇴장 시 25% 확률로 그 손님 타입의 `dropTable`에서 1개.

#### 3.3.2 마일리지 상점 (14 유지 + 6 추가 = 20)

| id | 이름 | 가격(마일리지) | 효과 | 상태 |
|---|---|---|---|---|
| ms_worker_3 | 일꾼 삼춘 고용(3번째) | 3 | 동시 건설 +1 | 유지 |
| ms_worker_4 | 일꾼 삼춘 고용(4번째) | 8 | 동시 건설 +1 | 유지 |
| ms_worker_5 | 일꾼 삼춘 고용(5번째) | 14 | 동시 건설 +1 | 유지 |
| ms_pickaxe | 돌담 철거 곡괭이 | 2 | 기본 돌담 1칸 철거 | 유지 |
| ms_ticket | 응모권 | 1 | 추첨 1회 | 유지 |
| ms_tangerine_seed | 감귤 씨앗 | 1 | 시설 인기 +5(상한 40) | 유지 |
| ms_hallabong_seed | 한라봉 씨앗 | 1 | 시설 요금 +5%(상한 +30%) | 유지 |
| ms_seed_pack | 씨앗 5개 묶음팩 | 4 | 감귤 3 + 한라봉 2 | 유지 |
| ms_jeju_tea_set / ms_comic_book / ms_glasses / ms_tv / ms_jeju_salt | 강화 아이템 5종 | 1 | §3.2.1 매핑 | 유지 |
| ms_scout | 직원 스카우트권 | 2 | 다음 채용 비용 무료 | 유지 |
| ms_pinball | 핀볼 기계 설계도 | 3 | 시설 `pinball` 해금 | **추가** (HSS2 Pinball 상점 구매) |
| ms_speed_plant | 활력 화분 | 2 | 경관 시설 `plant_speed`(이동 속도 +2) 해금 | **추가** (Plant) |
| ms_repair_kit | 수리 도구 세트 | 2 | 시설 1개 노후 0 (수리비 없이) | **추가** |
| ms_training_voucher | 연수 할인권 | 2 | 다음 연수 비용 50% | **추가** |
| ms_bus_contract | 투어 버스 한 달 계약권 | 3 | 이번 달 투어 버스 비용 무료 | **추가** |
| ms_gift_box | 제주 선물 상자 | 2 | 손님 선물 랜덤 2개 | **추가** |

마일리지 획득(유지): 월 손님 300명당 1, 가이드북 순위 3/2/1, 라이벌 대결 승리 2, 명소 방문객 상품(§3.4).

#### 3.3.3 응모권 상점 (8 유지 + 2 추가)

| id | 이름 | 응모권 | 효과 | 상태 |
|---|---|---|---|---|
| ts_uniform_1~5 | 하와이안 셔츠 / 갈옷 / 해녀복 / 제주 방언 티셔츠 / 산타복 | 3/6/10/15/25 | 유니폼(§3.6 효과) | 유지 |
| ts_scenery_seed | 경관 씨앗 | 4 | 경관물 경관 +3(상한 30) | 유지 |
| ts_popularity_fruit | 인기 열매 | 5 | 손님 1종 인기 +10 | 유지 |
| ts_draw | 응모권 추첨(인형뽑기) | 1 | 특별상 5% / 1등 10% / 2등 25% / 3등 30% / 참가상 30% | 유지 |
| ts_large_plant | 큰 활력 화분 | 6 | `plant_speed_large`(이동 속도 +3) 해금 | **추가** |
| ts_seasonal_plant | 계절 활력 화분 | 10 | `plant_speed_season`(이동 속도 +4) 해금 | **추가** |

추첨 등급 내용(유지): 특별상 = 유니폼 다음 단계, 1등 = 강화 아이템, 2등 = 씨앗, 3등 = 마일리지 1, 참가상 = 재료 상자(원두 10·우유 10).

#### 3.3.4 특수 아이템 신설 6 (기존 12 유지)

| id | 이름 | 효과 | 입수처 | 원형 |
|---|---|---|---|---|
| tour_bus_key | 투어 버스 열쇠 | 정류장 카드에 `투어 버스 계약` 버튼 해금 | goal:g55 | Tour Buses |
| hammer_bearing | 곰 삼춘의 망치 | 곶자왈 덤불 1칸 제거(치우기 비용 없음), 최대 10회 | mileage 4 (ms_hammer, 최대 10) | Bearington Hammer |
| little_guardian | 꼬마 돌하르방 | 배치 시 반경 2칸 경관물 경관 +1 | ticket 1등 | Little Statue |
| clean_charm | 삼다수 부적 | 청결 감소 −30% | goal:g53 | — |
| rank_shield | 별 지킴이 증서 | ★ 유지 심사 1회 면제(소모) | guidebook 1위 | — |
| golden_tangerine | 황금 감귤 | 경관 +12(여름 +18) 장식 `golden_tangerine_tree` 해금 | 명소 방문객 10만 | Lily Pond |

#### 3.3.5 손님 선물 8 (신설, `gifts.json`)

손님 카드에서 `선물하기`(하루 1회, 재고 소모). 효과: 그 손님 **타입** 인기 +3, 그 손님 개체 만족 +20, 단골 전환 확률 +10%p. 잘 맞는 손님층(tag)이면 효과 ×2.

| id | 이름 | 잘 맞는 손님층 | 입수처 |
|---|---|---|---|
| gift_tangerine_box | 감귤 한 상자 | senior | 감귤나무 월 수확 10개 소모로 제작(카페 창) |
| gift_hallabong_jam | 한라봉 잼 | female | jam_workshop 보유 시 월 1개 |
| gift_peanut_bag | 땅콩 봉지 | youth | quest q_kid_pocketmoney |
| gift_stone_charm | 돌하르방 열쇠고리 | group | souvenir 보유 시 월 2개 |
| gift_tea_pack | 녹차 티백 세트 | adult | tea_field 보유 시 월 1개 |
| gift_postcard | 오름 엽서 | female | photo_spot 보유 시 월 2개 |
| gift_honey_jar | 꿀단지 | senior | beehive 보유 시 월 1개 |
| gift_seashell | 소라 껍데기 | youth | quest q_haenyeo |

### 3.4 관광 명소 24 — Lv1~5 조건·효과 (HSS2 빈칸 확정)

명소 표(24곳, 4분류 × 6, `spots.json`)는 유지. 바뀌는 것: 투자금(Lv3 이상 상향), Lv2~5 **추가 조건**, Lv별 **효과**, 방문객·투어 버스·투어 개최 신설.

#### 3.4.1 투자금 (순서 k = 분류 안 1~6번째)

| 순서 k | 기준 B_k | Lv1 (×1) | Lv2 (×2) | Lv3 (×4.5) | Lv4 (×8) | Lv5 (×13) | 합계 |
|---|---|---|---|---|---|---|---|
| 1 | 500,000 | 500,000 | 1,000,000 | 2,250,000 | 4,000,000 | 6,500,000 | 14,250,000 |
| 2 | 750,000 | 750,000 | 1,500,000 | 3,375,000 | 6,000,000 | 9,750,000 | 21,375,000 |
| 3 | 1,000,000 | 1,000,000 | 2,000,000 | 4,500,000 | 8,000,000 | 13,000,000 | 28,500,000 |
| 4 | 1,300,000 | 1,300,000 | 2,600,000 | 5,850,000 | 10,400,000 | 16,900,000 | 37,050,000 |
| 5 | 1,650,000 | 1,650,000 | 3,300,000 | 7,425,000 | 13,200,000 | 21,450,000 | 47,025,000 |
| 6 | 2,000,000 | 2,000,000 | 4,000,000 | 9,000,000 | 16,000,000 | 26,000,000 | 57,000,000 |

24곳 전부 Lv5 = 4 × 205,200,000 = **8억 2,080만** (10년 플레이 총 투자처의 중심).

#### 3.4.2 Lv별 조건·효과 (전 명소 공통)

방문객/일 = 매력 × 2 (투어 버스 시 ×1.3). 카페 유입 = 방문객/일 × 3% (손님 스폰 배수에 가산). 매력은 `spots.json` levels[].appeal 유지(Lv1 9~44 → Lv5 55~163).

| Lv | 투자금 | 추가 조건 | 효과(누적) | 해금 |
|---|---|---|---|---|
| 1 | B_k | 앞 명소 Lv4(1번째는 시작·랭크) | 매력 Lv1, 분류 태그 손님 ×1.05 | — |
| 2 | 2 B_k | 누적 방문객 1,000 | 매력 Lv2, 태그 ×1.10 | `lv2GuestId` 손님 해금 + 부탁 |
| 3 | 4.5 B_k | 누적 방문객 5,000 **그리고** 2년차 이상 | 매력 Lv3, 태그 ×1.15, 분류 대응 시설 요금 +2% | 강화 아이템 1(명소별 지정) |
| 4 | 8 B_k | 누적 방문객 15,000 **그리고** Lv2 손님 인기 40 | 매력 Lv4, 태그 ×1.20, 전 좌석 경관 +1 | `lv4QuestId` 부탁 + 다음 명소 개방 |
| 5 | 13 B_k | 누적 방문객 40,000 **그리고** ★(k=1·2 → ★3, k=3·4 → ★4, k=5·6 → ★5) | 매력 Lv5, 태그 ×1.25, 요금 +5%, 전 좌석 경관 +2 | 마일리지 10 + 특수 손님(k=6만) |

분류 → 태그·시설 대응: 볼거리(sight) → `female` · 쉼 / 먹거리(food) → `group` · 먹거리 / 놀거리(play) → `youth` · 즐길거리 / 자연(nature) → `senior` · 쉼(족욕). 같은 태그 누적 배수 상한 ×2.0.

#### 3.4.3 명소별 Lv3 아이템·Lv5 특수 (24행)

| 분류 | 명소 id | Lv3 아이템 | Lv5 특수 |
|---|---|---|---|
| sight | canola_field | flower_poster | — |
| sight | sangumburi | oreum_poster | — |
| sight | camellia_hill | folk_scroll | — |
| sight | seongsan | gold_leaf | — |
| sight | bijarim | jeju_tea_set | — |
| sight | manjanggul | lantern | 손님 `noble_family`(귀족 가족 → "박물관장 가족") 해금 |
| food | dongmun_market | jeju_salt | — |
| food | noodle_street | comic_book | — |
| food | black_pork_street | tv | — |
| food | haenyeo_house | conch_shell | — |
| food | udo_peanut_village | honey | — |
| food | barley_brewery | pottery_jar | 손님 `golfer` 인기 +20 |
| play | olle_trail | sneakers | — |
| play | horse_ranch | galot_cushion | — |
| play | jungmun_surf | conch_shell | — |
| play | udo_bike | sneakers | — |
| play | theme_park | dolhareubang_mini | — |
| play | yacht_tour | gold_leaf | 손님 `yacht_owner` 소지금 ×1.5 |
| nature | oreum | oreum_poster | — |
| nature | gotjawal | seaweed_fertilizer | — |
| nature | hallasan | jeju_tea_set | — |
| nature | jeongbang_falls | lantern | — |
| nature | yongmeori_coast | pottery_jar | — |
| nature | baengnokdam | lp_record | 손님 `hallasan_spirit` 상시 출현 |

#### 3.4.4 방문객 상품 (HSS2 "Visitors 목표 상품")

명소별 누적 방문객: 1,000 → 응모권 1 / 5,000 → 마일리지 3 / 20,000 → 감귤 씨앗 2 / 50,000 → 씨앗 5개 묶음팩 / 100,000 → `golden_tangerine`(1회, 전체 합산 기준).

#### 3.4.5 투어 버스·투어 개최

| 항목 | 규칙 |
|---|---|
| 투어 버스 계약 | `tour_bus_key` 보유 후 정류장 카드 → 월 500,000원(월초 차감). 효과: 전 명소 방문객 ×1.3, 단체(`group`) 손님 ×1.3, 겨울(12~2월) 숙박형 손님(체류 시간 ×1.5) |
| 투어 개최 | 2년차부터 월 1회 부탁(대화창): 명소 1곳 선택 → 점수 = 매력 + 30×(그 명소 태그 손님 인기 ÷ 100) + 콤보 수 → 60 이상 성공: 자금 = 점수 × 20,000원 + 방문객 +2,000, 실패: 자금 100만 + 방문객 +500 |

### 3.5 목표 체인 108 (goals.json 60 → 108)

HSS2의 진행 축은 "타깃 손님 만족 → 부탁 → 다음 손님·시설"(§1.5)과 "명소 Lv·★·랭크 해금"이다. v3의 목표 체인은 이 축을 **한 줄 순차 목표**로 압축한 것이다. 확장 원칙: (1) 앞 20개는 v3 스펙 그대로(3월~6월 완료). (2) 21번부터 HSS2 부탁 체인의 이름·순서를 제주로 옮겨 시설 해금을 목표 보상에 싣는다. (3) 난이도: 자금 목표는 700만 → 1,200만 → 2,500만 → 5,000만 → 1억 → 3억 → 5억(각 단계 ≈ ×2), 손님 목표는 5 → 20 → 50 → 100 → 300 → 500 → 1,000 → 2,000 → 5,000 → 10,000 → 30,000. (4) 예상 달성 시기는 §4의 봇 KPI 기준.

**조건 타입 (기존 19 + 신설 14)**

| 타입 | 파라미터 | 뜻 | 상태 |
|---|---|---|---|
| guests / satisfied / regular / namedGuest | n | 누적 손님 / 만족 퇴장 / 단골 / 이름 있는 손님 | 기존 |
| menuSold(menuId,n) / menus(n) / recipes(n) | | 메뉴 판매·메뉴판 수·개발 레시피 | 기존 |
| money / monthIncome | n | 현재 자금 / 지난달 매출 | 기존 / **신설** |
| staff(n) / staffLevel(lv,n) / trainings(n) | | 직원 수 / Lv 이상 직원 n명 / 연수 완료 횟수 | 기존 / **신설** / **신설** |
| facilities(category?,n) / facilityLv(lv,n) | | 시설 수 / Lv 이상 시설 n개 | 기존 / **신설** |
| parcels / rocks / promotions / year / stars / cafeRank / rank / rivalWins | n | 필지·바위·홍보·년차·★·카페 랭크·가이드북 순위·라이벌 승 | 기존 |
| comboCount(n) / setCount(n) / spotEffect(n) | | 활성 콤보 / 세트 / 명당 수 | **신설** |
| spotLevel(spotId,lv) / spotAny(lv,n) / visitorsTotal(n) | | 특정 명소 Lv / Lv 이상 명소 n곳 / 전 명소 누적 방문객 | **신설** |
| guestType(guestId,popularity) | | 손님 타입 인기 | **신설** (HSS2 "Lv40/50/60") |
| guidebookRank(bookId,n) / guidebookWins(n) | | 특정 가이드북 n위 안 / 1위 횟수 | **신설** |
| cleanliness(n) / profitMonths(n) / tourGroup(n) / itemsUsed(n) / uniforms(n) | | 청결 n 이상 한 달 / 연속 흑자 달 / 투어 개최 / 강화 아이템 사용 / 유니폼 단계 | **신설** |
| custom(id) | | 코드 판정(100주년 등) | 기존 |

**보상 타입**: money / unlockFacility(id) / unlockMenu(id) / tickets(n) / mileage(n) / staffSlot(role,n) / research(n) / builder(n) / unlockFeature(id) / unlockRole(id) / item(id,n) / unlockGuest(id) / unlockRecruit(tierId) / unlockGuidebook(id) / seed(kind,n).

**목표 표 108** (열: # | id | 제목 | 조건 | 보상 | 예상 시기 | HSS2 원형/비고)

| # | id | 제목 | 조건 | 보상 | 시기 | 원형 |
|---|---|---|---|---|---|---|
| 1 | g01 | 아메리카노 한 잔 팔기 | menuSold americano 1 | money 300,000 | 1년 3월 | 튜토리얼 |
| 2 | g02 | 손님 5명 맞이 | guests 5 | money 500,000 | 1년 3월 | |
| 3 | g03 | 자리 4개 만들기 | facilities rest 4 | unlockFacility terrace_seat | 1년 3월 | Tatami×Tatami |
| 4 | g04 | 직원 1명 채용 | staff 1 | tickets 1 | 1년 3월 | Attract Passerby |
| 5 | g05 | 손님 20명 맞이 | guests 20 | unlockMenu green_tea | 1년 3월 | |
| 6 | g06 | 감귤주스 10잔 | menuSold tangerine_juice 10 | unlockFacility deco_flower_pots | 1년 4월 | |
| 7 | g07 | 만족 손님 10명 | satisfied 10 | research 10, unlockFeature promote | 1년 4월 | Marketing |
| 8 | g08 | 홍보 1회 하기 | promotions 1 | money 300,000 | 1년 4월 | |
| 9 | g09 | 손님 50명 맞이 | guests 50 | unlockFacility bench_stonewall | 1년 4월 | |
| 10 | g10 | 시설 5개 짓기 | facilities 5 | builder 1 | 1년 4월 | Carpenter |
| 11 | g11 | 자금 700만 모으기 | money 7,000,000 | unlockFeature parcel, money 300,000 | 1년 5월 | |
| 12 | g12 | 필지 1개 사기 | parcels 2 | unlockFeature clearRock | 1년 5월 | Bearington Hammer |
| 13 | g13 | 바위 3개 치우기 | rocks 3 | unlockFacility canola | 1년 5월 | |
| 14 | g14 | 손님 100명 맞이 | guests 100 | unlockFacility restroom, research 5 | 1년 5월 | |
| 15 | g15 | 직원 2명 채용 | staff 2 | staffSlot barista 1, unlockMenu toast | 1년 5월 | |
| 16 | g16 | 메뉴 4개 올리기 | menus 4 | unlockFeature craft, research 10 | 1년 6월 | Cooking |
| 17 | g17 | 레시피 1개 개발 | recipes 1 | money 1,000,000 | 1년 6월 | |
| 18 | g18 | 카페 랭크 2 달성 | cafeRank 2 | unlockFeature popup, tickets 2 | 1년 6월 | Rank |
| 19 | g19 | 단골 1명 만들기 | regular 1 | tickets 3 | 1년 6월 | |
| 20 | g20 | 손님 300명 맞이 | guests 300 | unlockFacility handdrip_bar, mileage 5 | 1년 6월 | 1년 6월 Hot Spring Bath |
| 21 | g21 | 첫 콤보 만들기 | comboCount 1 | unlockFacility footbath | 1년 7월 | Rest Stop×Hot Spring |
| 22 | g22 | 만족 손님 100명 | satisfied 100 | unlockMenu cookie | 1년 7월 | |
| 23 | g23 | 시설 10개 짓기 | facilities 10 | unlockFacility vending | 1년 7월 | Rank 7 Vending |
| 24 | g24 | 홍보 3회 하기 | promotions 3 | unlockMenu iced_tea | 1년 7월 | |
| 25 | g25 | '친절 카페' 5위 안 들기 | guidebookRank gb_kind_cafe 5 | unlockFacility rest_pavilion, tickets 2 | 1년 9월(발표) | Local Springs 1년 7월 |
| 26 | g26 | 청결 80 한 달 유지 | cleanliness 80 | unlockFacility cleaning_room, unlockRole clean | 1년 8월 | Dirt / Linen Room |
| 27 | g27 | 자금 1,200만 | money 12,000,000 | unlockFacility souvenir | 1년 9월 | |
| 28 | g28 | 직원 3명 채용 | staff 3 | staffSlot cook 1, unlockMenu scone | 1년 9월 | |
| 29 | g29 | 유채꽃밭 Lv2 | spotLevel canola_field 2 | unlockFacility photo_spot, money 500,000 | 1년 9월 | Canola Flowers Lv2 |
| 30 | g30 | 손님 500명 맞이 | guests 500 | unlockFacility dolhareubang, money 500,000 | 1년 10월 | |
| 31 | g31 | 필지 2개 사기 | parcels 3 | unlockFacility carrot_field(v3 농원) | 1년 10월 | |
| 32 | g32 | 감귤주스 100잔 | menuSold tangerine_juice 100 | unlockMenu tangerine_ade | 1년 10월 | |
| 33 | g33 | 직원 연수 1회 보내기 | trainings 1 | unlockFacility massage_chair | 1년 11월 | Rank 8 Massage Chair |
| 34 | g34 | 레시피 2개 개발 | recipes 2 | unlockMenu carrot_juice, research 10 | 1년 11월 | |
| 35 | g35 | 콤보 3개 만들기 | comboCount 3 | unlockFacility capsule_machine | 1년 11월 | 1년 9월 Gumball |
| 36 | g36 | 2년차 맞이하기 | year 2 | unlockRole carry, money 1,000,000 | 2년 1월 | |
| 37 | g37 | ★2 카페 되기 | stars 2 | unlockFacility tea_field, unlockMenu cheesecake | 2년 2월 | ★2 Ceramics |
| 38 | g38 | 이름 있는 손님 3명 | namedGuest 3 | tickets 3 | 2년 2월 | |
| 39 | g39 | 단골 3명 만들기 | regular 3 | unlockFacility toenmaru | 2년 3월 | |
| 40 | g40 | 명소 2곳 Lv2 | spotAny 2 2 | unlockFacility lemonade_cart | 2년 3월 | Chief Maid Lemonade |
| 41 | g41 | 시설 증축 1개(Lv2) | facilityLv 2 1 | unlockFacility drum_footbath | 2년 4월 | Spring Bath (L) |
| 42 | g42 | 손님 1,000명 | guests 1000 | unlockFacility bike_rack, mileage 10 | 2년 4월 | |
| 43 | g43 | '동네 맛집 지도' 3위 안 | guidebookRank gb_local_map 3 | unlockFacility tea_house, research 20 | 2년 3월(발표) | Tea Master Tea Room |
| 44 | g44 | 커플 손님 인기 30 | guestType couple 30 | unlockFacility flower_shop | 2년 5월 | Bonsai Artist Flower Shop |
| 45 | g45 | 시설 20개 짓기 | facilities 20 | builder 1 | 2년 5월 | |
| 46 | g46 | 만족 손님 500명 | satisfied 500 | unlockMenu egg_sandwich | 2년 6월 | |
| 47 | g47 | 자금 2,500만 | money 25,000,000 | unlockFacility deco_lamp_post, unlockFeature challenge | 2년 7월 | |
| 48 | g48 | 세트 효과 1개 | setCount 1 | unlockFacility cauldron_footbath | 2년 7월 | Bath Effects |
| 49 | g49 | 필지 4개 가지기 | parcels 4 | unlockFacility cedar | 2년 8월 | |
| 50 | g50 | 바위 10개 치우기 | rocks 10 | unlockFacility basalt_rock, money 1,000,000 | 2년 8월 | |
| 51 | g51 | 홍보 10회 | promotions 10 | unlockMenu hot_choco | 2년 9월 | |
| 52 | g52 | 직원 4명 채용 | staff 4 | staffSlot hall 1 | 2년 9월 | |
| 53 | g53 | 6개월 연속 흑자 | profitMonths 6 | unlockFacility atm, item clean_charm 1, mileage 10 | 2년 10월 | ATM |
| 54 | g54 | 레시피 5개 개발 | recipes 5 | unlockMenu carrot_cake, research 20 | 2년 10월 | |
| 55 | g55 | 명소 방문객 5,000명 | visitorsTotal 5000 | item tour_bus_key 1, unlockFacility parking | 2년 11월 | Tour Buses |
| 56 | g56 | 3년차 맞이하기 | year 3 | unlockFacility deco_mailbox, tickets 5 | 3년 1월 | |
| 57 | g57 | ★3 카페 되기 | stars 3 | unlockFacility deco_dolhareubang_set, staffSlot hall 1 | 3년 2월 | ★3 Archery |
| 58 | g58 | 손님 2,000명 | guests 2000 | unlockFacility deco_water_jar_set, mileage 10 | 3년 2월 | |
| 59 | g59 | 콤보 8개 | comboCount 8 | unlockFacility pingpong | 3년 3월 | Professor Ping Pong |
| 60 | g60 | 명소 1곳 Lv3 | spotAny 3 1 | unlockFacility brunch_house | 3년 4월 | Eggeria Lv4 Modern Restaurant |
| 61 | g61 | 이름 있는 손님 10명 | namedGuest 10 | unlockMenu tangerine_scone | 3년 4월 | |
| 62 | g62 | 단골 10명 | regular 10 | unlockRole guide, money 2,000,000 | 3년 5월 | |
| 63 | g63 | 시설 증축 Lv3 1개 | facilityLv 3 1 | unlockFacility open_air_footbath | 3년 6월 | Open-Air Bath |
| 64 | g64 | '제주도 카페 지도' 3위 안 | guidebookRank gb_jeju_map 3 | unlockFacility deco_tangerine_crates, research 20 | 3년 3월/9월 | Prefectural Springs |
| 65 | g65 | 라이벌 대결 1승 | rivalWins 1 | unlockMenu croissant, tickets 3 | 3년 7월 | |
| 66 | g66 | 직원 Lv5 1명 | staffLevel 5 1 | unlockFacility yoga_class | 3년 8월 | Salon×Yoga |
| 67 | g67 | 필지 6개 | parcels 6 | builder 1, money 2,000,000 | 3년 9월 | |
| 68 | g68 | 시설 40개 | facilities 40 | unlockMenu carrot_soup | 3년 10월 | |
| 69 | g69 | 자금 5,000만 | money 50,000,000 | mileage 20 | 3년 12월 | |
| 70 | g70 | 명소 방문객 1만 | visitorsTotal 10000 | unlockFacility mini_bowling | 3년 12월 | ★5 Bowling(완화) |
| 71 | g71 | 투어 개최 1회 성공 | tourGroup 1 | unlockFacility concert_hall | 3년 12월 | Tour Groups / Auditorium |
| 72 | g72 | 4년차 맞이하기 | year 4 | tickets 5, unlockFacility retro_arcade | 4년 1월 | Pro Gamer Arcade |
| 73 | g73 | 라이벌 3승 | rivalWins 3 | unlockMenu yuja_tea, tickets 5 | 4년 3월 | |
| 74 | g74 | ★4 카페 되기 | stars 4 | staffSlot barista 1, staffSlot cook 1, unlockFacility waterfall_shower | 4년 4월 | ★4 Waterfall |
| 75 | g75 | 손님 5,000명 | guests 5000 | money 5,000,000 | 4년 5월 | |
| 76 | g76 | 세트 효과 3개 | setCount 3 | unlockFacility lounge | 4년 6월 | Nobleman Lounge |
| 77 | g77 | 콤보 15개 | comboCount 15 | unlockFacility fine_dining | 4년 7월 | Governor Exclusive Restaurant |
| 78 | g78 | 명소 4곳 Lv4 | spotAny 4 4 | unlockFacility archery_range | 4년 8월 | |
| 79 | g79 | 유니폼 3단계 | uniforms 3 | unlockFacility hair_salon | 4년 9월 | Beautician Salon |
| 80 | g80 | 직원 6명 | staff 6 | staffSlot carry 1, unlockRecruit rc_intern | 4년 10월 | Call for Interns |
| 81 | g81 | 월 매출 2,000만 | monthIncome 20,000,000 | unlockFacility sauna_hut | 4년 11월 | Overseas Tour Sauna |
| 82 | g82 | 단골 20명 | regular 20 | mileage 30 | 4년 12월 | |
| 83 | g83 | 자금 1억 | money 100,000,000 | unlockFacility magic_stage, builder 1 | 5년 2월 | Arcade Lv4 Magician |
| 84 | g84 | 강화 아이템 20개 사용 | itemsUsed 20 | unlockFacility vintage_shop | 5년 3월 | Landlord Antique |
| 85 | g85 | 가이드북 1위 3회 | guidebookWins 3 | unlockFacility clothing_shop | 5년 3월 | Boutique |
| 86 | g86 | 필지 9개 다 사기 | parcels 9 | money 10,000,000 | 5년 5월 | |
| 87 | g87 | 명소 방문객 5만 | visitorsTotal 50000 | unlockFacility home_theater | 5년 6월 | Movie Director Home Theater |
| 88 | g88 | 직원 Lv8 2명 | staffLevel 8 2 | unlockFacility flower_workshop | 5년 8월 | Florist Flower Workshop |
| 89 | g89 | 손님 1만 명 | guests 10000 | unlockFacility candy_shop | 5년 10월 | Chocolatier Candy Store |
| 90 | g90 | 6년차 맞이하기 | year 6 | tickets 10 | 6년 1월 | |
| 91 | g91 | ★5 전설의 카페 | stars 5 | money 50,000,000 | 6년 3월 | ★5 |
| 92 | g92 | '전국 카페 투어' 1위 | guidebookRank gb_national_tour 1 | tickets 10, research 30 | 6년 9월 | Touring Japan |
| 93 | g93 | 콤보 30개 | comboCount 30 | unlockFacility marble_game | 6년 12월 | |
| 94 | g94 | 세트 효과 6개 | setCount 6 | unlockFacility shooting_booth | 7년 3월 | Hunter Pop Gun |
| 95 | g95 | 시설 Lv3 10개 | facilityLv 3 10 | unlockFacility tarot_booth | 7년 6월 | Fortuneteller |
| 96 | g96 | 명소 12곳 Lv5 | spotAny 5 12 | unlockFacility observatory | 7년 12월 | |
| 97 | g97 | 단골 30명 | regular 30 | mileage 50 | 8년 3월 | |
| 98 | g98 | 라이벌 10승 | rivalWins 10 | unlockFacility massage_booth | 8년 6월 | Masseur |
| 99 | g99 | 자금 3억 | money 300,000,000 | builder 1, mileage 30 | 8년 9월 | |
| 100 | g100 | 손님 3만 명 | guests 30000 | money 30,000,000 | 8년 12월 | |
| 101 | g101 | 직원 Lv10 1명 | staffLevel 10 1 | staffSlot guide 1 | 9년 3월 | |
| 102 | g102 | 24개월 연속 흑자 | profitMonths 24 | mileage 50 | 9년 6월 | |
| 103 | g103 | 명소 24곳 전부 Lv5 | spotAny 5 24 | money 50,000,000, tickets 20 | 9년 9월 | |
| 104 | g104 | '리본 서베이' 1위 | guidebookRank gb_ribbon_survey 1 | research 100, mileage 50 | 9년 9월 | Le Nichelin |
| 105 | g105 | 자금 5억 | money 500,000,000 | unlockGuest seolmundae | 9년 12월 | |
| 106 | g106 | 월 매출 1억 | monthIncome 100,000,000 | tickets 20 | 10년 2월 | |
| 107 | g107 | 10년차 결산 | year 10 | money 100,000,000 (엔딩 점수 카드) | 10년 3월 | Ending 10년차 3월 |
| 108 | g108 | 100주년 감귤축제 | custom centennial | item millennium_seed 1 | 연장 플레이 | Millenium Pine |

**부탁(quests.json 103)과의 관계**: 부탁은 그대로 손님 체인을 연다(HSS2 Targets 축). 목표는 부탁과 **독립된 한 줄**이며, 목표 보상의 `unlockFacility`가 현재 `facilities.json`의 `unlock`(quest/segment/star/rank)과 겹치면 **먼저 오는 쪽**이 연다(둘 다 유효). 목표에서 새로 여는 시설 34종은 `unlock: {type:'goal', id}`로 바꾼다.

**실패·지연 규칙** (§4.4와 연동): 6개월 연속 적자로 "삼춘 대출"을 받으면 그 시점의 목표 보상 중 `money`는 50%, `tickets/mileage`는 절반(내림)으로 지급되고, 대출 상환(300만)까지 유지.

### 3.6 직원 — 직종 8·스탯 상한·급여·승급·연수·특기 30

#### 3.6.1 직종 8 (`staff_roles.json`, `field` 삭제)

HSS2는 직종이 없고 4스탯이 모든 업무 효율을 정한다(§1.6). 우리는 v2의 역할 배치를 유지하되 HSS2가 스탯으로 표현한 업무(청소·홍보·야생동물)를 직종으로 드러낸다.

| id | 이름 | 주 스탯 | 하는 일 | 해금 | 상태 |
|---|---|---|---|---|---|
| barista | 바리스타 | 기술 | 음료 조리 속도·품질 | 시작 | 유지 |
| cook | 요리사 | 기술 | 디저트·식사 조리 | 시작 | 유지 |
| hall | 홀 | 미소 | 서빙·손님 기분(만족 +), 가이드북 '미소' 점수 | 시작 | 유지 |
| carry | 운반 | 힘 | 재료 입고 속도, 창고 용량 +20/명, 야생동물(까치·노루) 쫓기 | goal:g36 | 유지 |
| guide | 안내 | 미소 | 단체 손님 만족 +10%, 투어 개최 점수 +5 | goal:g62 | 유지 |
| clean | 청소 | 기술·힘 | 청결 회복 (기술÷5 + 힘÷10)/일 | goal:g26 | **신설** (HSS2 Dirt) |
| farm | 농원지기 | 힘 | 농원 시설 수확량 +50%(1명당, 최대 2명), 노후 −50% | 농원 시설 3개 | **신설** |
| promo | 홍보 담당 | 미소 | 홍보 활동 기력 소모 −50%, 효과 +20% | 랭크 4 | **신설** (HSS2 Marketing) |

직원 슬롯 = 기본 3 + `staff_room`(직원 휴게실) 1개당 +3 (HSS2 Break Room 규칙, 최대 휴게실 3개) + 목표 보상 `staffSlot`. 배치 안 된 직원(`role: null`)은 급여 50%.

#### 3.6.2 스탯 상한 개별화 (HSS2 per-stat cap) — 직원 풀 27

현재는 직원당 단일 `statCap`. HSS2처럼 **스탯별 상한**으로 바꾼다: `cap_i = clamp(round(초기치_i × 1.8 + 10), 20, statCap)`. 열: id | 이름 | 채용 단계 | 체력 초기/상한 | 힘 | 기술 | 미소 | 최대 Lv | 기본급 | Lv5 급여(§3.6.3) | HSS2 대응.

| id | 이름 | 단계 | 체력 | 힘 | 기술 | 미소 | 최대 Lv | 기본급 | Lv5 급여 | 대응 |
|---|---|---|---|---|---|---|---|---|---|---|
| st_kim_minjun | 김민준 | 1 | 30/60 | 25/55 | 10/28 | 15/37 | 5 | 400,000 | 720,000 | Jacques Cuzzi |
| st_lee_seoyeon | 이서연 | 1 | 15/37 | 10/28 | 20/46 | 30/60 | 5 | 450,000 | 795,000 | Bobby Freeman |
| st_park_doyun | 박도윤 | 1 | 20/46 | 15/37 | 30/60 | 12/32 | 5 | 450,000 | 797,000 | Stella Fielding |
| st_kang_siwoo | 강시우 | 1 | 35/65 | 40/65 | 5/20 | 10/28 | 5 | 500,000 | 890,000 | Sylvia Boon |
| st_jang_yejun | 장예준 | 1 | 25/55 | 20/46 | 12/32 | 28/60 | 6 | 500,000 | 885,000 | (추가) |
| st_jeong_haeun | 정하은 | 2 | 22/50 | 22/50 | 22/50 | 22/50 | 6 | 550,000 | 968,000 | Flora Butterworth |
| st_yoon_jia | 윤지아 | 2 | 18/42 | 12/32 | 35/70 | 25/55 | 6 | 650,000 | 1,130,000 | Ryan West |
| st_han_jiho | 한지호 | 2 | 35/73 | 30/64 | 30/64 | 30/64 | 7 | 800,000 | 1,405,000 | Charles Pendragon |
| st_oh_sua | 오수아 | 2 | 25/55 | 20/46 | 50/80 | 30/64 | 7 | 950,000 | 1,645,000 | (추가) |
| st_seo_junseo | 서준서 | 2 | 28/60 | 22/50 | 55/80 | 28/60 | 7 | 950,000 | 1,653,000 | (추가) |
| st_shin_yuna | 신유나 | 3 | 30/64 | 20/46 | 25/55 | 55/80 | 7 | 900,000 | 1,570,000 | Terry Sandman |
| st_kwon_dohyun | 권도현 | 3 | 45/80 | 40/80 | 25/55 | 25/55 | 7 | 850,000 | 1,495,000 | Rose Hillier |
| st_hwang_harin | 황하린 | 3 | 30/64 | 25/55 | 45/85 | 35/73 | 8 | 1,000,000 | 1,735,000 | Igazo Shinobu |
| st_song_jimin | 송지민 | 3 | 30/64 | 25/55 | 35/73 | 50/85 | 8 | 1,000,000 | 1,740,000 | Gail Miller |
| st_ryu_siyun | 류시윤 | 3 | 35/73 | 35/73 | 55/85 | 25/55 | 8 | 1,050,000 | 1,830,000 | (추가) |
| st_go_hyunwoo | 고현우 | 4 | 45/90 | 40/82 | 55/90 | 70/90 | 9 | 1,400,000 | 2,450,000 | Mary Piper |
| st_moon_naeun | 문나은 | 4 | 50/95 | 45/91 | 80/95 | 55/95 | 9 | 1,700,000 | 2,950,000 | Tina Waters |
| st_yang_junhyuk | 양준혁 | 4 | 50/95 | 45/91 | 85/95 | 55/95 | 9 | 1,700,000 | 2,955,000 | Mabel Lee |
| st_son_yerin | 손예린 | 4 | 55/95 | 40/82 | 55/95 | 85/95 | 9 | 1,650,000 | 2,875,000 | Emily Angelou |
| st_bae_jihun | 배지훈 | 4 | 90/95 | 80/95 | 40/82 | 45/91 | 9 | 1,500,000 | 2,655,000 | (추가) |
| st_baek_soyul | 백소율 | 5 | 65/100 | 60/100 | 65/100 | 65/100 | 10 | 1,900,000 | 3,295,000 | Summer Brownstone |
| st_heo_taeyang | 허태양 | 5 | 55/100 | 50/100 | 85/100 | 50/100 | 10 | 1,900,000 | 3,280,000 | Florence Seacole |
| st_sim_arin | 심아린 | 5 | 55/100 | 50/100 | 80/100 | 60/100 | 10 | 2,000,000 | 3,445,000 | Tammy Walker |
| st_retired_haenyeo | 고순덕 | 5 | 80/100 | 70/100 | 50/100 | 60/100 | 10 | 1,600,000 | 2,820,000 | Gemma Platt |
| st_nam_jiwon | 남지원 | 5 | 50/100 | 40/82 | 55/100 | 80/100 | 10 | 2,200,000 | 3,745,000 | (추가) |
| st_pony_special | 조랑말 알바 | 특수 | 99/120 | 99/120 | 60/118 | 99/120 | 12 | 1,000,000 | 1,957,000 | Buttons(소라) |
| st_dolhareubang | 돌하르방 | 특수 | 99/120 | 99/120 | 99/120 | 99/120 | 12 | 2,200,000 | 3,916,000 | (추가, 카이로군 대체) |

응모권 특별상(유니폼 획득)마다 전 직원 상한 +5(HSS2 "special prize로 상한 돌파" 규칙, 최대 +25).

#### 3.6.3 급여표·승급

- 월급 = 기본급 × (1 + 0.15 × (Lv − 1)) + 스탯 합 × 1,000원. (현재: 스탯당 3,000 + Lv당 20만 → 폐지)
- 매년 3월 1일 "급여 인상 요구" 대화: 수락 시 전 직원 기본급 +5%(누적), 거절 시 기력 회복 −20% 그해.
- 승급(레벨업) 조건: 경험치 ≥ 120 × Lv **그리고** 연구 20 × Lv 소모(플레이어가 직원 카드에서 `승급`). 경험치 = 근무일 1 + 서빙·조리 1건당 0.2. 레벨업 효과: 주 스탯 +3, 나머지 +1(상한 내). 최대 Lv는 표 값.

| 기본급 | Lv1 | Lv3 | Lv5 | Lv7 | Lv10 |
|---|---|---|---|---|---|
| 400,000 | 400,000 | 520,000 | 640,000 | 760,000 | 940,000 |
| 1,000,000 | 1,000,000 | 1,300,000 | 1,600,000 | 1,900,000 | 2,350,000 |
| 2,200,000 | 2,200,000 | 2,860,000 | 3,520,000 | 4,180,000 | 5,170,000 |

(+ 스탯 합 × 1,000: 초기 80~260 → 8만~26만, 만렙 ~380 → 38만)

#### 3.6.4 연수 5종 (신설, `trainings.json`) — 해금: 카페 랭크 3

직원 카드 `연수 보내기` → 기간 동안 자리 비움(급여는 나감) → 복귀 시 스탯 상승(상한 내). 같은 직원의 n번째 연수 비용 = 기본 × (1 + 0.2 × (n − 1)).

| id | 이름 | 비용 | 기간 | 효과 | 조건 |
|---|---|---|---|---|---|
| tr_barista | 바리스타 연수 | 1,000,000 | 3일 | 기술 +6 | — |
| tr_service | 서비스 연수 | 800,000 | 3일 | 미소 +6 | — |
| tr_stamina | 오름 체력 캠프 | 600,000 | 3일 | 체력 +6 | — |
| tr_strength | 물허벅 지기 훈련 | 600,000 | 3일 | 힘 +6 | — |
| tr_master | 종합 연수(육지 출장) | 2,000,000 | 5일 | 전 스탯 +3, 특기 1개 랜덤 획득(없는 것 중) | ★3, Lv ≥ 5 |

#### 3.6.5 특기 30 (`skills.json` 20 유지 + 10)

| id | 이름 | 효과 | 상태 |
|---|---|---|---|
| (기존 20) | 커피 장인 … 건강 체질 | 유지 | 유지 |
| clean_master | 청소 달인 | 청결 회복 ×1.5 | 신설 |
| orchard_keeper | 농원지기 | 농원 수확 +30% | 신설 |
| group_host | 단체 안내 명인 | 단체 손님 만족 +10% | 신설 |
| haggler | 흥정꾼 | 담당 시설 요금 +5% | 신설 |
| star_student | 연수 우등생 | 연수 효과 ×1.5 | 신설 |
| face_memory | 손님 기억 | 단골 전환 +10%p | 신설 |
| night_owl | 밤 체질 | 밤 손님(18시 이후) 만족 +15% | 신설 |
| storm_ready | 태풍 대비 | 태풍 수리비 −30% | 신설 |
| tour_guide | 명소 안내 | 투어 개최 점수 +10 | 신설 |
| gift_hands | 선물 손 | 손님 선물 효과 ×1.5 | 신설 |

#### 3.6.6 채용 5단계·유니폼 5 (유지)

채용 비용 50만 / 500만 / 800만 / 2,000만 / 5,000만(`recruit_tiers.json`), HSS2 5,000~500,000G의 ×100. 4단계 인턴 모집 = 노루 부탁, 5단계 = 까마귀 떼 부탁·★4 (HSS2 멧돼지·늑대). 유니폼 5종·효과 유지.

### 3.7 가이드북 11 — 심사 가중치·보상·라이벌 성장

#### 3.7.1 심사 항목 9 (0~100)

| 키 | 이름 | 계산 |
|---|---|---|
| smile | 미소 | 홀 직원 미소 평균 × 기력 계수(현행) |
| scenery | 경관 | 좌석 경치 평균 ÷ 30 × 100(현행) |
| menu | 메뉴 | 메뉴 스탯 평균 + 메뉴 수 × 5(현행) |
| fun | 체험 | 즐길거리 수 × 12 + 인기 평균(현행) |
| group | 단체 | 큰 좌석·주차·단체 인기(현행) |
| rest | 쉼 | 쉼 시설 수 × 8 + 인기 평균 + 족욕 시설 × 5 | 
| clean | 청결 | 청결값 그대로 |
| price | 가성비 | 100 − (평균 요금 ÷ 평균 손님 소지금 × 100), 0~100 |
| overall | 종합 | 위 8개 평균 + 카페 랭크 × 3 + 콤보 수 × 1 (상한 100) |

#### 3.7.2 가이드북 11 × 가중치 (합 1.0) · 상금 · 해금

| id | 이름 | smile | scenery | menu | fun | group | rest | clean | price | overall | 1위 상금 | 연구 | 씨앗 | 해금 | 원형 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| gb_kind_cafe | 친절 카페 | 0.5 | 0 | 0.1 | 0 | 0 | 0.1 | 0.2 | 0.1 | 0 | 100,000 | 100 | — | 시작 | Warm Welcomes |
| gb_local_map | 동네 맛집 지도 | 0.1 | 0.1 | 0.2 | 0.1 | 0 | 0.1 | 0.1 | 0.1 | 0.2 | 300,000 | 300 | 감귤 1 | 1년 7월 | Local Springs |
| gb_jeju_map | 제주도 카페 지도 | 0.1 | 0.1 | 0.15 | 0.1 | 0.05 | 0.1 | 0.1 | 0.05 | 0.25 | 1,000,000 | 800 | 감귤 2 | 랭크 5 | Prefectural |
| gb_insta_100 | 인스타 핫플 100 | 0 | 0.5 | 0.1 | 0.2 | 0 | 0.1 | 0.1 | 0 | 0 | 1,500,000 | 1,000 | 경관 2 | insta_traveler 인기 30 | Glamour Springs |
| gb_dessert | 미식 카페 | 0 | 0.1 | 0.6 | 0 | 0 | 0 | 0.2 | 0.1 | 0 | 2,000,000 | 1,500 | 한라봉 2 | 먹거리 5개 | Gourmet Springs |
| gb_healing | 힐링 카페 | 0.1 | 0.3 | 0 | 0 | 0 | 0.4 | 0.2 | 0 | 0 | 2,000,000 | 1,500 | 경관 3 | 쉼 8개 | Relaxing Springs |
| gb_activity | 액티비티 카페 | 0 | 0.1 | 0 | 0.6 | 0.2 | 0 | 0.1 | 0 | 0 | 2,500,000 | 2,000 | 감귤 3 | 즐길거리 5개 | Travel Wonderland |
| gb_together | 함께 가기 좋은 카페 | 0.2 | 0 | 0.1 | 0.1 | 0.5 | 0 | 0.1 | 0 | 0 | 3,000,000 | 2,500 | 감귤 3 | rentcar_family 인기 40 | Top 100 |
| gb_coop_monthly | 이번 달 농협 추천(타깃 태그 손님 인기 0.6) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.4 | 500,000 + 마일리지 10 | 500 | 인기 열매 1 | 랭크 8 | No. Wario Guide |
| gb_national_tour | 전국 카페 투어 | 0.1 | 0.1 | 0.1 | 0.1 | 0.1 | 0.1 | 0.1 | 0.05 | 0.25 | 5,000,000 | 5,000 | 한라봉 5 | ★3 | Touring Japan |
| gb_ribbon_survey | 리본 서베이 | 0.1 | 0.1 | 0.15 | 0.1 | 0.05 | 0.1 | 0.1 | 0 | 0.3 | 10,000,000 | 10,000 | 경관 5·인기 열매 3 | ★4 | Le Nichelin |

순위 보상 비율 1위 100% / 2위 30% / 3위 10%, 마일리지 3/2/1(현행). 발표 3월·9월(월간 추천은 매월 1일).

#### 3.7.3 라이벌 카페 9곳 성장 곡선

각 가이드북은 라이벌 9곳과 겨룬다. 라이벌 i(1~9)의 점수 = `top_b(y) − 6 × (i − 1) ± 4(시드 노이즈)`. `top_b(y)`(1위 라이벌, y = 년차):

| 가이드북 | 1년 | 2년 | 3년 | 4년 | 5년 | 7년 | 10년 | 증가/년 |
|---|---|---|---|---|---|---|---|---|
| 친절 카페 | 40 | 44 | 48 | 52 | 56 | 64 | 76 | +4 |
| 동네 맛집 지도 | 45 | 50 | 55 | 60 | 65 | 75 | 90 | +5 |
| 제주도 카페 지도 | 55 | 61 | 67 | 73 | 79 | 91 | 100 | +6 |
| 인스타 핫플 100 | 50 | 54 | 58 | 62 | 66 | 74 | 86 | +4 |
| 미식 카페 | 50 | 54 | 58 | 62 | 66 | 74 | 86 | +4 |
| 힐링 카페 | 48 | 52 | 56 | 60 | 64 | 72 | 84 | +4 |
| 액티비티 카페 | 52 | 56 | 60 | 64 | 68 | 76 | 88 | +4 |
| 함께 가기 좋은 카페 | 52 | 56 | 60 | 64 | 68 | 76 | 88 | +4 |
| 농협 추천(월간) | 40 | 45 | 50 | 55 | 60 | 70 | 85 | +5 |
| 전국 카페 투어 | 65 | 71 | 77 | 83 | 89 | 100 | 100 | +6 |
| 리본 서베이 | 75 | 80 | 85 | 90 | 95 | 100 | 100 | +5 |

플레이어가 1위를 하면 그 가이드북의 `top_b`는 다음 해 **+3 추가**(라이벌이 분발). 경쟁 라이벌 카페(`rivals.json` 6)는 **2년차부터** 등장(현재 3년차)하고, 등장 중이면 해당 가이드북 라이벌 1위 점수에 +5.

#### 3.7.4 ★ 승급·유지 심사 (강등 신설)

- 승급: `ranks.json` 조건(현행) 유지.
- 유지 심사: ★3 이상은 **2년마다 3월**(승급한 해 +2년부터) 승급 조건을 다시 본다. 하나라도 미달이면 대화창 경고 후 **6개월 유예**, 9월에도 미달이면 ★ −1(해당 ★로 열린 시설은 유지, 새로 짓기만 잠김). `rank_shield` 소지 시 1회 면제.

---

## 4. 난이도 설계 — "너무 쉽지 않게"

### 4.1 현재 상태(봇 seed 1, v3 워크트리)와 목표

| 지표 | 현재 | 목표 |
|---|---|---|
| 1년차(3~12월) 순이익 합 | 3,066만 | **300만~800만** |
| 1년차 말 자금 | 2,079만 (시작 500만의 4.2배) | **≤ 1,000만** (2배 이하) |
| 3년차 말 자금 | 8,687만 | **3,000만~4,500만** (필지 3개·명소 Lv3·시설 증축에 쓰고 남는 돈) |
| 적자 달(3년) | 0 | 1년차 1~2달, 이후 이벤트 달 |
| 직원 | 3명 고정 | 1년차 3 → 3년차 5 → 5년차 8 |
| 한 달 손님 | 1,200~1,900 | 1년차 700 → 3년차 2,500 |

### 4.2 자금 곡선 레버 (전부 적용)

| # | 레버 | 현재 | 변경 | 월 영향(1년차 기준) |
|---|---|---|---|---|
| 1 | 하루 손님 상한 | 스폰 배수 기반(좌석 2개로 50명/일) | **하루 손님 = min(좌석 수 × 6, 인기·명소 기반값)**. 좌석 = 쉼 시설 정원 합. 대기열 3명 초과 시 이탈 | 매출 −60% (가장 큰 레버) |
| 2 | 급여 | 스탯 3,000 + Lv 20만 | §3.6.3 공식(기본급 × Lv 계수 + 스탯 1,000) + 연 5% 인상 | +15~30만 |
| 3 | 유지비 | 건설비 1.5%/월 | **2.5%/월**, 노후 시설 +50% | +10~20만 |
| 4 | 재료비 | 원두 1,400 / 우유 500 / 밀가루 600 | 원두 1,800 / 우유 700 / 밀가루 800 / 달걀 700 / 버터 900 / 치즈 1,600 (원가율 40%) | +30~40만 |
| 5 | 세금 | 없음 | 매년 3월 1일 **소득세 = 전년 순이익 × 10%**(적자면 0). 카드에 "세금" 줄 | 1년차 말 순이익의 10% |
| 6 | 증축·명소 비용 | 명소 Lv5 총 5억 | §3.4.1 8.2억 + 시설 증축(Lv2 0.8배·Lv3 1.5배) | 투자처 증가 |
| 7 | 라이벌 | 3년차부터, 손님 −1/월 | **2년차부터**, 등장 중 손님 −5%/라이벌(최대 2) | 2년차 −10% |
| 8 | 정착지원금 | 잔고 < 40만 → 300만 1회 | **삼춘 대출**(§4.4)로 대체: 무이자 300만, 이후 목표 보상 50% | — |
| 9 | 투어 버스 | 없음 | 월 50만 고정비(선택) | −50만 (선택) |
| 10 | 연수 | 없음 | 60만~200만/회(선택) | 선택 지출 |

### 4.3 인기 하락 요인

| 요인 | 규칙 | 회복 |
|---|---|---|
| 노후 | 24개월 후 6개월마다 인기 −1(최대 −6), 유지비 +50% | 수리(건설비 10%) 또는 증축 |
| 소음 | 현행 `noise`: 인접 2칸 소음 합 ≥ 5 → 좌석 인기 −(합−4) | 배치 변경, 돌담·삼나무(소음 −1) |
| 청결 | §3.2.3: 50 미만 손님 ×0.8, 30 미만 ×0.6 | 청소 직원·화장실·도구실 |
| 라이벌 | 2년차부터 등장, 손님 −5%/곳, 12개월 후 철수 또는 대결 승리 시 즉시 철수 | 대결(도전) 승리 |
| 요금 과다 | 시설 요금 > 손님 소지금 40% → 이용 안 함(현행) + 가성비 점수 하락 | 요금 씨앗 남용 억제 |
| 웨이팅 | 대기열 3명 초과 시 이탈 + 만족 −10 | 좌석 증설 |
| 악평 | 청결 < 50 상태로 30일 → 20% 확률 "악플" 이벤트: 전 시설 인기 −5(14일) | 청결 회복 |

### 4.4 실패 상태 (게임 오버 없음, 지연·손실)

| 단계 | 조건 | 결과 |
|---|---|---|
| 경고 | 3개월 연속 적자 | 삼춘 대화창 경고 + 카드에 "적자 3개월" 배지. 다음 달 팁 1줄 = 비용 줄이기 제안 |
| 대출 | 6개월 연속 적자 **또는** 잔고 < 40만 | 삼춘이 300만 무이자 대출(1회 300만, 최대 3회 누적 900만). 대출 중: 목표 보상 money 50%, tickets/mileage 절반. 상환 = 흑자 달마다 순이익 30% 자동 |
| 위기 | 잔고 < −500만이 3개월 | "정착 실패 위기" 대화: 필지 1개 강제 매각(구매가 50% 환불, 시설 철거·50% 환불), 라이벌 1곳 즉시 등장 |
| 강등 | ★3 이상 유지 심사 미달 | §3.7.4 ★ −1 |

### 4.5 이벤트 페널티 수치 (`events_v3.json` 보정)

| 이벤트 | 현재 | 변경 |
|---|---|---|
| 태풍(8·9월, 30%) | 손님 ×0.5 3일, 수리비 2만 | 손님 ×0.5 3일, **수리비 = 야외 시설(경관·농원·야외 좌석·카트) 건설비 합 × 3%**(최소 50만, 최대 2,000만), 야외 시설 20%가 "파손"(수리 전 인기 0). `wind_charm` −50%, `storm_ready` −30% |
| 폭설(1·2월) | 손님 ×0.4 3일 | 손님 ×0.4 3일 + 난방비 20만 + 농원 그달 수확 −30% |
| 해상 안개 결항 | 손님 ×0.6 2일 | 손님 ×0.6 2일 + 외국 손님 ×0 |
| 노루·까치 습격(신설, 9~11월 25%) | — | 농원 시설 그달 수확 −50%, 운반 직원 힘 ≥ 40이면 −20%로 완화, `deer_bell` 확률 −50% |
| 렌터카 대란(신설, 7~8월 30%) | — | 주차장 없으면 7일간 단체·가족 손님 ×0.5 |
| 악플(신설) | — | §4.3 |
| 급여 인상 요구(매년 3월) | — | §3.6.3 |
| 세금(매년 3월) | — | §4.2 #5 |

### 4.6 헤드리스 봇 KPI (목표 밴드, `balance.test.ts` 상수 교체)

봇 규칙 보강: 자금 ≥ 다음 목표 필요액 + 300만이면 투자(필지 → 증축 → 명소 순), 직원 슬롯이 비면 채용, 청결 < 60이면 청소 직원 배치, 연수는 3년차부터 연 2회.

| 시점 | 자금 | 누적 투자 | 랭크 | ★ | 달성 목표 | 월 손님 | 직원 | 적자 달(누적) |
|---|---|---|---|---|---|---|---|---|
| 1년차 말 | 800만~1,200만 | 1,500만 | 3 | 1 | 30~36 | 600~800 | 3 | 1~2 |
| 3년차 말 | 3,000만~4,500만 | 1억 | 6 | 3 | 66~72 | 2,000~2,800 | 5 | 3~5 |
| 5년차 말 | 8,000만~1.2억 | 3억 | 8 | 4 | 86~90 | 4,000~6,000 | 8 | 5~8 |
| 10년차 말 | 3억~5억 | 10억 | 10 | 5 | 105~107 | 10,000~14,000 | 12 | 8~12 |

테스트 상수: `YEAR1_TOTAL_MIN/MAX = 3,000,000 / 8,000,000`, `YEAR3_MONEY_MIN/MAX = 25,000,000 / 50,000,000`, 신규 `YEAR1_END_MONEY_MAX = 12,000,000`, `YEAR5_STAR_MIN = 4`, `YEAR10_GOALS_MIN = 105`. 봇이 밴드 밖이면 레버 #1(좌석당 손님 6)·#4(원가율)부터 조정한다.

---

## 5. 구현 순서 — 5트랙 병렬

공통 규칙: 데이터는 `docs/.../gdd-v2-tables.md` 갱신 없이 **이 문서 표 → JSON 직접 생성**(`scripts/gen-data.ts`가 있으면 그 입력 표 갱신). 트랙끼리 같은 파일을 만지지 않는다(아래 소유 표). 통합 순서: E(경제 기반) → A·C·D(컨텐츠) → B(목표는 마지막에 id 참조 검증).

| 트랙 | 범위 | 소유 파일(신규 ★) | 의존 | 완료 기준 |
|---|---|---|---|---|
| **A 시설·콤보** | §3.1 콤보 60·명당 12, §3.2 신규 44·Lv1~3·노후·청결 | `facilities.json`(+44, `level`·`unlock:goal`), `combos.json`(60), ★`spot_effects.json`, `compat.ts`(누적 상한·명당), ★`upgrade.ts`, ★`cleanliness.ts`, `build.ts`, `objects.json`(★`plant_speed_*`), 짓기 창 UI(Lv 버튼·낡음 배지) | E의 유지비 공식 | 시설 153, 콤보 60 도감, 증축 Lv2/3 동작·비용·효과 테스트, 청결 0~100 일일 변화 테스트, 노후 −1/6개월 테스트 |
| **B 목표·이벤트** | §3.5 목표 108, §4.4 실패 상태, §4.5 이벤트 보정 | `goals.json`(108), `goals.ts`(조건 14종·보상 5종 추가), `events_v3.json`(+4 신설·수치), `events.ts`, ★`failure.ts`(경고·대출·위기), 대화 텍스트 | A·C·D의 id(시설·명소·연수) | 108개 조건 판정 단위 테스트, 봇 10년 실행 시 목표 ≥ 105, 대출·위기 시나리오 테스트, 모든 `unlockFacility` id가 `facilities.json`에 존재(검증 스크립트) |
| **C 명소·아이템·상점** | §3.3 아이템 체계, §3.4 명소 Lv 조건·효과·방문객·투어 | `spots.json`(투자금·조건·효과), `spots.ts`(방문객·상품·버스·투어 개최), `mileage_shop.json`(20), `ticket_shop.json`(10), `special_items.json`(18), ★`gifts.json`, `items.ts`(선물·수리 도구), `shop.ts`, 장부 창 UI(명소 카드 Lv 조건 표시) | — | 24곳 Lv5 조건·효과 테스트, 방문객 누적·상품 5단계 테스트, 투어 개최 점수식 테스트, 선물 효과 테스트 |
| **D 직원** | §3.6 직종 8·스탯별 상한·급여·승급·연수·특기 30 | `staff_roles.json`(8), `staff_pool.json`(`statCaps`), `skills.json`(30), ★`trainings.json`, `staff.ts`(급여 공식·경험치·슬롯 = 3 + 휴게실×3), ★`training.ts`, 직원 창 UI(연수 버튼·상한 표시) | — | 급여 공식 테스트(표 3행 일치), 연수 5종 효과·비용 증가 테스트, 승급 경험치 테스트, 청소·농원·홍보 직종 효과 테스트 |
| **E 경제·가이드북·라이벌·난이도** | §3.7 심사 9항목·가중치·라이벌 곡선·강등, §4.2 레버·세금, §4.6 봇 | `economy.ts`(유지비 2.5%·세금·급여 인상), `guests.ts`(좌석당 6·대기열 이탈), `ingredients.json`(원가), `guidebook.ts`(9항목·가중치·라이벌 top_b·강등), `guidebooks.json`(가중치), `rivals.ts`(2년차·−5%), `rank.ts`, `bot.ts`, `balance.test.ts`, `state.ts`(정착지원금 → 대출 훅) | — (가장 먼저) | 봇 3년 KPI 밴드 통과(§4.6), 가이드북 순위 결정적 테스트(라이벌 점수표 3개 년차), 강등 시나리오 테스트, 세금 카드 표시 |

각 트랙 PR 조건: `pnpm test` 전부 통과 + `pnpm build` + 봇 3년 리포트 첨부. 트랙 B는 A·C·D 머지 후 id 검증 스크립트(`scripts/validate-goals.ts`: goals → facilities/menus/spots/trainings id 존재, 목표 순서 내 해금 선후 모순 없음) 통과가 머지 조건.

---

## 부록 A. 표 개수·행 수 요약 (스크립트로 센 값)

| 절 | 표 | 행(헤더 제외) |
|---|---|---|
| §1.0 기본 규칙 | 1 | 18 |
| §1.1 콤보·목욕 효과 | 2 | 55 + 10 |
| §1.2 시설 | 4 | 24 + 20 + 22 + 22 |
| §1.3 아이템 | 4 | 8 + 7 + 18 + 33 |
| §1.4 명소 | 1 | 24 |
| §1.5 타깃 | 1 | 106 |
| §1.6 직원 | 2 | 5 + 20 |
| §1.7 가이드북 | 1 | 11 |
| §1.8 못 읽은 것 | 1 | 9 |
| §2 갭 | 1 | 26 |
| §3.1 콤보·명당 | 2 | 60 + 12 |
| §3.2 시설·Lv·청결 | 4 | 44 + 10 + 8 + 4 |
| §3.3 아이템 | 5 | 7 + 16 + 6 + 6 + 8 |
| §3.4 명소 | 5 | 6 + 5 + 24 + 2 (+ 방문객 상품 1문단) |
| §3.5 목표 | 2 | 12(타입) + 108 |
| §3.6 직원 | 6 | 8 + 27 + 3 + 5 + 11 |
| §3.7 가이드북 | 3 | 9 + 11 + 11 |
| §4 난이도 | 6 | 6 + 10 + 7 + 4 + 8 + 4 |
| §5 구현 | 1 | 5 |
| 합계 | 52 | 935 |

## 부록 B. 이 문서가 바꾸는 기존 결정

| 기존 | 변경 | 근거 |
|---|---|---|
| 정착지원금 300만 1회 | 삼춘 대출(최대 3회, 목표 보상 50%) | §4.4 실패 상태 |
| 유지비 1.5%/월 | 2.5%/월 + 노후 +50% | §4.2 |
| 라이벌 3년차부터 | 2년차부터 | §4.2 #7 |
| 급여 = 스탯 3,000 + Lv 20만 | 기본급 × Lv 계수 + 스탯 1,000 | §3.6.3 |
| 직원 statCap 단일 | 스탯별 상한 | §3.6.2 |
| 목표 60 | 108 | §3.5 |
| 명소 투자금 Lv5 500만~2,000만 | 650만~2,600만 + 방문객·년차·★ 조건 | §3.4 |
| 가이드북 심사 6항목 | 9항목 + 가중치 표 + 라이벌 곡선 + 강등 | §3.7 |
| 랭크·★ 내려가지 않음 | ★만 유지 심사로 강등 가능(랭크는 유지) | §3.7.4 |
| 콤보 45 | 60 + 명당 12, 누적 상한 | §3.1 |
| 시설 109 | 153 + Lv1~3 | §3.2 |

---

## 6. 입지 시스템 — "자리별로 특색이 달라야 한다" (트랙 F)

사용자 피드백: 칸마다 특색이 없어 어디에 놓든 똑같고 전략이 없다. 모든 칸에 **입지 5요소**를 두고, 배치 고스트를 올리면 그 자리의 값이 즉시 보이며, 좌석·시설의 실제 성과가 거기서 갈린다.

### 6.1 칸 속성 (결정적, `site.ts`의 `siteOf(state, x, y): Site`)

| 요소 | 값 | 산출 | 영향 |
|---|---|---|---|
| 전망 `view` | 0~5 | 바다(맵 북쪽 가장자리 2줄 방향)·오름(남동 랜드마크)·폭낭·연못·꽃밭 등 `scenery` 시설이 반경 3 안에 있으면 합산(시설 경관치 합/2, 상한 5). 건물(방)이 그 방향 사이에 있으면 −2 | 좌석 요금 +4%/점, 관광객 만족 +3/점, 사진 손님(인플루언서) 확률 |
| 바람 `wind` | 0~3 | 북서풍: 칸의 북서쪽 반경 3 안에 돌담·건물·방풍림(폭낭·삼나무)이 없으면 3, 하나당 −1 | 겨울(12~2월) 야외 좌석 만족 −8/점, 여름엔 +3/점(시원함). 파라솔은 바람 2 이상이면 접힘(효과 0) |
| 그늘 `shade` | 0~2 | 나무·파라솔·지붕 시설이 반경 1 안 | 여름(6~8월) 야외 좌석 만족 +6/점, 겨울 −4/점 |
| 길가 `traffic` | 0~3 | 올렛길·정류장·정낭까지 거리 ≤1이면 3, ≤2면 2, ≤3이면 1 | 매대·자판기·기념품 매출 ×(1+0.15×traffic), 좌석은 소음으로 만족 −3/점 |
| 주방 거리 `kitchen` | 0~4 | 본관 카운터까지 BFS 거리(칸)/3, 상한 4 | 좌석 서빙 시간 +15%/점(홀 직원 있으면 절반), 손님 대기 이탈 |

### 6.2 표시
- 짓기 고스트를 올리면 칸 위에 `👁 전망 3 · 🌬 바람 1 · ☂ 그늘 0 · 🚶 길가 2 · 🍳 주방 1` 한 줄 배지 + 고스트 색이 그 시설에 좋은 자리면 초록, 나쁘면 주황 (시설 kind별 가중치: 좌석 = 전망+그늘−바람−길가−주방, 매대 = 길가, 장식 = 없음).
- 짓기 창 상단 토글 「입지 보기」: 맵에 반투명 색 오버레이(좌석 적합도 0~10 을 빨강→초록). 모드는 창 닫아도 유지, 다시 누르면 끔.
- 시설 미니 카드에 「이 자리: 전망 3 · 바람 1 …」 줄과 「이 자리 점수 7/10」.
- 손님 말풍선: 전망 좋은 자리 앉으면 "바다가 보인다!", 바람 강한 겨울 야외면 "춥다…", 여름 그늘이면 "시원하다" (guestSay에 site 대사 6개).

### 6.3 수치 연결
- 좌석 요금 = 기본 × (1 + 0.04×view) × 시즌 보정. 만족 = 기존 + 계절별 바람·그늘·길가 보정. 매대 매출 배수.
- 명당 효과(§3.1 명당 12)는 입지 5요소 위에 **추가**되는 특수 조합(예: 폭낭 그늘 + 돌담 뒤 = "삼춘 명당").
- 봇: 좌석 배치 후보 중 점수 최고 칸을 고른다.

### 6.4 파일 소유 (트랙 F)
★`src/sim/site.ts`(siteOf·seatScore·kindWeights), `guests.ts`의 만족·요금 훅 한 곳(`siteBonus(state, seat)` 호출만), ★`src/render/siteOverlay.ts`, `GameView.ts`(고스트 배지·오버레이 토글), `MiniCard.tsx`(시설 카드 줄), `BuildWindow.tsx`(토글 버튼 1개), `bot.ts`(좌석 후보 점수), 테스트 `site.test.ts`.
완료 기준: 같은 테이블을 바닷가·돌담 뒤·길가·주방 옆 4곳에 놓았을 때 요금·만족·서빙 시간이 표대로 달라지는 테스트, 고스트 배지·오버레이 화면 확인.
