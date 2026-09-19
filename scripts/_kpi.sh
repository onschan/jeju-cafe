#!/bin/bash
# KPI 표: seed 1~3 × 3년
cd "$(dirname "$0")/.."
for seed in 1 2 3; do pnpm -s headless 3 $seed 2>/dev/null > /tmp/run_$seed.csv & done; wait
python3 - <<'PY'
import csv
print('seed | y1 net합 | y1 적자달 | y1말 자금 | y1 직원 | y2말 자금 | y3말 자금 | y3 직원 | y3 월손님평균 | 목표 | ★ | 최저잔고')
for seed in (1,2,3):
    rows=list(csv.DictReader(open(f'/tmp/run_{seed}.csv')))
    y1=[r for r in rows if r['year']=='1']; y2=[r for r in rows if r['year']=='2']; y3=[r for r in rows if r['year']=='3']
    print(f"{seed} | {sum(int(r['net']) for r in y1)/1e6:.1f}M | {sum(1 for r in y1 if int(r['net'])<0)} | {int(y1[-1]['money'])/1e6:.1f}M | {y1[-1]['staff']} | {int(y2[-1]['money'])/1e6:.1f}M | {int(y3[-1]['money'])/1e6:.1f}M | {y3[-1]['staff']} | {sum(int(r['guests']) for r in y3)/len(y3):.0f} | {y3[-1]['goals']} | {y3[-1]['star']} | {min(int(r['minMoney']) for r in rows)/1e6:.1f}M")
PY
