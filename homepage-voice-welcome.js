"use strict";
(() => {
  const KEY = "foodora_voice_welcome_seen_v1";
  const root = document.getElementById("fdVoiceWelcome");
  if (!root || !("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;

  const playButton = root.querySelector("[data-voice-play]");
  const muteButton = root.querySelector("[data-voice-mute]");
  const status = root.querySelector("[data-voice-status]");
  let muted = false;
  let greeted = false;
  let activeUtterance = null;
  let fallbackTimer = null;

  const greeting = "আসসালামু আলাইকুম। ফুডোরায় আপনাকে আন্তরিক স্বাগতম। আজকের সতেজ ও সুস্বাদু খাবারের মেনু ঘুরে দেখুন। আপনার পছন্দের খাবারটি বেছে নিন, আমরা যত্নের সঙ্গে পৌঁছে দেব আপনার ঠিকানায়।";
  const menuLink = document.querySelector('a[href="#menu"], #menu');

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  function chooseVoice() {
    const voices = window.speechSynthesis.getVoices();
    return voices.find(voice => /^bn(-|_)?BD$/i.test(voice.lang)) ||
      voices.find(voice => /^bn/i.test(voice.lang)) ||
      voices.find(voice => /^en(-|_)?IN$/i.test(voice.lang)) ||
      voices.find(voice => /^en/i.test(voice.lang)) || null;
  }

  function speakWelcome() {
    if (muted || greeted) return;
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(greeting);
    const voice = chooseVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = "bn-BD";
    }
    utterance.rate = 0.88;
    utterance.pitch = 0.9;
    utterance.volume = 0.95;
    activeUtterance = utterance;
    utterance.onstart = () => {
      greeted = true;
      try { sessionStorage.setItem(KEY, "1"); } catch (_) {}
      root.classList.add("is-speaking");
      setStatus("Foodora আপনাকে স্বাগতম জানাচ্ছে");
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
      root.classList.remove("needs-gesture");
    };
    utterance.onend = () => {
      root.classList.remove("is-speaking");
      setStatus("স্বাগতম! মেনু ঘুরে দেখুন।");
      activeUtterance = null;
    };
    utterance.onerror = () => {
      root.classList.remove("is-speaking");
      activeUtterance = null;
      root.classList.add("needs-gesture");
      setStatus("শুনতে নিচের বাটনে চাপ দিন");
    };
    window.speechSynthesis.speak(utterance);
    if (fallbackTimer) window.clearTimeout(fallbackTimer);
    fallbackTimer = window.setTimeout(() => {
      if (!greeted && !muted) {
        root.classList.add("needs-gesture");
        setStatus("স্বাগতম বার্তা শুনতে চাপ দিন");
      }
    }, 1800);
  }

  function stopSpeech() {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    root.classList.remove("is-speaking");
    activeUtterance = null;
  }

  playButton?.addEventListener("click", () => {
    greeted = false;
    speakWelcome();
  });

  muteButton?.addEventListener("click", () => {
    muted = !muted;
    if (muted) stopSpeech();
    muteButton.setAttribute("aria-pressed", String(muted));
    muteButton.textContent = muted ? "শব্দ বন্ধ" : "শব্দ চালু";
    setStatus(muted ? "ভয়েস বন্ধ আছে" : "ভয়েস চালু আছে");
  });

  menuLink?.addEventListener("click", () => {
    if (activeUtterance) stopSpeech();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopSpeech();
  });

  let alreadySeen = false;
  try { alreadySeen = sessionStorage.getItem(KEY) === "1"; } catch (_) {}
  if (!alreadySeen) {
    // Attempt a welcome on first entry. Browsers that block speech until a gesture
    // receive a visible, accessible one-tap fallback instead.
    speakWelcome();
  } else {
    greeted = true;
    setStatus("স্বাগতম! মেনু ঘুরে দেখুন।");
  }
})();
