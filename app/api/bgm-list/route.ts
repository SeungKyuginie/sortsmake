import { NextResponse } from 'next/server';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

const AUDIO_EXT = new Set(['.mp3', '.m4a', '.aac', '.ogg', '.wav']);

export async function GET() {
  try {
    const dir = path.join(process.cwd(), 'public', 'bgm');
    const entries = await readdir(dir);
    const tracks = entries
      .filter((name) => AUDIO_EXT.has(path.extname(name).toLowerCase()))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({
        id: name,
        name: name.replace(/\.[^.]+$/, ''),
        file: `/bgm/${name}`,
      }));
    return NextResponse.json({ tracks });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ tracks: [], error: msg });
  }
}
