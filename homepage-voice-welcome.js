"use strict";
(() => {
  const KEY = "foodora_voice_welcome_seen_v2";
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
  let activeUtterance = null;
  let fallbackTimer = null;
  let sequenceToken = 0;

  // Arabic is spoken by an Arabic voice; the welcome and ordering guidance
  // are spoken separately by a Bengali voice for clearer pronunciation.
  const welcomeLines = [
    { text: "السلام عليكم ورحمة الله وبركاته", lang: "ar", voice: /^(ar)(-|_)/i },
    {
      text: "ফুডোরা ওয়েবসাইটে আপনাকে জানাই আন্তরিক স্বাগতম। আমাদের সুস্বাদু খাবারের মেনু থেকে আপনার পছন্দের খাবারটি দেখে নিন এবং সহজেই আপনার অর্ডারটি সম্পন্ন করুন। আপনার অর্ডারটি আমরা যত্ন ও আন্তরিকতার সঙ্গে আপনার কাছে পৌঁছে দেওয়ার চেষ্টা করব। ধন্যবাদ, ফুডোরার সঙ্গে থাকার জন্য।",
      lang: "bn-BD",
      voice: /^bn(-|_)?BD$/i
    }
  ];
  const menuLink = document.querySelector('a[href="#menu"], #menu');

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  function chooseVoice(pattern, fallbackPattern) {
    const voices = window.speechSynthesis.getVoices();
    return voices.find(voice => pattern.test(voice.lang)) ||
      voices.find(voice => fallbackPattern.test(voice.lang)) || null;
  }

  function stopSpeech() {
    sequenceToken += 1;
    window.speechSynthesis.cancel();
    root.classList.remove("is-speaking");
    activeUtterance = null;
    if (fallbackTimer) window.clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }

  function speakLine(index, token) {
    if (token !== sequenceToken || muted) return;
    if (index >= welcomeLines.length) {
      greeted = true;
      try { sessionStorage.setItem(KEY, "1"); } catch (_) {}
      root.classList.remove("is-speaking");
      setStatus("স্বাগতম! মেনু ঘুরে আপনার পছন্দের খাবার অর্ডার করুন।");
      activeUtterance = null;
      return;
    }

    const line = welcomeLines[index];
    const utterance = new SpeechSynthesisUtterance(line.text);
    const voice = chooseVoice(line.voice, line.lang === "ar" ? /^ar/i : /^bn/i);
    utterance.lang = voice ? voice.lang : line.lang;
    if (voice) utterance.voice = voice;
    utterance.rate = line.lang === "ar" ? 0.88 : 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;
    activeUtterance = utterance;

    utterance.onstart = () => {
      if (token !== sequenceToken) return;
      root.classList.add("is-speaking");
      root.classList.remove("needs-gesture");
      setStatus(index === 0 ? "আরবি সম্ভাষণ…" : "বাংলায় স্বাগতম ও অর্ডারের নির্দেশনা…");
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
    };
    utterance.onend = () => {
      if (token !== sequenceToken) return;
      speakLine(index + 1, token);
    };
    utterance.onerror = () => {
      if (token !== sequenceToken) return;
      root.classList.remove("is-speaking");
      activeUtterance = null;
      root.classList.add("needs-gesture");
      setStatus("ভয়েস শুনতে আবার ‘শুনুন’ বাটনে চাপ দিন");
    };
    window.speechSynthesis.speak(utterance);
  }

  function speakWelcome() {
    if (muted) return;
    stopSpeech();
    greeted = false;
    const token = sequenceToken;
    speakLine(0, token);
    fallbackTimer = window.setTimeout(() => {
      if (!greeted && !muted && token === sequenceToken) {
        root.classList.add("needs-gesture");
        setStatus("স্বাগতম বার্তা শুনতে ‘শুনুন’ চাপ দিন");
      }
    }, 1800);
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
    // Browsers may block autoplay; the visible play button is the accessible fallback.
    speakWelcome();
  } else {
    greeted = true;
    setStatus("স্বাগতম! মেনু ঘুরে আপনার পছন্দের খাবার অর্ডার করুন।");
  }
})();