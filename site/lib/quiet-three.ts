/**
 * @react-three/fiber (9.8.2, the latest release) builds its frame clock with
 * THREE.Clock, which three.js has deprecated; every canvas logs the same
 * warning once. The warning is not ours to act on, so this drops that one
 * message and nothing else. Remove this module when fiber moves to
 * THREE.Timer.
 */
const DEPRECATED_CLOCK = "THREE.Clock: This module has been deprecated";

if (typeof window !== "undefined") {
  const warn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].startsWith(DEPRECATED_CLOCK)) {
      return;
    }
    warn.apply(console, args);
  };
}

export {};
