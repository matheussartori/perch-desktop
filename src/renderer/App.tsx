/*
 * App — the renderer's root. It owns the session controller and switches the
 * active view on mode: home, hosting, or controlling. The title bar is always
 * present. It also remembers which code the controller dialed, so the control
 * surface can label the peer (the hook exposes myCode only for the host side).
 */
import { useCallback, useState } from 'react'
import { usePerchSession } from './session/usePerchSession'
import { TitleBar } from './components/TitleBar'
import { HomeView } from './components/HomeView'
import { HostingView } from './components/HostingView'
import { ControlSurface } from './components/ControlSurface'
import styles from './App.module.css'

export function App(): React.JSX.Element {
  const session = usePerchSession()
  const [dialedCode, setDialedCode] = useState<string | null>(null)

  // Wrap connect so we can display the dialed code on the control surface.
  const connect = useCallback(
    async (rawCode: string, hostAddress: string): Promise<void> => {
      setDialedCode(rawCode)
      await session.connect(rawCode, hostAddress)
    },
    [session]
  )

  return (
    <div className={styles.shell}>
      <TitleBar />
      {session.mode === 'home' && (
        <HomeView
          host={session.host}
          connect={connect}
          error={session.error}
          busy={session.busy}
          notice={session.notice}
          needsAddress={session.needsAddress}
        />
      )}
      {session.mode === 'hosting' && session.myCode !== null && (
        <HostingView
          myCode={session.myCode}
          status={session.status}
          disconnect={session.disconnect}
        />
      )}
      {session.mode === 'controlling' && (
        <ControlSurface
          remoteStream={session.remoteStream}
          status={session.status}
          peerCode={dialedCode}
          disconnect={session.disconnect}
          sendPointerMove={session.sendPointerMove}
          sendPointerButton={session.sendPointerButton}
          sendScroll={session.sendScroll}
          sendKey={session.sendKey}
        />
      )}
    </div>
  )
}
