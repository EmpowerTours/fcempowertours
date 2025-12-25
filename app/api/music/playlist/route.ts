import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

// Simple file-based storage for playlists
// In production, use Redis or a database
const PLAYLISTS_DIR = path.join(process.cwd(), 'data', 'playlists');

interface PlaylistData {
  fid: number;
  name: string;
  songOrder: string[]; // Array of tokenIds in order
  updatedAt: number;
}

// Ensure playlists directory exists
async function ensurePlaylistsDir() {
  try {
    await fs.mkdir(PLAYLISTS_DIR, { recursive: true });
  } catch (error) {
    // Directory might already exist
  }
}

// GET - Load playlist for a Farcaster ID
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fid = searchParams.get('fid');

    if (!fid) {
      return NextResponse.json(
        { success: false, error: 'Farcaster ID (fid) required' },
        { status: 400 }
      );
    }

    await ensurePlaylistsDir();
    const playlistPath = path.join(PLAYLISTS_DIR, `${fid}.json`);

    try {
      const data = await fs.readFile(playlistPath, 'utf-8');
      const playlist: PlaylistData = JSON.parse(data);

      return NextResponse.json({
        success: true,
        playlist,
      });
    } catch (error: any) {
      // File doesn't exist - no saved playlist
      if (error.code === 'ENOENT') {
        return NextResponse.json({
          success: true,
          playlist: null,
        });
      }
      throw error;
    }
  } catch (error: any) {
    console.error('[playlist] GET error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to load playlist' },
      { status: 500 }
    );
  }
}

// POST - Save playlist for a Farcaster ID
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fid, name, songOrder } = body;

    if (!fid) {
      return NextResponse.json(
        { success: false, error: 'Farcaster ID (fid) required' },
        { status: 400 }
      );
    }

    if (!songOrder || !Array.isArray(songOrder)) {
      return NextResponse.json(
        { success: false, error: 'songOrder array required' },
        { status: 400 }
      );
    }

    await ensurePlaylistsDir();
    const playlistPath = path.join(PLAYLISTS_DIR, `${fid}.json`);

    const playlist: PlaylistData = {
      fid: Number(fid),
      name: name || 'My Playlist',
      songOrder,
      updatedAt: Date.now(),
    };

    await fs.writeFile(playlistPath, JSON.stringify(playlist, null, 2));

    console.log(`[playlist] Saved playlist for FID ${fid}:`, songOrder.length, 'songs');

    return NextResponse.json({
      success: true,
      playlist,
    });
  } catch (error: any) {
    console.error('[playlist] POST error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to save playlist' },
      { status: 500 }
    );
  }
}
