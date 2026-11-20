"use strict";
(() => {
  const root = document.getElementById("fdVoiceWelcome");
  if (!root) return;

  const audio = root.querySelector("[data-voice-audio]");
  const playButton = root.querySelector("[data-voice-play]");
  const muteButton = root.querySelector("[data-voice-mute]");
  const status = root.querySelector("[data-voice-status]");
  const menuLink = document.querySelector('a[href="#menu"], #menu');
  if (!audio || !playButton || !muteButton) {
    root.hidden = true;
    return;
  }

  const SEEN_KEY = "foodora_voice_welcome_seen_v4";
  let muted = false;
  let started = false;

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  function setPlaying(isPlaying) {
    root.classList.toggle("is-speaking", isPlaying);
    playButton.textContent = isPlaying ? "বিরতি" : "শুনুন";
    playButton.setAttribute("aria-label", isPlaying ? "স্বাগতম বার্তা বিরতি দিন" : "স্বাগতম বার্তা শুনুন");
  }

  async function playWelcome() {
    if (muted) return;
    if (audio.error) {
      setStatus("স্বাগতমের অডিও রেকর্ডিং এখনো যুক্ত করা হয়নি");
      return;
    }
    try {
      await audio.play();
      started = true;
      setPlaying(true);
      setStatus("স্বাগতম বার্তা শোনা যাচ্ছে…");
    } catch (_) {
      setPlaying(false);
      setStatus("স্বাগতম বার্তা শুনতে ‘শুনুন’ চাপ দিন");
    }
  }

  function pauseWelcome() {
    audio.pause();
    setPlaying(false);
  }

  playButton.addEventListener("click", () => {
    if (!audio.paused) {
      pauseWelcome();
      setStatus("স্বাগতম বার্তা বিরতিতে আছে");
      return;
    }
    playWelcome();
  });

  muteButton.addEventListener("click", () => {
    muted = !muted;
    audio.muted = muted;
    muteButton.setAttribute("aria-pressed", String(muted));
    muteButton.setAttribute("aria-label", muted ? "ভয়েস চালু করুন" : "ভয়েস বন্ধ করুন");
    muteButton.textContent = muted ? "শব্দ চালু" : "শব্দ বন্ধ";
    if (muted) {
      pauseWelcome();
      setStatus("ভয়েস বন্ধ আছে");
    } else {
      setStatus("ভয়েস চালু আছে");
    }
  });

  audio.addEventListener("play", () => {
    setPlaying(true);
    setStatus("স্বাগতম বার্তা শোনা যাচ্ছে…");
  });
  audio.addEventListener("pause", () => {
    if (!audio.ended) setPlaying(false);
  });
  audio.addEventListener("ended", () => {
    setPlaying(false);
    setStatus("স্বাগতম! মেনু ঘুরে আপনার পছন্দের খাবার অর্ডার করুন।");
    try { sessionStorage.setItem(SEEN_KEY, "1"); } catch (_) {}
  });
  audio.addEventListener("error", () => {
    setPlaying(false);
    setStatus("স্বাগতমের অডিও রেকর্ডিং এখনো যুক্ত করা হয়নি");
  });

  function stopForNavigation() {
    pauseWelcome();
  }
  menuLink?.addEventListener("click", stopForNavigation);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseWelcome();
  });

  function beginFirstVisitWelcome() {
    let alreadySeen = false;
    try { alreadySeen = sessionStorage.getItem(SEEN_KEY) === "1"; } catch (_) {}
    if (alreadySeen || started) return;
    playWelcome();
  }

  // Wait until the visual intro has finished before attempting the welcome audio.
  if (document.documentElement.classList.contains("fd-entry-pending")) {
    document.addEventListener("foodora:intro:finished", beginFirstVisitWelcome, { once: true });
  } else {
    beginFirstVisitWelcome();
  }
})();
