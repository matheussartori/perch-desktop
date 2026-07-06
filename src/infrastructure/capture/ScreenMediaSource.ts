/**
 * Renderer-side MediaSource that captures the host's screen (and, where
 * possible, audio) as a single MediaStream to publish over WebRTC.
 *
 * Capture uses Electron's desktopCapturer path: we resolve a source id from the
 * main process, then request it through getUserMedia with the Electron-specific
 * `chromeMediaSource: 'desktop'` constraints (not part of the standard DOM TS
 * types, hence the casts).
 */
import type { MediaSource } from '@application/ports'

/** Electron desktop-capture constraints aren't in the DOM typings. */
type DesktopConstraints = {
  audio?: unknown
  video: unknown
}

export class ScreenMediaSource implements MediaSource {
  async capture(): Promise<MediaStream> {
    const sources = await window.perch.listScreens()
    const source = sources[0]
    if (!source) throw new Error('No capturable screen was found.')

    const video = {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: source.id,
        maxWidth: 1920,
        maxHeight: 1080,
        maxFrameRate: 30
      }
    }

    // Preferred path: screen video + loopback desktop audio in one request.
    const withAudio: DesktopConstraints = {
      audio: { mandatory: { chromeMediaSource: 'desktop' } },
      video
    }

    try {
      return await navigator.mediaDevices.getUserMedia(withAudio as MediaStreamConstraints)
    } catch {
      // System-audio loopback is unsupported on macOS (needs a future audio
      // driver, per the roadmap), so fall back to video-only and best-effort mic.
      const stream = await navigator.mediaDevices.getUserMedia(
        { video } as unknown as MediaStreamConstraints
      )
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true })
        for (const track of mic.getAudioTracks()) stream.addTrack(track)
      } catch {
        // No microphone or permission denied — ship a video-only stream.
      }
      return stream
    }
  }
}
