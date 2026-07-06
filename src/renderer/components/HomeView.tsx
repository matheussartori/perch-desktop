/*
 * HomeView — the hero. Two deliberate paths: publish this machine's screen, or
 * dial a perch code to control another. The code field auto-uppercases and
 * formats to ABC-DEF-GHJ as you type, so what you enter mirrors what you were
 * shown. Connection and parse errors surface inline, right under the field.
 */
import { useState } from 'react'
import type { PerchController } from '../session/usePerchSession'
import styles from './HomeView.module.css'

interface HomeViewProps {
  host: PerchController['host']
  connect: PerchController['connect']
  error: string | null
  busy: boolean
  notice: string | null
  needsAddress: boolean
}

const MAX_CHARS = 9

/** Keep alphanumerics, uppercase them, cap at nine, regroup as ABC-DEF-GHJ. */
function formatCode(raw: string): string {
  const chars = raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, MAX_CHARS)
  const groups = chars.match(/.{1,3}/g) ?? []
  return groups.join('-')
}

export function HomeView({
  host,
  connect,
  error,
  busy,
  notice,
  needsAddress
}: HomeViewProps): React.JSX.Element {
  const [value, setValue] = useState('')
  const [address, setAddress] = useState('')
  const isMac = window.perch?.platform === 'darwin'
  const codeReady = value.replace(/-/g, '').length === MAX_CHARS
  const addressReady = !needsAddress || address.trim().length > 0
  const canConnect = codeReady && addressReady && !busy

  const submit = (): void => {
    if (canConnect) void connect(value, address)
  }

  return (
    <main className={styles.root}>
      <div className={styles.masthead}>
        <h1 className={styles.title}>Perch</h1>
        <p className={styles.tagline}>
          Reach another machine from a distance, or hand someone a view of yours.
        </p>
      </div>

      <div className={styles.paths}>
        <section className={styles.card}>
          <span className={styles.cardLabel}>Share</span>
          <p className={styles.cardHint}>
            Get a perch code to share. Whoever you give it to can see and control this{' '}
            {isMac ? 'Mac' : 'screen'}.
          </p>
          <div className={styles.grow} />
          <button
            type="button"
            className={styles.primary}
            onClick={() => void host()}
            disabled={busy}
          >
            {isMac ? 'Share this Mac' : 'Share this screen'}
          </button>
        </section>

        <section className={styles.card}>
          <span className={styles.cardLabel}>Connect</span>
          <p className={styles.cardHint}>
            {needsAddress
              ? "Enter the host's address and the perch code they shared with you."
              : 'Enter the perch code they shared with you.'}
          </p>
          <div className={styles.grow} />
          {needsAddress && (
            <div className={styles.field}>
              <input
                className={styles.address}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit()
                }}
                placeholder="Host address (e.g. 192.168.1.20)"
                spellCheck={false}
                autoComplete="off"
                aria-label="Host address"
                disabled={busy}
              />
            </div>
          )}
          <div className={styles.field}>
            <input
              className={styles.input}
              value={value}
              onChange={(e) => setValue(formatCode(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
              }}
              placeholder="Enter a perch code"
              spellCheck={false}
              autoComplete="off"
              aria-label="Perch code"
              aria-invalid={error !== null}
              disabled={busy}
            />
            <button
              type="button"
              className={styles.secondary}
              onClick={submit}
              disabled={!canConnect}
            >
              {busy ? 'Connecting…' : 'Connect'}
            </button>
          </div>
          {busy && notice !== null && <p className={styles.notice}>{notice}</p>}
          {!busy && error !== null && <p className={styles.error}>{error}</p>}
        </section>
      </div>
    </main>
  )
}
