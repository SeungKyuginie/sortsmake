'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const SAMPLE_TEXT =
  '안녕하세요! 행복마트 오늘 특가, 사과 1.5kg 9,900원입니다. 지금 바로 오세요.';

// 같은 보이스를 여러 번 누를 때 API를 다시 부르지 않도록 모듈 레벨 캐시.
const audioCache = new Map<string, Blob>();
// 동시 재생 방지용 — 현재 재생 중인 audio element 추적
let currentAudio: HTMLAudioElement | null = null;
let currentVoiceId: string | null = null;
const listeners = new Set<() => void>();

function setCurrent(id: string | null) {
  currentVoiceId = id;
  listeners.forEach((fn) => fn());
}

function useCurrentVoice() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return currentVoiceId;
}

type Props = {
  voiceId: string;
  className?: string;
};

export function VoicePreviewButton({ voiceId, className }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const playingId = useCurrentVoice();
  const isPlaying = playingId === voiceId;
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      currentAudio = null;
      setCurrent(null);
    }
  }, []);

  const play = useCallback(async () => {
    setError(null);
    // 이미 재생 중이면 멈추기
    if (isPlaying) {
      stop();
      return;
    }
    // 다른 보이스 재생 중이면 그것부터 멈추기
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }

    let blob = audioCache.get(voiceId);
    if (!blob) {
      setLoading(true);
      try {
        const res = await fetch('/api/generate-voice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            segments: [{ text: SAMPLE_TEXT, voiceName: voiceId }],
            speakingRate: 1.0,
            pitch: 0,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `미리듣기 실패 (${res.status})`);
        }
        blob = await res.blob();
        audioCache.set(voiceId, blob);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '미리듣기 실패';
        setError(msg);
        setLoading(false);
        return;
      }
      setLoading(false);
    }

    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioRef.current = audio;
    currentAudio = audio;
    setCurrent(voiceId);
    audio.onended = () => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) {
        currentAudio = null;
        setCurrent(null);
      }
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      setError('오디오 재생 실패');
      if (currentAudio === audio) {
        currentAudio = null;
        setCurrent(null);
      }
    };
    try {
      await audio.play();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '재생 차단됨';
      setError(msg);
      URL.revokeObjectURL(url);
      if (currentAudio === audio) {
        currentAudio = null;
        setCurrent(null);
      }
    }
  }, [voiceId, isPlaying, stop]);

  useEffect(() => {
    return () => {
      // 컴포넌트 언마운트 시 재생 중이던 오디오 정리
      if (currentAudio === audioRef.current && audioRef.current) {
        audioRef.current.pause();
        currentAudio = null;
        setCurrent(null);
      }
    };
  }, []);

  return (
    <span className={className}>
      <button
        type="button"
        onClick={play}
        disabled={loading}
        title={isPlaying ? '정지' : '미리듣기'}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs ${
          isPlaying
            ? 'bg-brand-600 text-white border-brand-600'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
        } ${loading ? 'cursor-wait opacity-60' : ''}`}
      >
        {loading ? '…' : isPlaying ? '■' : '▶'}
      </button>
      {error ? (
        <span className="ml-2 text-xs text-red-600" title={error}>
          !
        </span>
      ) : null}
    </span>
  );
}
