'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

interface SlideData {
  title: string;
  subtitle: string;
  description?: string;
  accent: string;
  imageUrl: string;
  linkTo?: string;
}

interface ElegantCarouselProps {
  slides: SlideData[];
  onSlideClick?: (index: number) => void;
}

export default function ElegantCarousel({ slides, onSlideClick }: ElegantCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  const SLIDE_DURATION = 6000;
  const TRANSITION_DURATION = 800;

  const goToSlide = useCallback(
    (index: number, dir?: 'next' | 'prev') => {
      if (isTransitioning || index === currentIndex || slides.length === 0) return;
      setDirection(dir || (index > currentIndex ? 'next' : 'prev'));
      setIsTransitioning(true);
      setProgress(0);
      setTimeout(() => {
        setCurrentIndex(index);
        setTimeout(() => setIsTransitioning(false), 50);
      }, TRANSITION_DURATION / 2);
    },
    [isTransitioning, currentIndex, slides.length]
  );

  const goNext = useCallback(() => {
    if (slides.length === 0) return;
    goToSlide((currentIndex + 1) % slides.length, 'next');
  }, [currentIndex, goToSlide, slides.length]);

  const goPrev = useCallback(() => {
    if (slides.length === 0) return;
    goToSlide((currentIndex - 1 + slides.length) % slides.length, 'prev');
  }, [currentIndex, goToSlide, slides.length]);

  useEffect(() => {
    if (isPaused || slides.length <= 1) return;
    progressRef.current = setInterval(() => {
      setProgress((prev) => (prev >= 100 ? 100 : prev + 100 / (SLIDE_DURATION / 50)));
    }, 50);
    intervalRef.current = setInterval(() => goNext(), SLIDE_DURATION);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, [currentIndex, isPaused, goNext, slides.length]);

  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.targetTouches[0].clientX; };
  const handleTouchMove = (e: React.TouchEvent) => { touchEndX.current = e.targetTouches[0].clientX; };
  const handleTouchEnd = () => {
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 60) {
      if (diff > 0) goNext();
      else goPrev();
    }
  };

  if (slides.length === 0) return null;
  const currentSlide = slides[currentIndex];

  return (
    <div
      className="ec-wrapper"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Background accent wash */}
      <div
        className="ec-bg-wash"
        style={{ background: `radial-gradient(ellipse at 70% 50%, ${currentSlide.accent}18 0%, transparent 70%)` }}
      />

      <div className="ec-inner">
        {/* Left: Text Content */}
        <div className="ec-content">
          <div className="ec-content-inner">
            <div className={`ec-collection-num ${isTransitioning ? 'ec-transitioning' : 'ec-visible'}`}>
              <span className="ec-num-line" />
              <span className="ec-num-text">
                {String(currentIndex + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
              </span>
            </div>

            <h2 className={`ec-title ${isTransitioning ? 'ec-transitioning' : 'ec-visible'}`}>
              {currentSlide.title}
            </h2>

            <p
              className={`ec-subtitle ${isTransitioning ? 'ec-transitioning' : 'ec-visible'}`}
              style={{ color: currentSlide.accent }}
            >
              {currentSlide.subtitle}
            </p>

            {currentSlide.description && (
              <p className={`ec-description ${isTransitioning ? 'ec-transitioning' : 'ec-visible'}`}>
                {currentSlide.description}
              </p>
            )}

            {/* Navigation Arrows */}
            <div className="ec-nav-arrows">
              <button onClick={goPrev} className="ec-arrow-btn" aria-label="Previous slide">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </button>
              <button onClick={goNext} className="ec-arrow-btn" aria-label="Next slide">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Right: Image */}
        <div
          className="ec-image-container"
          onClick={() => onSlideClick?.(currentIndex)}
          style={{ cursor: onSlideClick ? 'pointer' : 'default' }}
        >
          <div className={`ec-image-frame ${isTransitioning ? 'ec-transitioning' : 'ec-visible'}`}>
            <img src={currentSlide.imageUrl} alt={currentSlide.title} className="ec-image" style={{ objectFit: 'contain' }} />
            <div
              className="ec-image-overlay"
              style={{ background: `linear-gradient(135deg, ${currentSlide.accent}22 0%, transparent 50%)` }}
            />
          </div>
          <div className="ec-frame-corner ec-frame-corner--tl" style={{ borderColor: currentSlide.accent }} />
          <div className="ec-frame-corner ec-frame-corner--br" style={{ borderColor: currentSlide.accent }} />
        </div>
      </div>

      {/* Progress Indicators */}
      <div className="ec-progress-bar">
        {slides.map((slide, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className={`ec-progress-item ${index === currentIndex ? 'active' : ''}`}
            aria-label={`Go to slide ${index + 1}`}
          >
            <div className="ec-progress-track">
              <div
                className="ec-progress-fill"
                style={{
                  width: index === currentIndex ? `${progress}%` : index < currentIndex ? '100%' : '0%',
                  backgroundColor: index === currentIndex ? currentSlide.accent : undefined,
                }}
              />
            </div>
            <span className="ec-progress-label">{slide.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export type { SlideData };
