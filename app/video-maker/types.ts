export type CornerPhoto = {
  id: string;
  file: File;
  previewUrl: string;
  kind: 'image' | 'video';
  cornerName: string;
  description: string;
};

export type StepKey = 'upload' | 'script' | 'voice' | 'render' | 'done';
export type StepStatus = 'idle' | 'active' | 'complete' | 'error';

export type StepState = {
  key: StepKey;
  label: string;
  status: StepStatus;
  detail?: string;
};

// 유튜브 숏츠 전문가 구조: hook → segments → cta
export type ScriptSegment = {
  cornerIndex: number; // 1-based, photo와 매칭
  text: string;        // TTS 입력이 되는 코너 나레이션
  highlight?: string;  // 화면에서 강조할 단어/숫자 (가격, 할인율 등)
};

export type ShortsScript = {
  hook: string;                // 첫 2~3초 강력한 한 줄
  segments: ScriptSegment[];   // 코너별
  cta: string;                 // 마지막 1.5~2초 콜투액션
};
