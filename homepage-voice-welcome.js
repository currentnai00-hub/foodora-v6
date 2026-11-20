"use strict";
(() => {
  const KEY = "foodora_voice_welcome_seen_v3";
  const root = document.getElementById("fdVoiceWelcome");
  if (!root) return;
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    root.hidden = true;
    return;
  }

  const playButton = root.querySelector("[data-voice-play]");
  const muteButton = root.querySelector("[data-voice-mute]");
  const status = root.querySelector("[data-voice-status]");
  let muted = false;
  let greeted = false;
  let fallbackTimer = null;
  let sequenceToken = 0;

  // Keep the complete welcome in one Bengali utterance. This avoids the
  // unnatural break between separate Arabic and Bengali speech engines.
  const welcomeText =
    "আসসালামু আলাইকুম ওয়া রাহমাতুল্লাহি ওয়া বারাকাতুহু। " +
    "আমাদের ওয়েবসাইটে আপনাকে আন্তরিক স্বাগতম। " +
    "আপনার পছন্দের খাবারটি বেছে নিতে মেনু ঘুরে দেখুন। " +
    "খুব সহজেই আপনার অর্ডারটি সম্পন্ন করতে পারবেন। " +
    "আপনার অর্ডারটি আমরা যত্নের সঙ্গে আপনার কাছে পৌঁছে দেওয়ার চেষ্টা করব। " +
    "আমাদের সঙ্গে থাকার জন্য আপনাকে আন্তরিক ধন্যবাদ।";

  const menuLink = document.querySelector('a[href="#menu"], #menu');

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  function chooseBengaliVoice() {
    const voices = window.speechSynthesis.getVoices();
    return voices.find(voice => /^bn(-|_)?BD$/i.test(voice.lang)) ||
      voices.find(voice => /^bn(-|_)/i.test(voice.lang)) ||
      voices.find(voice => /^bn$/i.test(voice.lang)) || null;
  }

  function stopSpeech() {
    sequenceToken += 1;
    window.speechSynthesis.cancel();
    root.classList.remove("is-speaking");
    if (fallbackTimer) window.clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }

  function speakWelcome() {
    if (muted) return;
    stopSpeech();
    greeted = false;
    const token = sequenceToken;
    const utterance = new SpeechSynthesisUtterance(welcomeText);
    const voice = chooseBengaliVoice();
    utterance.lang = voice ? voice.lang : "bn-BD";
    if (voice) utterance.voice = voice;
    utterance.rate = 0.96;
    utterance.pitch = 1;
    utterance.volume = 1;

    utterance.onstart = () => {
      if (token !== sequenceToken) return;
      root.classList.add("is-speaking");
      root.classList.remove("needs-gesture");
      setStatus("স্বাগতম বার্তা শোনা যাচ্ছে…");
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
    };
    utterance.onend = () => {
      if (token !== sequenceToken) return;
      greeted = true;
      root.classList.remove("is-speaking");
      setStatus("স্বাগতম! মেনু ঘুরে আপনার পছন্দের খাবার অর্ডার করুন।");
      try { sessionStorage.setItem(KEY, "1"); } catch (_) {}
    };
    utterance.onerror = () => {
      if (token !== sequenceToken) return;
      root.classList.remove("is-speaking");
      root.classList.add("needs-gesture");
      setStatus("ভয়েস শুনতে আবার ‘শুনুন’ বাটনে চাপ দিন");
    };

    window.speechSynthesis.speak(utterance);
    fallbackTimer = window.setTimeout(() => {
      if (!greeted && !muted && token === sequenceToken) {
        root.classList.add("needs-gesture");
        setStatus("স্বাগতম বার্তা শুনতে ‘শুনুন’ চাপ দিন");
      }
    }, 2200);
  }

  playButton?.addEventListener("click", speakWelcome);

  muteButton?.addEventListener("click", () => {
    muted = !muted;
    if (muted) stopSpeech();
    muteButton.setAttribute("aria-pressed", String(muted));
    muteButton.setAttribute("aria-label", muted ? "ভয়েস চালু করুন" : "ভয়েস বন্ধ করুন");
    muteButton.textContent = muted ? "শব্দ চালু" : "শব্দ বন্ধ";
    setStatus(muted ? "ভয়েস বন্ধ আছে" : "ভয়েস চালু আছে");
  });

  menuLink?.addEventListener("click", stopSpeech);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopSpeech();
  });

  let alreadySeen = false;
  try { alreadySeen = sessionStorage.getItem(KEY) === "1"; } catch (_) {}
  if (!alreadySeen) {
    // Browser autoplay may be blocked; the visible play button remains available.
    speakWelcome();
  } else {
    greeted = true;
    setStatus("স্বাগতম! মেনু ঘুরে আপনার পছন্দের খাবার অর্ডার করুন।");
  }
})();
