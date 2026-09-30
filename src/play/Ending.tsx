/** 3년 엔딩 (4년차 1월 1일): 최종 점수 카드 + 칭호 + 직원 초상 줄. 계속하기 / 타이틀로. */
import type { GameState } from '../game/index.ts';
import { popularitySum, usables } from '../game/index.ts';
import { Portrait } from './cards';
import { FixedPortrait } from './Dialogue';
import { C, panel, titleBar, btn, btnGold, small, wonShort } from './theme';

export interface FinalScore { rows: { k: string; v: string; pts: number }[]; total: number; title: string }
export function finalScore(s: GameState): FinalScore {
  const bestRank = s.evaluations.length ? Math.min(...s.evaluations.map((e) => e.rank)) : 6;
  const rows = [
    { k: '명성', v: String(s.fame), pts: s.fame },
    { k: '시설 인기 합', v: String(popularitySum(s)), pts: popularitySum(s) },
    { k: '자리·가게', v: `${usables(s).length}개`, pts: usables(s).length * 10 },
    { k: '누적 손님', v: `${s.stats.guests}명`, pts: Math.round(s.stats.guests / 10) },
    { k: '자금', v: wonShort(s.money), pts: Math.max(0, Math.round(s.money / 100_000)) },
    { k: '내 땅', v: `${s.parcels.filter((p) => p.owned).length}필지`, pts: (s.parcels.filter((p) => p.owned).length - 1) * 100 },
    { k: '최고 랭킹', v: bestRank <= 5 ? `${bestRank}위` : '—', pts: bestRank === 1 ? 1000 : bestRank === 2 ? 600 : bestRank === 3 ? 300 : 0 },
  ];
  const total = rows.reduce((a, r) => a + r.pts, 0);
  const title = total >= 6000 ? '제주의 전설 카페' : total >= 4000 ? '소문난 카페' : total >= 2500 ? '동네 사랑방' : total >= 1200 ? '단골 있는 카페' : '이제 시작인 카페';
  return { rows, total, title };
}
export function EndingScreen({ s, onContinue, onTitle }: { s: GameState; onContinue: () => void; onTitle: () => void }) {
  const f = finalScore(s);
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 48, background: 'rgba(20,14,8,0.82)', display: 'grid', placeItems: 'center', overflowY: 'auto' }}>
      <div style={{ ...panel, width: 310, display: 'grid', gap: 6 }}>
        <div style={{ ...titleBar, justifyContent: 'center' }}>3년의 이야기 — {s.cafeName}</div>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'flex-end' }}>
          <FixedPortrait id="halmang" expr="happy" size={56} />
          {s.staff.slice(0, 4).map((st) => <Portrait key={st.id} face={st.face} accs={['apron']} size={44} />)}
          <FixedPortrait id="samchun" expr="happy" size={56} />
        </div>
        <div style={{ textAlign: 'center', fontSize: 13, color: C.soft }}>할망: 「세 해 만에 여기까지 왔구나.」 삼춘: 「앞으로도 잘 부탁해!」</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}><tbody>
          {f.rows.map((r) => <tr key={r.k}><td style={{ color: C.soft }}>{r.k}</td><td style={{ textAlign: 'right' }}>{r.v}</td><td style={{ textAlign: 'right', width: 60 }}>{r.pts}점</td></tr>)}
          <tr style={{ fontWeight: 700, borderTop: `1px solid ${C.wood}` }}><td>총점</td><td /><td style={{ textAlign: 'right' }}>{f.total}점</td></tr>
        </tbody></table>
        <div style={{ textAlign: 'center', fontSize: 18, fontWeight: 700, color: C.gold, textShadow: '1px 1px 0 #4a2f16' }}>칭호 「{f.title}」</div>
        <div style={small}>게임은 계속됩니다. 경쟁 카페는 해마다 커지니 랭킹 1위를 노려 보세요.</div>
        <div style={{ display: 'flex', gap: 6 }}><button style={{ ...btnGold, flex: 2 }} onClick={onContinue}>계속하기</button><button style={{ ...btn, flex: 1 }} onClick={onTitle}>타이틀로</button></div>
      </div>
    </div>
  );
}
