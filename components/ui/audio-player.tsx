'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AudioPlayerProps {
  src: string;
  className?: string;
}

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const DEFAULT_SPEED = 1.25;

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function AudioPlayer({ src, className }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(DEFAULT_SPEED);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showMiniPlayer, setShowMiniPlayer] = useState(false);

  // Set default playback speed when audio loads
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = DEFAULT_SPEED;
    }
  }, []);

  // Handle audio events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      setIsLoaded(true);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, []);

  // Intersection Observer for mobile mini player
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    // Only enable on mobile
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (!isMobile) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Show mini player when main player is less than 50% visible
        setShowMiniPlayer(!entry.isIntersecting || entry.intersectionRatio < 0.5);
      },
      { threshold: [0, 0.5, 1] }
    );

    observer.observe(player);
    return () => observer.disconnect();
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
  }, [isPlaying]);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const progressBar = progressRef.current;
    if (!audio || !progressBar || !isLoaded) return;

    const rect = progressBar.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * duration;
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  }, [duration, isLoaded]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newVolume = parseFloat(e.target.value);
    audio.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  }, []);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isMuted) {
      audio.volume = volume || 1;
      setIsMuted(false);
    } else {
      audio.volume = 0;
      setIsMuted(true);
    }
  }, [isMuted, volume]);

  const handleSpeedChange = useCallback((speed: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.playbackRate = speed;
    setPlaybackSpeed(speed);
  }, []);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <>
      {/* Main Player */}
      <div ref={playerRef} className={cn('flex flex-col gap-3', className)}>
        <audio ref={audioRef} src={src} preload="metadata" />

        {/* Progress bar */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground font-mono w-10 text-right shrink-0">
            {formatTime(currentTime)}
          </span>
          <div
            ref={progressRef}
            className={cn(
              'flex-1 h-2 bg-muted rounded-full cursor-pointer relative overflow-hidden',
              'hover:h-2.5 transition-all',
              !isLoaded && 'opacity-50 cursor-not-allowed'
            )}
            onClick={handleProgressClick}
          >
            {/* Buffered/loaded indicator */}
            <div className="absolute inset-0 bg-muted-foreground/20 rounded-full" />
            {/* Progress fill */}
            <div
              className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
            {/* Scrubber handle */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full shadow-sm opacity-0 hover:opacity-100 transition-opacity"
              style={{ left: `calc(${progress}% - 6px)` }}
            />
          </div>
          <span className="text-xs text-muted-foreground font-mono w-10 shrink-0">
            {formatTime(duration)}
          </span>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {/* Play/Pause */}
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-full"
              onClick={togglePlay}
              disabled={!isLoaded}
            >
              {isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4 ml-0.5" />
              )}
            </Button>

            {/* Volume - hidden on mobile */}
            <div className="hidden sm:flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={toggleMute}
              >
                {isMuted ? (
                  <VolumeX className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Volume2 className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 bg-muted rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
              />
            </div>
          </div>

          {/* Speed selector */}
          <div className="flex items-center gap-0.5">
            {PLAYBACK_SPEEDS.map((speed) => (
              <Button
                key={speed}
                variant={playbackSpeed === speed ? 'default' : 'ghost'}
                size="sm"
                className={cn(
                  'h-7 px-1.5 text-xs font-medium min-w-0',
                  playbackSpeed === speed
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => handleSpeedChange(speed)}
              >
                {speed}x
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile Floating Mini Player */}
      {showMiniPlayer && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 md:hidden">
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-full bg-gradient-to-r from-gray-900/90 via-gray-800/90 to-gray-900/90 dark:from-white/90 dark:via-gray-100/90 dark:to-white/90 backdrop-blur-xl border border-white/20 dark:border-black/10 shadow-[0_4px_20px_rgba(0,0,0,0.4)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
            {/* Play/Pause Button */}
            <button
              onClick={togglePlay}
              disabled={!isLoaded}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-white/20 dark:bg-black/20 text-white dark:text-gray-900 disabled:opacity-50"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5 ml-0.5" />
              )}
            </button>

            {/* Progress indicator */}
            <div className="flex flex-col gap-0.5">
              <div className="w-32 h-1.5 bg-white/20 dark:bg-black/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white dark:bg-gray-900 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-mono text-white/70 dark:text-gray-600">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Speed indicator */}
            <span className="text-xs font-medium text-white/80 dark:text-gray-700">
              {playbackSpeed}x
            </span>
          </div>
        </div>
      )}
    </>
  );
}
