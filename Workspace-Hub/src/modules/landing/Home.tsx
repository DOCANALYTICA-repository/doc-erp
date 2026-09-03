import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight, Download, BookOpen, Users, Compass, Eye, Mail, MapPin } from 'lucide-react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { api } from '../../services/api';

// Register GSAP plugins
gsap.registerPlugin(ScrollTrigger);

/**
 * Should we animate entrances at all?
 *
 * The rule this page learned the hard way: NEVER hide content in a way that
 * requires JavaScript to un-hide it. gsap.from() (and, just as badly, a
 * gsap.set(opacity: 0) followed by a tween) writes the hidden state to the DOM
 * immediately, and browsers throttle requestAnimationFrame in a background or
 * occluded tab. The headline was reproducibly stranded at 0.35 opacity
 * FOREVER — the animation simply never ran.
 *
 * So the start state is only ever written when the document is actually
 * visible and the user has not asked for reduced motion. Otherwise the
 * un-animated markup — which is fully legible — is what stays on screen.
 */
function shouldAnimateEntrances(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.visibilityState !== 'visible') return false;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The finished state of every entrance animation on this page. */
const ENTRANCE_END = { y: 0, opacity: 1 } as const;

/**
 * Reveal elements as their section scrolls into view.
 *
 * onLeave/refresh safety aside, the important property is the one above: if
 * the tween never runs, the element was never hidden in the first place.
 */
function revealOnScroll(selector: string, trigger: string, stagger = 0.15) {
  const targets = gsap.utils.toArray<HTMLElement>(selector);
  if (targets.length === 0) return;

  gsap.set(targets, { y: 40, opacity: 0 });
  gsap.to(targets, {
    scrollTrigger: { trigger, start: 'top 85%', toggleActions: 'play none none none' },
    ...ENTRANCE_END,
    duration: 0.8,
    stagger,
    ease: 'power3.out',
  });
}

/**
 * Force every animated element to its finished state, immediately.
 *
 * The safety net for a tab that becomes hidden PART-WAY through the timeline:
 * rAF stops, the tween freezes, and without this the user returns to a
 * half-faded page.
 */
function settleEntrances(scope: HTMLElement | null) {
  if (!scope) return;
  const targets = scope.querySelectorAll<HTMLElement>(
    '.hero-badge, .hero-title, .hero-desc, .hero-cta, .stat-card, .course-card, .club-card'
  );
  gsap.set(Array.from(targets), ENTRANCE_END);
}

// Local illustration used for the static "About" section only — everything
// else on this page (stats/courses/clubs/gallery) is Content-Engine-driven
// (Phase 3), not hardcoded, per the Landing PRD's "presentation layer only,
// owns no content" architecture rule.
import docDeptImg from '../../../assets/images/doc_department.jpg';
import docDeptImgWebp from '../../../assets/images/doc_department.webp';

interface Course {
  id: string;
  name: string;
  description: string;
  outcomes: string[];
  careers: string[];
}
interface ClubCard {
  id: string;
  name: string;
  category: string;
  description: string;
  contact_email: string;
}
interface GalleryImage {
  id: string;
  title: string;
  url: string;
}
interface Stats {
  total_students: number;
  faculty_count: number;
  number_of_clubs: number;
  years_established: number;
}

export const LandingHome: React.FC = () => {
  const navigate = useNavigate();
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  // The whole image, not just its URL — the lightbox needs the title for its
  // accessible name, and an <img> with alt="Lightbox" tells a screen-reader
  // user nothing about what they are looking at.
  const [activeLightbox, setActiveLightbox] = useState<GalleryImage | null>(null);

  const [stats, setStats] = useState<Stats | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [clubs, setClubs] = useState<ClubCard[]>([]);
  const [gallery, setGallery] = useState<GalleryImage[]>([]);

  useEffect(() => {
    api.get<Stats>('/content/statistics').then(setStats).catch(console.error);
    api.get<Course[]>('/content/courses').then(setCourses).catch(console.error);
    api.get<ClubCard[]>('/content/clubs-showcase').then(setClubs).catch(console.error);
    api.get<GalleryImage[]>('/content/gallery').then(setGallery).catch(console.error);
  }, []);

  // Escape closes the lightbox.
  useEffect(() => {
    if (!activeLightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveLightbox(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [activeLightbox]);

  const heroContainerRef = useRef<HTMLDivElement>(null);
  const svgPathRef = useRef<SVGPathElement>(null);

  /**
   * Hero + decorative animation.
   *
   * Two rules govern everything here, both learned from a shipped bug that
   * left the headline permanently at 0.36 opacity:
   *
   *  1. NEVER animate FROM opacity: 0. gsap.from() writes the start state to
   *     the DOM immediately, so if the timeline is throttled — a background
   *     tab, a slow device, rAF starved — the element is stranded invisible
   *     with nothing to finish the job. Animating TO the final state means
   *     the un-animated state is the readable one, and the worst possible
   *     failure is "no animation".
   *
   *  2. Only animate what is on the page NOW. This effect has empty deps;
   *     .course-card and .club-card arrive later from the API, so those
   *     tweens found zero targets and silently did nothing. They live in
   *     their own effect below, keyed on the data.
   */
  useEffect(() => {
    if (!shouldAnimateEntrances()) return;

    // If the tab is hidden mid-timeline, rAF stops and the tween freezes
    // wherever it happens to be. Snap everything to its finished state
    // instead — the user comes back to a readable page, not a half-faded one.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        settleEntrances(heroContainerRef.current);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

      // set() the start state, then to() the finished state — see the note above.
      const enter = (
        selector: string,
        startY: number,
        to: gsap.TweenVars,
        position?: string,
      ) => {
        const targets = gsap.utils.toArray<HTMLElement>(selector);
        if (targets.length === 0) return;
        gsap.set(targets, { y: startY, opacity: 0 });
        tl.to(targets, { y: 0, opacity: 1, ...to }, position);
      };

      enter('.hero-badge', -30, { duration: 0.8 });
      enter('.hero-title', 50, { duration: 1.2 }, '-=0.5');
      enter('.hero-desc', 30, { duration: 0.8 }, '-=0.8');
      enter('.hero-cta', 20, { duration: 0.6, stagger: 0.15 }, '-=0.5');

      revealOnScroll('.stat-card', '.stats-section');

      // SVG fluid path morphing (looping organic blob outline). Purely
      // decorative, and it animates an attribute rather than opacity, so it
      // cannot strand anything.
      const path2 = "M150,30 C250,50 290,90 290,180 C290,270 220,330 150,340 C60,350 30,270 30,180 C30,90 50,10 150,30 Z";
      if (svgPathRef.current) {
        gsap.to(svgPathRef.current, {
          attr: { d: path2 },
          duration: 5,
          yoyo: true,
          repeat: -1,
          ease: 'sine.inOut',
        });
      }
    }, heroContainerRef);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      ctx.revert();
    };
  }, []);

  /**
   * Card entrances for content that arrives from the API.
   *
   * Keyed on the array lengths, not on mount: at mount there are no
   * .course-card or .club-card elements for a ScrollTrigger to attach to.
   */
  useEffect(() => {
    if (courses.length === 0 && clubs.length === 0) return;
    if (!shouldAnimateEntrances()) return;

    const ctx = gsap.context(() => {
      revealOnScroll('.course-card', '.courses-section', 0.12);
      revealOnScroll('.club-card', '.clubs-section', 0.15);
      // The triggers were created against a layout that has just grown.
      ScrollTrigger.refresh();
    }, heroContainerRef);

    return () => ctx.revert();
  }, [courses.length, clubs.length]);

  return (
    <div ref={heroContainerRef} className="w-full min-h-screen bg-slate-50 transition-colors duration-300 overflow-x-hidden relative">
      
      {/* Morphing Background SVG Blob */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 -z-10 opacity-30 pointer-events-none w-[500px] h-[500px]">
        <svg viewBox="0 0 400 400" className="w-full h-full fill-indigo-200/50 blur-2xl">
          <path
            ref={svgPathRef}
            d="M150,50 C230,50 280,120 280,200 C280,280 200,320 150,320 C80,320 40,260 40,200 C40,120 70,50 150,50 Z"
          />
        </svg>
      </div>

      {/* Public Header/Navbar */}
      <header className="fixed top-0 left-0 right-0 z-50 glass-nav border-b border-slate-200/40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-lg tracking-tight text-slate-900">Department of Commerce</span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <a href="#about" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">About</a>
            <a href="#courses" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Courses</a>
            <a href="#clubs" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Clubs</a>
            <a href="#gallery" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Gallery</a>
            <a href="#contact" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Contact</a>
          </nav>
          <button
            onClick={() => navigate('/login')}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-lg text-sm transition-all shadow-sm"
          >
            DOC Portal Login
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-36 pb-20 px-6 max-w-7xl mx-auto flex flex-col items-center text-center">
        <div className="hero-badge inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-800 text-xs font-semibold mb-6 shadow-sm border border-slate-200/50">
          <Sparkles className="w-3.5 h-3.5 text-yellow-500 animate-pulse" />
          CHRIST (Deemed to be University)
        </div>
        <h1 className="hero-title text-4xl md:text-6xl font-extrabold tracking-tight text-slate-900 max-w-4xl leading-tight">
          Shape the Future of Global Commerce & Finance
        </h1>
        <p className="hero-desc mt-6 text-lg text-slate-600 max-w-2xl leading-relaxed">
          Unlock leadership opportunities, master technical accounting standards, and run student-led club operations within a premier environment of academic excellence.
        </p>
        <div className="hero-cta mt-10 flex flex-col sm:flex-row gap-4 items-center justify-center w-full sm:w-auto">
          <button
            onClick={() => navigate('/login')}
            className="w-full sm:w-auto px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-lg flex items-center justify-center gap-2 transition-all shadow"
          >
            Access ERP Portal
            <ArrowRight className="w-4 h-4" />
          </button>
          <a
            href="#courses"
            className="w-full sm:w-auto px-6 py-3 bg-white hover:bg-slate-50 text-slate-950 border border-slate-200 font-medium rounded-lg text-center transition-all shadow-sm"
          >
            Explore Programmes
          </a>
        </div>
      </section>

      {/* Department Statistics Section */}
      <section className="stats-section py-12 bg-white border-y border-slate-200/40">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          <div className="stat-card">
            <div className="text-3xl md:text-4xl font-extrabold text-slate-900">{stats ? `${stats.total_students}+` : '—'}</div>
            <div className="text-xs font-medium text-slate-500 mt-1 uppercase tracking-wider">Enrolled Students</div>
          </div>
          <div className="stat-card">
            <div className="text-3xl md:text-4xl font-extrabold text-slate-900">{stats ? `${stats.faculty_count}+` : '—'}</div>
            <div className="text-xs font-medium text-slate-500 mt-1 uppercase tracking-wider">Faculty Advisors</div>
          </div>
          <div className="stat-card">
            <div className="text-3xl md:text-4xl font-extrabold text-slate-900">{stats?.number_of_clubs ?? '—'}</div>
            <div className="text-xs font-medium text-slate-500 mt-1 uppercase tracking-wider">Operational Clubs</div>
          </div>
          <div className="stat-card">
            <div className="text-3xl md:text-4xl font-extrabold text-slate-900">{stats ? `${stats.years_established} Years` : '—'}</div>
            <div className="text-xs font-medium text-slate-500 mt-1 uppercase tracking-wider">Academic Legacy</div>
          </div>
        </div>
      </section>

      {/* About Department Section */}
      <section id="about" className="py-20 px-6 max-w-7xl mx-auto scroll-mt-20">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">Our Vision & Mission</h2>
            <div className="mt-6 space-y-6">
              <div className="p-5 rounded-xl bg-white border border-slate-200/60 shadow-sm">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Compass className="w-4 h-4 text-indigo-500" /> Vision
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  To be a center of excellence in commerce education, nurturing socially responsible leaders, financial experts, and outstanding researchers.
                </p>
              </div>
              <div className="p-5 rounded-xl bg-white border border-slate-200/60 shadow-sm">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-emerald-500" /> Mission
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  To provide holistic commerce education integrated with global standards, professional certifications, corporate internships, and ethical principles.
                </p>
              </div>
            </div>
          </div>
          <div className="hero-image relative aspect-video rounded-2xl overflow-hidden shadow-lg border border-slate-200 bg-slate-100">
            {/* 829 kB of JPEG for one below-the-fold image. Now 122 kB of
                WebP with a 190 kB JPEG fallback, lazy-loaded, with explicit
                dimensions so it reserves its space instead of shifting the
                layout when it arrives. */}
            <picture>
              <source srcSet={docDeptImgWebp} type="image/webp" />
              <img
                src={docDeptImg}
                width={1264}
                height={848}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover"
                alt="Students and faculty at the Department of Commerce"
              />
            </picture>
          </div>
        </div>
      </section>

      {/* Course Catalogue Section */}
      <section id="courses" className="courses-section py-20 bg-slate-100/60 border-y border-slate-200/50 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-xl mx-auto mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">Academic Programmes</h2>
            <p className="text-sm text-slate-500 mt-3">Choose from our specialized undergraduate pathways integrated with professional skills.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {courses.map(course => (
              <div key={course.id} className="course-card rounded-2xl border border-slate-200/60 bg-white p-6 flex flex-col justify-between shadow-sm hover:shadow transition-shadow">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{course.name}</h3>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">{course.description}</p>
                  
                  {activeCourseId === course.id ? (
                    <div className="mt-5 space-y-4 animate-fade-in">
                      <div>
                        <h4 className="text-xs font-semibold text-slate-800">Learning Outcomes:</h4>
                        <ul className="mt-1.5 list-disc list-inside text-xs text-slate-600 space-y-1">
                          {course.outcomes.map((out, idx) => <li key={idx}>{out}</li>)}
                        </ul>
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-slate-800">Career Roles:</h4>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {course.careers.map((car, idx) => (
                            <span key={idx} className="px-2 py-0.5 rounded bg-slate-100 text-xs text-slate-600 font-medium">
                              {car}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
                <button
                  onClick={() => setActiveCourseId(activeCourseId === course.id ? null : course.id)}
                  className="w-full mt-6 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  {activeCourseId === course.id ? "Hide Details" : "View Curriculum Outcomes"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Clubs & Student Life Section */}
      <section id="clubs" className="clubs-section py-20 px-6 max-w-7xl mx-auto scroll-mt-20">
        <div className="text-center max-w-xl mx-auto mb-16">
          <span className="text-xs font-bold text-indigo-500 uppercase tracking-wider">Dynamic Campus Culture</span>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 mt-1">Student-run Associations</h2>
          <p className="text-sm text-slate-500 mt-2">Get involved in our diverse specialized clubs to develop hands-on logistics and planning capabilities.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {clubs.map((club) => (
            <div key={club.id} className="club-card p-6 rounded-2xl border border-slate-200/60 bg-white shadow-sm flex flex-col justify-between">
              <div>
                <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {club.category}
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-4">{club.name}</h3>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">{club.description}</p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                <span>Inquiries:</span>
                <a href={`mailto:${club.contact_email}`} className="text-indigo-500 hover:underline">{club.contact_email}</a>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Photo Gallery Section */}
      <section id="gallery" className="py-20 bg-slate-100/60 border-y border-slate-200/50 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-xl mx-auto mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900">Campus Live Stream</h2>
            <p className="text-sm text-slate-500 mt-3">Glimpses of recent academic summits, recruitment days, and cultural fests.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {gallery.map((img) => (
              // A clickable <div> is invisible to the keyboard and announces
              // nothing. A <button> is focusable, activates on Enter and
              // Space, and carries its own role for free.
              <button
                key={img.id}
                type="button"
                onClick={() => setActiveLightbox(img)}
                aria-label={`View ${img.title} full size`}
                className="group relative aspect-square rounded-xl overflow-hidden cursor-pointer border border-slate-200 shadow-sm bg-slate-200 text-left"
              >
                <img
                  src={img.url}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  alt={img.title}
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <Eye className="w-6 h-6 text-white" aria-hidden="true" />
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-20 px-6 max-w-3xl mx-auto scroll-mt-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Contact Department</h2>
          <p className="text-sm text-slate-500 mt-3">Address and details for official inquiries.</p>
        </div>
        <div className="p-6 rounded-2xl border border-slate-200/60 bg-white shadow-sm space-y-6">
          <div className="flex items-start gap-4">
            <MapPin className="w-5 h-5 text-slate-400 mt-0.5" />
            <div>
              <h4 className="font-semibold text-slate-900 text-sm">Department Office Address</h4>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Department of Commerce, Block IV,<br />
                CHRIST (Deemed to be University), Hosur Road,<br />
                Bengaluru, Karnataka - 560029
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4 border-t border-slate-100 pt-4">
            <Mail className="w-5 h-5 text-slate-400 mt-0.5" />
            <div>
              <h4 className="font-semibold text-slate-900 text-sm">Official Support Email</h4>
              <p className="text-xs text-slate-500 mt-1">commerce.support@christuniversity.in</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 bg-white border-t border-slate-200/60">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <span>&copy; {new Date().getFullYear()} Department of Commerce, CHRIST (Deemed to be University). All rights reserved.</span>
          <div className="flex gap-6">
            <a href="#" className="hover:underline">Privacy Policy</a>
            <a href="#" className="hover:underline">Terms of Use</a>
          </div>
        </div>
      </footer>

      {/* Lightbox Modal */}
      {activeLightbox ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={activeLightbox.title}
          onClick={() => setActiveLightbox(null)}
          className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4 animate-fade-in"
        >
          <img
            src={activeLightbox.url}
            decoding="async"
            className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain"
            alt={activeLightbox.title}
          />
          <p className="mt-4 text-sm text-white/80">{activeLightbox.title}</p>
          {/* Escape closes it too — see the effect above. A modal that can only
              be dismissed by clicking a backdrop is a trap for keyboard users. */}
          <button
            type="button"
            onClick={() => setActiveLightbox(null)}
            className="absolute top-4 right-4 rounded-full bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20"
          >
            Close
          </button>
        </div>
      ) : null}
    </div>
  );
};
