/*
 * ControlSurface — the remote screen you drive. It renders the host's media,
 * translates local pointer, wheel, and keyboard events into normalized input,
 * and forwards them to the host. Coordinates are normalized against the video's
 * own bounding box so a laptop can drive a 4K host precisely. Keyboard input is
 * only captured while the surface is focused, and every listener is torn down
 * on unmount.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SessionStatus } from '@domain/session/SessionStatus'
import type { PointerButton } from '@domain/input/InputEvent'
import type { PerchController } from '../session/usePerchSession'
import { StatusDot } from './StatusDot'
import styles from './ControlSurface.module.css'

interface ControlSurfaceProps {
  remoteStream: MediaStream | null
  status: SessionStatus
  peerCode: string | null
  disconnect: () => void
  sendPointerMove: PerchController['sendPointerMove']
  sendPointerButton: PerchController['sendPointerButton']
  sendScroll: PerchController['sendScroll']
  sendKey: PerchController['sendKey']
}

const BUTTON: Record<number, PointerButton> = { 0: 'left', 1: 'middle', 2: 'right' }

const TOOLBAR_LINGER_MS = 2200

export function ControlSurface({
  remoteStream,
  status,
  peerCode,
  disconnect,
  sendPointerMove,
  sendPointerButton,
  sendScroll,
  sendKey
}: ControlSurfaceProps): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const focusedRef = useRef(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [toolbarVisible, setToolbarVisible] = useState(true)

  // Bind the incoming stream to the <video>.
  useEffect(() => {
    const video = videoRef.current
    if (video) video.srcObject = remoteStream
  }, [remoteStream])

  // Focus the surface as soon as media arrives so keystrokes are captured.
  useEffect(() => {
    if (remoteStream) frameRef.current?.focus()
  }, [remoteStream])

  // Normalize a pointer position against the video's rendered box.
  const normalized = useCallback((clientX: number, clientY: number): [number, number] => {
    const rect = videoRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return [0, 0]
    return [(clientX - rect.left) / rect.width, (clientY - rect.top) / rect.height]
  }, [])

  const revealToolbar = useCallback(() => {
    setToolbarVisible(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setToolbarVisible(false), TOOLBAR_LINGER_MS)
  }, [])

  // Global key capture, gated on the surface being focused.
  useEffect(() => {
    const forward = (e: KeyboardEvent, pressed: boolean): void => {
      if (!focusedRef.current) return
      e.preventDefault()
      sendKey(e.code, pressed, {
        ctrl: e.ctrlKey,
        alt: e.altKey,
        shift: e.shiftKey,
        meta: e.metaKey
      })
    }
    const onDown = (e: KeyboardEvent): void => forward(e, true)
    const onUp = (e: KeyboardEvent): void => forward(e, false)
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [sendKey])

  return (
    <main className={styles.root}>
      <div
        ref={frameRef}
        className={styles.frame}
        tabIndex={0}
        onFocus={() => {
          focusedRef.current = true
        }}
        onBlur={() => {
          focusedRef.current = false
        }}
        onMouseMove={(e) => {
          revealToolbar()
          const [nx, ny] = normalized(e.clientX, e.clientY)
          sendPointerMove(nx, ny)
        }}
        onMouseDown={(e) => {
          const button = BUTTON[e.button]
          if (!button) return
          const [nx, ny] = normalized(e.clientX, e.clientY)
          sendPointerButton(button, true, nx, ny)
        }}
        onMouseUp={(e) => {
          const button = BUTTON[e.button]
          if (!button) return
          const [nx, ny] = normalized(e.clientX, e.clientY)
          sendPointerButton(button, false, nx, ny)
        }}
        onWheel={(e) => sendScroll(e.deltaX, e.deltaY)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <video ref={videoRef} className={styles.video} autoPlay playsInline muted={false} />

        {!remoteStream && (
          <div className={styles.placeholder}>
            <span className={styles.ring} aria-hidden="true" />
            <span className={styles.placeholderText}>Establishing a secure link…</span>
          </div>
        )}

        <div
          className={[styles.toolbar, toolbarVisible ? styles.toolbarVisible : '']
            .filter(Boolean)
            .join(' ')}
        >
          <StatusDot status={status} />
          {peerCode !== null && <span className={styles.peerCode}>{peerCode}</span>}
          <span className={styles.toolbarSpacer} />
          <button type="button" className={styles.disconnect} onClick={disconnect}>
            Disconnect
          </button>
        </div>
      </div>
    </main>
  )
}
