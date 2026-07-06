/**
 * Extra application-level ports (beyond the domain ports) that the use cases
 * depend on. Kept here so infrastructure has a single import surface.
 */
import type { MediaTransport } from '@domain/media/MediaTransport'

/** Provides the host's outgoing media (screen + system/mic audio). */
export interface MediaSource {
  /** Capture the local screen and audio as a single stream. */
  capture(): Promise<MediaStream>
}

/** Creates a fresh peer transport per session (one negotiation, one lifecycle). */
export type TransportFactory = () => MediaTransport

/** Where UI-facing status updates are pushed. */
export type StatusListener = (status: import('@domain/session/SessionStatus').SessionStatus) => void
