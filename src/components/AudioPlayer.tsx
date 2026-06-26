"use client";

import type { AudioFile } from "@/lib/types";
import { useRef, useState, useEffect } from "react";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Music } from "lucide-react";

export interface AudioPlayerProps {
  audios: AudioFile[];
}

export default function AudioPlayer(props: AudioPlayerProps) {
  const { audios } = props;
  const audioRef = useRef<HTMLAudioElement>(null);
  // True when the next track change should start playing automatically
  // (user tapped a track / next / prev, or a track ended). Prevents the
  // first track from blasting audio the moment a lesson opens.
  const autoplayRef = useRef(false);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(
    audios.length > 0 ? 0 : null
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  const selectedTrack = selectedIndex !== null ? audios[selectedIndex] : null;

  // Load the selected track. Only start playback when the change was
  // user-initiated (autoplayRef) — opening a lesson just cues track 1.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !selectedTrack) return;
    audio.src = selectedTrack.path;
    audio.load();
    setCurrentTime(0);
    if (autoplayRef.current) {
      autoplayRef.current = false;
      audio.play().catch(() => {
        // Playback can be blocked until the user interacts — ignore.
      });
    }
  }, [selectedTrack]);

  // Handle audio events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handlePlay = () => {
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      // Auto-advance to the next track (and keep playing) if available.
      if (selectedIndex !== null && selectedIndex < audios.length - 1) {
        autoplayRef.current = true;
        setSelectedIndex(selectedIndex + 1);
      }
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [selectedIndex, audios.length]);

  // Format time as m:ss
  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handlePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(() => {
          // Playback might fail
        });
      }
    }
  };

  const handlePrevious = () => {
    if (selectedIndex !== null && selectedIndex > 0) {
      autoplayRef.current = true;
      setSelectedIndex(selectedIndex - 1);
    }
  };

  const handleNext = () => {
    if (selectedIndex !== null && selectedIndex < audios.length - 1) {
      autoplayRef.current = true;
      setSelectedIndex(selectedIndex + 1);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.currentTarget.value);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.currentTarget.value);
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
    if (newVolume > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const handleMuteToggle = () => {
    if (audioRef.current) {
      if (isMuted) {
        audioRef.current.volume = volume;
        setIsMuted(false);
      } else {
        audioRef.current.volume = 0;
        setIsMuted(true);
      }
    }
  };

  const handleTrackSelect = (index: number) => {
    if (index === selectedIndex) {
      // Tapping the active track toggles play/pause.
      handlePlayPause();
      return;
    }
    autoplayRef.current = true;
    setSelectedIndex(index);
  };

  if (audios.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <p className="text-sm">No audio in this folder</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Hidden audio element */}
      <audio ref={audioRef} crossOrigin="anonymous" />

      {/* Track List */}
      <div className="flex-1 overflow-y-auto border-b border-gray-200">
        <ul className="divide-y divide-gray-200">
          {audios.map((track, index) => (
            <li key={index}>
              <button
                onClick={() => handleTrackSelect(index)}
                className={`w-full text-left px-4 py-3 min-h-[44px] flex items-center transition-colors ${
                  selectedIndex === index
                    ? "bg-blue-50 text-blue-700 font-semibold"
                    : "text-gray-900 hover:bg-gray-50"
                }`}
                aria-label={`Play track ${track.name}`}
              >
                {selectedIndex === index && isPlaying && (
                  <Music className="mr-3 h-4 w-4 shrink-0 text-blue-700" />
                )}
                {selectedIndex === index && !isPlaying && (
                  <Music className="mr-3 h-4 w-4 shrink-0 text-gray-400" />
                )}
                {selectedIndex !== index && (
                  <Music className="mr-3 h-4 w-4 shrink-0 text-gray-300" />
                )}
                <span className="min-w-0 flex-1 truncate">{track.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Playback Controls */}
      <div className="bg-white border-t border-gray-200 p-4 space-y-4">
        {/* Track Info */}
        {selectedTrack && (
          <div className="text-center">
            <p className="text-sm font-medium text-gray-900 truncate">
              {selectedTrack.name}
            </p>
          </div>
        )}

        {/* Seek Bar */}
        <div className="space-y-2">
          <input
            type="range"
            min="0"
            max={duration || 0}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            aria-label="Seek bar"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Transport Controls */}
        <div className="flex items-center justify-center gap-4">
          {/* Previous Button */}
          <button
            onClick={handlePrevious}
            disabled={selectedIndex === null || selectedIndex === 0}
            className="p-2 rounded-full bg-gray-100 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200 transition-colors"
            aria-label="Previous track"
          >
            <SkipBack className="w-5 h-5" />
          </button>

          {/* Play/Pause Button */}
          <button
            onClick={handlePlayPause}
            disabled={selectedIndex === null}
            className="p-4 rounded-full bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <Pause className="w-6 h-6" />
            ) : (
              <Play className="w-6 h-6" />
            )}
          </button>

          {/* Next Button */}
          <button
            onClick={handleNext}
            disabled={
              selectedIndex === null || selectedIndex === audios.length - 1
            }
            className="p-2 rounded-full bg-gray-100 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200 transition-colors"
            aria-label="Next track"
          >
            <SkipForward className="w-5 h-5" />
          </button>
        </div>

        {/* Volume Control */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleMuteToggle}
            className="p-2 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors flex-shrink-0"
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? (
              <VolumeX className="w-5 h-5" />
            ) : (
              <Volume2 className="w-5 h-5" />
            )}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="flex-1 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            aria-label="Volume control"
          />
        </div>
      </div>
    </div>
  );
}
