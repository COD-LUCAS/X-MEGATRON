export function blockNoise() {
  const blocked = [
    "libsignal",
    "signal",
    "closing open session",
    "rekey",
    "chainKey",
    "ephemeralKeyPair",
    "preKey",
    "Buffer"
  ];

  const original = console.log;
  console.log = (...args) => {
    const text = args.join(" ");
    if (blocked.some(k => text.includes(k))) return;
    original(...args);
  };

  console.warn = () => {};
  console.debug = () => {};
      }
