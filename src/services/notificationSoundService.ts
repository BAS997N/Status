let audioContext: AudioContext | null = null;
let lastPlayedAt = 0;

const getAudioContext = () => {
  if (typeof window === "undefined") return null;
  const AudioContextClass =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioContext) audioContext = new AudioContextClass();
  return audioContext;
};

export async function unlockNotificationSound() {
  const context = getAudioContext();
  if (!context) return false;
  if (context.state === "suspended") await context.resume();
  return context.state === "running";
}

export async function playNotificationSound(force = false) {
  const now = Date.now();
  if (!force && now - lastPlayedAt < 2500) return false;

  const context = getAudioContext();
  if (!context) return false;
  if (context.state === "suspended") await context.resume();
  if (context.state !== "running") return false;

  lastPlayedAt = now;
  const startAt = context.currentTime + 0.015;
  const masterGain = context.createGain();
  masterGain.gain.setValueAtTime(0.0001, startAt);
  masterGain.gain.exponentialRampToValueAtTime(0.11, startAt + 0.025);
  masterGain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.52);
  masterGain.connect(context.destination);

  [
    { frequency: 740, offset: 0, duration: 0.2 },
    { frequency: 988, offset: 0.2, duration: 0.28 },
  ].forEach(({ frequency, offset, duration }) => {
    const oscillator = context.createOscillator();
    const noteGain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, startAt + offset);
    noteGain.gain.setValueAtTime(0.0001, startAt + offset);
    noteGain.gain.exponentialRampToValueAtTime(1, startAt + offset + 0.02);
    noteGain.gain.exponentialRampToValueAtTime(
      0.0001,
      startAt + offset + duration
    );
    oscillator.connect(noteGain);
    noteGain.connect(masterGain);
    oscillator.start(startAt + offset);
    oscillator.stop(startAt + offset + duration + 0.02);
  });

  return true;
}
