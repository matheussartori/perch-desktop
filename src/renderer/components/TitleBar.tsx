/*
 * TitleBar — the custom chrome for the frameless window. The whole bar is a
 * drag handle; buttons opt out via the no-drag CSS region. Platform-aware: on
 * macOS it yields the left inset to the OS traffic lights and shows no custom
 * buttons; elsewhere it renders minimal minimize/maximize/close controls wired
 * to the preload bridge.
 */
import styles from './TitleBar.module.css'

/** The Perch mark: a branch curving up to a perched dot, in one amber stroke. */
function BrandMark(): React.JSX.Element {
  return (
    <svg
      className={styles.mark}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2 12.5c3.2 0 6-1.4 8.4-5"
        stroke="var(--amber)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="11" cy="5.4" r="2.1" fill="var(--amber)" />
    </svg>
  )
}

export function TitleBar(): React.JSX.Element {
  const isMac = window.perch?.platform === 'darwin'
  return (
    <header className={styles.bar} style={isMac ? { paddingLeft: 72 } : undefined}>
      <div className={styles.brand}>
        <BrandMark />
        <span className={styles.wordmark}>Perch</span>
      </div>
      <div className={styles.spacer} />
      {!isMac && (
        <div className={styles.windowButtons}>
          <button
            type="button"
            className={styles.winBtn}
            aria-label="Minimize"
            onClick={() => window.perch.minimize()}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          <button
            type="button"
            className={styles.winBtn}
            aria-label="Maximize"
            onClick={() => window.perch.toggleMaximize()}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <rect x="1.5" y="1.5" width="7" height="7" stroke="currentColor" strokeWidth="1.2" fill="none" />
            </svg>
          </button>
          <button
            type="button"
            className={[styles.winBtn, styles.close].filter(Boolean).join(' ')}
            aria-label="Close"
            onClick={() => window.perch.close()}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" />
              <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        </div>
      )}
    </header>
  )
}
