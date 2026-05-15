'use client';

import type { StepState } from './types';

export function StepIndicator({ steps }: { steps: StepState[] }) {
  return (
    <ol className="flex w-full items-center gap-2 overflow-x-auto pb-2">
      {steps.map((s, i) => {
        const color =
          s.status === 'complete'
            ? 'bg-emerald-500 text-white'
            : s.status === 'active'
              ? 'bg-brand-600 text-white'
              : s.status === 'error'
                ? 'bg-red-500 text-white'
                : 'bg-gray-200 text-gray-600';
        return (
          <li key={s.key} className="flex flex-1 min-w-[120px] items-center gap-2">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${color}`}
            >
              {s.status === 'complete' ? '✓' : i + 1}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-gray-900">
                {s.label}
              </div>
              {s.detail ? (
                <div className="truncate text-xs text-gray-500">{s.detail}</div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
