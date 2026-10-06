"use client";

import { useEffect, useRef, useState } from "react";
import { CornersOut, Pause, Play, SpeakerHigh, SpeakerX } from "@phosphor-icons/react";
import { videoEmbed } from "@/lib/product-content";

type PlayerStateEvent = { data: number; target: YouTubePlayer };
type YouTubePlayer = {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getVolume(): number;
  setVolume(volume: number): void;
  isMuted(): boolean;
  mute(): void;
  unMute(): void;
  getAvailablePlaybackRates(): number[];
  setPlaybackRate(rate: number): void;
  getPlayerState(): number;
  destroy(): void;
};
type YouTubeNamespace = {
  Player: new (
    iframe: HTMLIFrameElement,
    options: {
      events: {
        onReady: (event: { target: YouTubePlayer }) => void;
        onStateChange: (event: PlayerStateEvent) => void;
        onError: () => void;
      };
    },
  ) => YouTubePlayer;
};
type VimeoTextTrack = { label?: string; language: string; kind: "captions" | "subtitles"; mode?: string };
type VimeoPlayer = {
  ready(): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  setCurrentTime(seconds: number): Promise<number>;
  getCurrentTime(): Promise<number>;
  getDuration(): Promise<number>;
  getVolume(): Promise<number>;
  setVolume(volume: number): Promise<number>;
  getPlaybackRate(): Promise<number>;
  setPlaybackRate(rate: number): Promise<number>;
  getTextTracks(): Promise<VimeoTextTrack[]>;
  enableTextTrack(language: string, kind?: string): Promise<VimeoTextTrack>;
  disableTextTrack(): Promise<void>;
  on(event: string, listener: (data?: unknown) => void): void;
  off(event: string, listener: (data?: unknown) => void): void;
  destroy(): Promise<void>;
};
type VimeoNamespace = { Player: new (iframe: HTMLIFrameElement, options?: Record<string, unknown>) => VimeoPlayer };
type TrackOption = { value: string; language: string; kind: "captions" | "subtitles"; label: string };
type VideoProvider = "youtube" | "vimeo";

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    Vimeo?: VimeoNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<YouTubeNamespace> | undefined;
let vimeoApiPromise: Promise<VimeoNamespace> | undefined;

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise<YouTubeNamespace>((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    const timeout = window.setTimeout(() => reject(new Error("Le lecteur ne répond pas.")), 15000);
    window.onYouTubeIframeAPIReady = () => {
      try { previousReady?.(); } catch { /* Keep the video API available if another callback fails. */ }
      window.clearTimeout(timeout);
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("Le lecteur ne répond pas."));
    };

    let script = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    if (!script) {
      script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener("error", () => {
      window.clearTimeout(timeout);
      reject(new Error("Le lecteur ne répond pas."));
    }, { once: true });
  });

  return youtubeApiPromise;
}

function loadVimeoApi() {
  if (window.Vimeo?.Player) return Promise.resolve(window.Vimeo);
  if (vimeoApiPromise) return vimeoApiPromise;

  vimeoApiPromise = new Promise<VimeoNamespace>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://player.vimeo.com/api/player.js"]');
    const script = existing ?? document.createElement("script");
    const finish = () => {
      if (window.Vimeo?.Player) resolve(window.Vimeo);
      else reject(new Error("Le lecteur ne répond pas."));
    };
    const fail = () => reject(new Error("Le lecteur ne répond pas."));

    if (existing && window.Vimeo?.Player) {
      resolve(window.Vimeo);
      return;
    }
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", fail, { once: true });
    if (!existing) {
      script.src = "https://player.vimeo.com/api/player.js";
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return vimeoApiPromise;
}

function getProvider(embedUrl: string): VideoProvider | null {
  const host = new URL(embedUrl).hostname;
  if (host === "www.youtube-nocookie.com" || host === "youtube-nocookie.com") return "youtube";
  if (host === "player.vimeo.com") return "vimeo";
  return null;
}

function getEmbedUrl(embedUrl: string, provider: VideoProvider) {
  const url = new URL(embedUrl);
  if (provider === "youtube") {
    url.searchParams.set("controls", "0");
    url.searchParams.set("enablejsapi", "1");
    url.searchParams.set("disablekb", "1");
    url.searchParams.set("playsinline", "1");
    url.searchParams.set("rel", "0");
    url.searchParams.set("origin", window.location.origin);
  } else {
    url.searchParams.set("controls", "0");
    url.searchParams.set("title", "0");
    url.searchParams.set("byline", "0");
    url.searchParams.set("portrait", "0");
    url.searchParams.set("vimeo_logo", "0");
    url.searchParams.set("playsinline", "1");
    url.searchParams.set("dnt", "1");
  }
  return url.toString();
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}` : `${minutes}:${String(rest).padStart(2, "0")}`;
}

function languageLabel(language: string) {
  try { return new Intl.DisplayNames(["fr"], { type: "language" }).of(language) ?? language.toUpperCase(); }
  catch { return language.toUpperCase(); }
}

function getRates(player: YouTubePlayer) {
  try {
    const rates = player.getAvailablePlaybackRates().filter((rate) => Number.isFinite(rate));
    return rates.length > 1 ? rates : [1];
  } catch { return [1]; }
}

export function VideoPlayer({ url, title }: { url: string; title: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | VimeoPlayer | null>(null);
  const rememberedVolume = useRef(0.75);
  const [provider, setProvider] = useState<VideoProvider | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.75);
  const [rates, setRates] = useState<number[]>([1]);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [tracks, setTracks] = useState<TrackOption[]>([]);
  const [selectedTrack, setSelectedTrack] = useState("");
  const [fullscreen, setFullscreen] = useState(false);

  const embedUrl = videoEmbed(url);
  let detectedProvider: VideoProvider | null = null;
  try { detectedProvider = embedUrl ? getProvider(embedUrl) : null; } catch { detectedProvider = null; }
  const frameUrl = embedUrl && detectedProvider ? getEmbedUrl(embedUrl, detectedProvider) : undefined;

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !frameUrl || !detectedProvider) {
      setError("Cette vidéo ne peut pas être lue pour le moment.");
      return;
    }

    let active = true;
    let currentPlayer: YouTubePlayer | VimeoPlayer | null = null;
    const vimeoListeners: Array<[VimeoPlayer, string, (data?: unknown) => void]> = [];
    setProvider(detectedProvider);
    setReady(false);
    setError(null);
    setPlaying(false);
    setEnded(false);
    setCurrentTime(0);
    setDuration(0);
    setRates([1]);
    setTracks([]);
    setSelectedTrack("");

    const syncYouTube = (player: YouTubePlayer) => {
      if (!active) return;
      const time = player.getCurrentTime();
      const length = player.getDuration();
      const nextVolume = player.getVolume() / 100;
      if (Number.isFinite(time)) setCurrentTime(time);
      if (Number.isFinite(length)) setDuration(length);
      if (Number.isFinite(nextVolume)) setVolume(nextVolume);
    };

    if (detectedProvider === "youtube") {
      void loadYouTubeApi().then((api) => {
        if (!active || !iframeRef.current) return;
        const player = new api.Player(iframeRef.current, {
          events: {
            onReady: ({ target }) => {
              if (!active) { target.destroy(); return; }
              currentPlayer = target;
              playerRef.current = target;
              setReady(true);
              syncYouTube(target);
              setRates(getRates(target));
            },
            onStateChange: ({ data, target }) => {
              if (!active) return;
              setPlaying(data === 1);
              setEnded(data === 0);
              syncYouTube(target);
            },
            onError: () => { if (active) setError("Cette vidéo ne peut pas être lue pour le moment. Vérifiez son adresse auprès du créateur."); },
          },
        });
        currentPlayer = player;
        playerRef.current = player;
      }).catch(() => {
        if (active) setError("Cette vidéo ne peut pas être chargée pour le moment. Vérifiez votre connexion et réessayez.");
      });
    } else {
      void loadVimeoApi().then(async (api) => {
        if (!active || !iframeRef.current) return;
        const player = new api.Player(iframeRef.current, { controls: false, title: false, byline: false, portrait: false, vimeo_logo: false, autopause: true, dnt: true });
        currentPlayer = player;
        playerRef.current = player;

        const listen = (event: string, callback: (data?: unknown) => void) => {
          vimeoListeners.push([player, event, callback]);
          player.on(event, callback);
        };
        listen("play", () => { if (active) { setPlaying(true); setEnded(false); } });
        listen("pause", () => { if (active) setPlaying(false); });
        listen("ended", () => { if (active) { setPlaying(false); setEnded(true); } });
        listen("timeupdate", (data) => {
          if (!active || !data || typeof data !== "object") return;
          const values = data as { seconds?: number; duration?: number };
          if (Number.isFinite(values.seconds)) setCurrentTime(values.seconds ?? 0);
          if (Number.isFinite(values.duration)) setDuration(values.duration ?? 0);
        });
        listen("volumechange", (data) => {
          if (!active || !data || typeof data !== "object") return;
          const nextVolume = (data as { volume?: number }).volume;
          if (typeof nextVolume === "number") setVolume(nextVolume);
        });
        listen("error", () => { if (active) setError("Cette vidéo ne peut pas être lue pour le moment. Vérifiez son adresse auprès du créateur."); });

        try {
          await player.ready();
          if (!active) { await player.destroy(); return; }
          setReady(true);
          const [time, length, currentVolume, currentRate, availableTracks] = await Promise.all([
            player.getCurrentTime(),
            player.getDuration(),
            player.getVolume(),
            player.getPlaybackRate().catch(() => 1),
            player.getTextTracks().catch(() => []),
          ]);
          if (!active) return;
          setCurrentTime(time);
          setDuration(length);
          setVolume(currentVolume);
          rememberedVolume.current = currentVolume || 0.75;
          setPlaybackRate(currentRate);
          setTracks(availableTracks.flatMap((track, index) => track.language && track.kind ? [{
            value: String(index),
            language: track.language,
            kind: track.kind,
            label: track.label?.trim() || languageLabel(track.language),
          }] : []));
          const activeTrack = availableTracks.findIndex((track) => track.mode === "showing");
          setSelectedTrack(activeTrack >= 0 ? String(activeTrack) : "off");
          const supportedRates = [1];
          for (const rate of [0.5, 0.75, 1.25, 1.5, 2]) {
            try {
              await player.setPlaybackRate(rate);
              supportedRates.push(rate);
            } catch { /* Some videos do not support custom playback rates. */ }
          }
          try { await player.setPlaybackRate(currentRate); } catch { /* Keep the original rate when it cannot be restored. */ }
          if (active) setRates(supportedRates.sort((left, right) => left - right));
        } catch {
          if (active) setError("Cette vidéo ne peut pas être chargée pour le moment. Vérifiez son adresse auprès du créateur.");
        }

      }).catch(() => {
        if (active) setError("Cette vidéo ne peut pas être chargée pour le moment. Vérifiez votre connexion et réessayez.");
      });
    }

    return () => {
      active = false;
      playerRef.current = null;
      vimeoListeners.forEach(([player, event, callback]) => player.off(event, callback));
      if (currentPlayer) {
        if (detectedProvider === "youtube") (currentPlayer as YouTubePlayer).destroy();
        else void (currentPlayer as VimeoPlayer).destroy().catch(() => undefined);
      }
    };
  }, [frameUrl, detectedProvider]);

  useEffect(() => {
    if (!playing || provider !== "youtube") return;
    const timer = window.setInterval(() => {
      const player = playerRef.current as YouTubePlayer | null;
      if (!player) return;
      const time = player.getCurrentTime();
      const length = player.getDuration();
      if (Number.isFinite(time)) setCurrentTime(time);
      if (Number.isFinite(length)) setDuration(length);
    }, 500);
    return () => window.clearInterval(timer);
  }, [playing, provider]);

  useEffect(() => {
    const updateFullscreen = () => setFullscreen(document.fullscreenElement === shellRef.current);
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  async function togglePlayback() {
    const player = playerRef.current;
    if (!player || !provider || !ready) return;
    try {
      if (provider === "youtube") {
        const youtube = player as YouTubePlayer;
        if (playing) youtube.pauseVideo();
        else {
          if (ended) youtube.seekTo(0, true);
          youtube.playVideo();
        }
      } else {
        const vimeo = player as VimeoPlayer;
        if (playing) await vimeo.pause();
        else {
          if (ended) await vimeo.setCurrentTime(0);
          await vimeo.play();
        }
      }
    } catch {
      setError("La lecture n’a pas pu démarrer. Réessayez dans un instant.");
    }
  }

  async function seek(value: number) {
    setCurrentTime(value);
    const player = playerRef.current;
    if (!player || !provider) return;
    try {
      if (provider === "youtube") (player as YouTubePlayer).seekTo(value, true);
      else await (player as VimeoPlayer).setCurrentTime(value);
    } catch { setError("La position de lecture n’a pas pu être modifiée."); }
  }

  async function changeVolume(value: number) {
    setVolume(value);
    if (value > 0) rememberedVolume.current = value;
    const player = playerRef.current;
    if (!player || !provider) return;
    try {
      if (provider === "youtube") {
        const youtube = player as YouTubePlayer;
        youtube.setVolume(Math.round(value * 100));
        if (value === 0) youtube.mute(); else youtube.unMute();
      } else await (player as VimeoPlayer).setVolume(value);
    } catch { setError("Le volume ne peut pas être modifié sur cet appareil."); }
  }

  async function toggleMute() {
    const player = playerRef.current;
    if (!player || !provider) return;
    if (volume > 0) await changeVolume(0);
    else await changeVolume(rememberedVolume.current || 0.75);
  }

  async function changeRate(value: number) {
    const player = playerRef.current;
    if (!player || !provider) return;
    try {
      if (provider === "youtube") (player as YouTubePlayer).setPlaybackRate(value);
      else await (player as VimeoPlayer).setPlaybackRate(value);
      setPlaybackRate(value);
    } catch {
      setRates([1]);
      setPlaybackRate(1);
    }
  }

  async function changeTrack(value: string) {
    const player = playerRef.current;
    if (!player || provider !== "vimeo") return;
    try {
      if (value === "off") await (player as VimeoPlayer).disableTextTrack();
      else {
        const track = tracks.find((item) => item.value === value);
        if (track) await (player as VimeoPlayer).enableTextTrack(track.language, track.kind);
      }
      setSelectedTrack(value);
    } catch { setError("Cette piste de texte n’est pas disponible pour le moment."); }
  }

  async function toggleFullscreen() {
    const shell = shellRef.current;
    if (!shell) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (shell.requestFullscreen) await shell.requestFullscreen();
      else setError("Le plein écran n’est pas disponible sur cet appareil.");
    } catch { setError("Le plein écran n’est pas disponible sur cet appareil."); }
  }

  const muted = volume <= 0.01;

  return (
    <div className="unified-video" ref={shellRef} role="group" aria-label={`Lecteur vidéo : ${title}`}>
      {frameUrl && <iframe
        key={frameUrl}
        ref={iframeRef}
        className="unified-video-frame"
        src={frameUrl}
        title={title}
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        tabIndex={-1}
      />}
      {!ready && !error && <div className="unified-video-loading" role="status">Chargement de la vidéo</div>}
      {error && <div className="unified-video-error" role="alert">{error}</div>}
      {ready && !error && <div className="unified-video-controls" aria-label="Commandes vidéo">
        <input
          className="unified-video-progress"
          type="range"
          min={0}
          max={Math.max(duration, 0)}
          step={0.1}
          value={Math.min(currentTime, duration || 0)}
          aria-label="Position de lecture"
          disabled={!duration}
          onChange={(event) => void seek(Number(event.target.value))}
        />
        <div className="unified-video-toolbar">
          <button className="unified-video-button" type="button" onClick={() => void togglePlayback()} aria-label={ended ? "Rejouer la vidéo" : playing ? "Mettre en pause" : "Lire la vidéo"}>
            {playing ? <Pause size={19} weight="fill" /> : <Play size={19} weight="fill" />}
          </button>
          <span className="unified-video-time" aria-live="off">{formatTime(currentTime)} / {formatTime(duration)}</span>
          <button className="unified-video-button" type="button" onClick={() => void toggleMute()} aria-label={muted ? "Activer le son" : "Couper le son"}>
            {muted ? <SpeakerX size={19} /> : <SpeakerHigh size={19} />}
          </button>
          <input
            className="unified-video-volume"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            aria-label="Volume"
            onChange={(event) => void changeVolume(Number(event.target.value))}
          />
          {rates.length > 1 && <select className="unified-video-select" aria-label="Vitesse de lecture" value={playbackRate} onChange={(event) => void changeRate(Number(event.target.value))}>
            {rates.map((rate) => <option key={rate} value={rate}>{rate === 1 ? "Normale" : `${rate}×`}</option>)}
          </select>}
          {tracks.length > 0 && <select className="unified-video-select unified-video-captions" aria-label="Sous-titres" value={selectedTrack} onChange={(event) => void changeTrack(event.target.value)}>
            <option value="off">Sous-titres désactivés</option>
            {tracks.map((track) => <option key={track.value} value={track.value}>{track.label}</option>)}
          </select>}
          <button className="unified-video-button" type="button" onClick={() => void toggleFullscreen()} aria-label={fullscreen ? "Quitter le plein écran" : "Plein écran"} aria-pressed={fullscreen}>
            <CornersOut size={19} />
          </button>
        </div>
      </div>}
    </div>
  );
}
