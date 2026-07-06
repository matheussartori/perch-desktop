/*
 * PerchCode — the app's identity element. Takes a code in display form
 * (ABC-DEF-GHJ), splits it on its group separators, and renders each character
 * as its own monospace tile. A ghost copy button surfaces on hover and copies
 * the canonical, hyphen-free code (the form you paste back to connect),
 * flashing a brief "Copied" confirmation.
 */
import { useCallback, useRef, useState } from 'react'
import styles from './PerchCode.module.css'

interface PerchCodeProps {
  /** Display form, e.g. "ABC-DEF-GHJ". */
  code: string
  onCopy?: () => void
}

export function PerchCode({ code, onCopy }: PerchCodeProps): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const groups = code.split('-')

  const copy = useCallback(() => {
    const raw = code.replace(/-/g, '')
    void navigator.clipboard?.writeText(raw)
    onCopy?.()
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1600)
  }, [code, onCopy])

  return (
    <div className={styles.root}>
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.groups} aria-label={`Perch code ${code}`}>
        {groups.map((group, gi) => (
          <div className={styles.group} key={gi}>
            {Array.from(group).map((ch, ci) => (
              <span className={styles.cell} key={ci}>
                {ch}
              </span>
            ))}
          </div>
        ))}
      </div>
      <button
        type="button"
        className={[styles.copy, copied ? styles.copied : ''].filter(Boolean).join(' ')}
        onClick={copy}
      >
        {copied ? 'Copied' : 'Copy code'}
      </button>
    </div>
  )
}
