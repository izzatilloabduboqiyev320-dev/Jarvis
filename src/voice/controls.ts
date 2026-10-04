"use client";

import { useJarvis } from "@/lib/store";
import { getVoice } from "@/voice";
import { useVoiceSettings } from "@/voice/settings";
import { unlockAudio } from "@/voice/sounds";
import { BUSY_STATES } from "@/voice/voice-state";

let installed = false;

/**
 * Page-wide voice controls, installed once: ⌘⇧Space (Ctrl+Shift+Space) to
 * talk, Esc to stop JARVIS, and the voice assistant started from saved settings.
 */
export function installVoiceControls() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  useVoiceSettings.getState().load();

  window.addEventListener(
    "keydown",
    (e) => {
      const hud = useJarvis.getState().hud;
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === "Space") {
        e.preventDefault();
        unlockAudio();
        if (BUSY_STATES.includes(hud) || hud === "awake") getVoice().stop();
        else getVoice().listenNow();
      } else if (e.key === "Escape" && (BUSY_STATES.includes(hud) || hud === "listening" || hud === "awake")) {
        getVoice().stop();
      }
    },
    true,
  );
  // Browsers allow sound only after the first click or key press on the page.
  const unlock = () => {
    unlockAudio();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);

  if (useVoiceSettings.getState().enabled) useJarvis.getState().log("system", "Voice assistant on (saved setting)");
  getVoice().sync();
}
