/** 셀렉트 박스 대신 쓰는 버튼 그룹 (모바일에서 드롭다운이 불편해서). 하나만 켜진다(aria-pressed). 버튼 ≥ 36px, 글자 ≥ 14px. */
import type { CSSProperties } from 'react';
import { brownBtn, brownBtnOn, brownBtnOff } from './frame';

export interface ButtonGroupOption<T extends string> { value: T; label: string; disabled?: boolean }

export function ButtonGroup<T extends string>({ value, options, onPick, label, disabled = false, style, testId }: {
  value: T;
  options: ButtonGroupOption<T>[];
  onPick: (v: T) => void;
  /** 그룹의 aria-label (예: "직종") */
  label: string;
  disabled?: boolean;
  style?: CSSProperties;
  testId?: string;
}) {
  return (
    <div role="group" aria-label={label} data-testid={testId} data-tut={testId} style={{ display: 'flex', flexWrap: 'wrap', gap: 4, ...style }}>
      {options.map((o) => {
        const on = o.value === value;
        const off = disabled || o.disabled;
        return (
          <button key={o.value} type="button" aria-pressed={on} disabled={off} onClick={() => { if (!off && !on) onPick(o.value); }}
            style={{ ...(off ? brownBtnOff : on ? brownBtnOn : brownBtn), minHeight: 36, padding: '0 10px', margin: 0, fontSize: 14, whiteSpace: 'nowrap' }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
