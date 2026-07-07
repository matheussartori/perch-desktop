/**
 * Host-side InputController backed by nut-js. Runs ONLY in the main process,
 * where native OS input injection is available. It translates the domain's
 * normalized, device-independent InputEvents into real cursor/keyboard actions:
 * normalized [0,1] coordinates become pixels against the host's own resolution
 * (so a laptop controller can drive a 4K host), and DOM `code` values become
 * nut-js Key enum members.
 */
import { mouse, keyboard, Button, Key, Point, screen } from '@nut-tree-fork/nut-js'
import type { InputController } from '@domain/input/InputController'
import type { InputEvent, PointerButton } from '@domain/input/InputEvent'

/** Domain pointer buttons → nut-js Button enum. */
const BUTTON_MAP: Record<PointerButton, Button> = {
  left: Button.LEFT,
  right: Button.RIGHT,
  middle: Button.MIDDLE
}

/**
 * DOM `KeyboardEvent.code` → nut-js Key. Codes are layout-independent (physical
 * key positions), which keeps the mapping stable across keyboard layouts.
 * Unknown codes are ignored rather than guessed, so we never inject a wrong key.
 */
const CODE_TO_KEY: Record<string, Key> = {
  // Letters
  KeyA: Key.A, KeyB: Key.B, KeyC: Key.C, KeyD: Key.D, KeyE: Key.E, KeyF: Key.F,
  KeyG: Key.G, KeyH: Key.H, KeyI: Key.I, KeyJ: Key.J, KeyK: Key.K, KeyL: Key.L,
  KeyM: Key.M, KeyN: Key.N, KeyO: Key.O, KeyP: Key.P, KeyQ: Key.Q, KeyR: Key.R,
  KeyS: Key.S, KeyT: Key.T, KeyU: Key.U, KeyV: Key.V, KeyW: Key.W, KeyX: Key.X,
  KeyY: Key.Y, KeyZ: Key.Z,
  // Digits (top row)
  Digit0: Key.Num0, Digit1: Key.Num1, Digit2: Key.Num2, Digit3: Key.Num3,
  Digit4: Key.Num4, Digit5: Key.Num5, Digit6: Key.Num6, Digit7: Key.Num7,
  Digit8: Key.Num8, Digit9: Key.Num9,
  // Editing / navigation
  Enter: Key.Enter,
  Escape: Key.Escape,
  Backspace: Key.Backspace,
  Tab: Key.Tab,
  Space: Key.Space,
  Delete: Key.Delete,
  Insert: Key.Insert,
  Home: Key.Home,
  End: Key.End,
  PageUp: Key.PageUp,
  PageDown: Key.PageDown,
  CapsLock: Key.CapsLock,
  // Arrows
  ArrowLeft: Key.Left,
  ArrowRight: Key.Right,
  ArrowUp: Key.Up,
  ArrowDown: Key.Down,
  // Modifiers (both sides)
  ShiftLeft: Key.LeftShift,
  ShiftRight: Key.RightShift,
  ControlLeft: Key.LeftControl,
  ControlRight: Key.RightControl,
  AltLeft: Key.LeftAlt,
  AltRight: Key.RightAlt,
  MetaLeft: Key.LeftSuper,
  MetaRight: Key.RightSuper,
  // Common punctuation
  Minus: Key.Minus,
  Equal: Key.Equal,
  BracketLeft: Key.LeftBracket,
  BracketRight: Key.RightBracket,
  Backslash: Key.Backslash,
  Semicolon: Key.Semicolon,
  Quote: Key.Quote,
  Backquote: Key.Grave,
  Comma: Key.Comma,
  Period: Key.Period,
  Slash: Key.Slash
}

export class NutJsInputController implements InputController {
  /** Codes we have already warned about, so the log isn't flooded per keystroke. */
  private readonly warnedCodes = new Set<string>()

  /**
   * Cached host resolution. Querying nut-js `screen.width()/height()` is a native
   * round-trip, and doing it on every pointer-move (60+/sec) throttles how fast
   * we can drain input — the dominant cause of cursor lag. The grid changes only
   * when a display is (un)plugged, so a short TTL keeps us correct without paying
   * the native cost per event.
   */
  private cachedScreen: { width: number; height: number; at: number } | null = null
  private static readonly SCREEN_TTL_MS = 1000

  constructor() {
    // Zero auto-delays: remote control needs each event applied immediately,
    // not paced for human-visible "typing" animations.
    keyboard.config.autoDelayMs = 0
    mouse.config.autoDelayMs = 0
  }

  async apply(event: InputEvent): Promise<void> {
    try {
      switch (event.type) {
        case 'pointer-move': {
          const point = await this.toPixels(event.x, event.y)
          await mouse.setPosition(point)
          break
        }
        case 'pointer-button': {
          // Move first so the press/release lands where the controller intended.
          const point = await this.toPixels(event.x, event.y)
          await mouse.setPosition(point)
          const button = BUTTON_MAP[event.button]
          if (event.pressed) await mouse.pressButton(button)
          else await mouse.releaseButton(button)
          break
        }
        case 'pointer-scroll': {
          // nut-js scrolls in positive "steps" per direction, so split each axis
          // into its sign and use the rounded magnitude.
          if (event.dy > 0) await mouse.scrollDown(Math.round(Math.abs(event.dy)))
          else if (event.dy < 0) await mouse.scrollUp(Math.round(Math.abs(event.dy)))
          if (event.dx > 0) await mouse.scrollRight(Math.round(Math.abs(event.dx)))
          else if (event.dx < 0) await mouse.scrollLeft(Math.round(Math.abs(event.dx)))
          break
        }
        case 'key': {
          const key = CODE_TO_KEY[event.code]
          if (key === undefined) {
            this.warnUnknownCode(event.code)
            break
          }
          // Each modifier arrives as its own key event, so pressing/releasing the
          // mapped key is enough to reproduce shortcuts faithfully.
          if (event.pressed) await keyboard.pressKey(key)
          else await keyboard.releaseKey(key)
          break
        }
      }
    } catch (cause) {
      // Rethrow with context so the use case can surface a meaningful failure.
      throw new Error(`Failed to apply input event (${event.type}): ${String(cause)}`)
    }
  }

  /** Map normalized [0,1] coordinates to the host's actual pixel grid. */
  private async toPixels(x: number, y: number): Promise<Point> {
    const { width, height } = await this.resolution()
    return new Point(Math.round(x * width), Math.round(y * height))
  }

  /**
   * Host resolution, cached with a short TTL. Avoids two native round-trips per
   * pointer-move while still picking up a display change within a second.
   */
  private async resolution(): Promise<{ width: number; height: number }> {
    const now = Date.now()
    const cached = this.cachedScreen
    if (cached && now - cached.at < NutJsInputController.SCREEN_TTL_MS) return cached
    const [width, height] = await Promise.all([screen.width(), screen.height()])
    this.cachedScreen = { width, height, at: now }
    return this.cachedScreen
  }

  private warnUnknownCode(code: string): void {
    if (this.warnedCodes.has(code)) return
    this.warnedCodes.add(code)
    console.warn(`NutJsInputController: no mapping for key code "${code}" — ignoring.`)
  }
}
