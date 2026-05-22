export type CornerPhoto = {
  id: string;
  file: File;
  previewUrl: string;
  kind: 'image' | 'video';
  cornerName: string;
  description: string;
  droneShot?: boolean;
};

export type StepKey = 'upload' | 'script' | 'voice' | 'render' | 'done';

export type StepStatus = 'idle' | 'active' | 'complete' | 'error';

export type StepState = {
  key: StepKey;
  label: string;
  status: StepStatus;
  detail?: string;
};
