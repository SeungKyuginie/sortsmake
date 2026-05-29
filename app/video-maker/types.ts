export type CornerPhoto = {
  id: string;
  file: File;
  previewUrl: string;
  kind: 'image' | 'video';
  cornerName: string;
  description: string;
  droneShot?: boolean;
  // 원본 픽셀 크기 (블러 액자 모드용 fit 계산)
  width?: number;
  height?: number;
  // AI 드론 영상 생성 상태
  droneAiStatus?: 'idle' | 'generating' | 'ready' | 'error';
  droneAiError?: string;
  // AI가 생성한 영상으로 대체된 경우 원본 사진을 보관 (취소/재시도용)
  originalFile?: File;
  originalPreviewUrl?: string;
  originalKind?: 'image' | 'video';
  // 클라우드 동기화 (Supabase Storage 경로)
  storagePath?: string;
  originalStoragePath?: string;
  uploadStatus?: 'idle' | 'uploading' | 'uploaded' | 'error';
  // 사진관 등 음성 미사용 모드에서 이 사진을 N초 고정으로 보여줄지
  // (해당 값이 있으면 균등 분배 대신 이 시간을 사용)
  fixedDurationSec?: number;
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
};

export type ShortsScript = {
  hook: string;                // 첫 2~3초 강력한 한 줄
  segments: ScriptSegment[];   // 코너별
  cta: string;                 // 마지막 1.5~2초 콜투액션
};
