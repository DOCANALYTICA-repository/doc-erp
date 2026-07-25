import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight, Download, BookOpen, Users, Compass, Eye, Mail, MapPin } from 'lucide-react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { api } from '../../services/api';

// Register GSAP plugins
gsap.registerPlugin(ScrollTrigger);

// Local illustration used for the static "About" section only — everything
// else on this page (stats/courses/clubs/gallery) is Content-Engine-driven
// (Phase 3), not hardcoded, per the Landing PRD's "presentation layer only,
// owns no content" architecture rule.
import docDeptImg from '../../../assets/images/doc_department.jpg';

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
  const [activeLightboxImg, setActiveLightboxImg] = useState<string | null>(null);

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

  const heroContainerRef = useRef<HTMLDivElement>(null);
  const svgPathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // 1. Multi-Step Timeline Load Animation
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.from('.hero-badge', { y: -30, opacity: 0, duration: 0.8 })
        .from('.hero-title', { y: 50, opacity: 0, duration: 1.2 }, '-=0.5')
        .from('.hero-desc', { y: 30, opacity: 0, duration: 0.8 }, '-=0.8')
        .from('.hero-cta', { y: 20, opacity: 0, duration: 0.6, stagger: 0.15 }, '-=0.5');

      // 2. Scroll-Triggered Metrics & Card Entrances
      gsap.from('.stat-card', {
        scrollTrigger: {
          trigger: '.stats-section',
          start: 'top 85%',
          toggleActions: 'play none none none'
        },
        y: 40,
        opacity: 0,
        duration: 0.8,
        stagger: 0.15,
        ease: 'power3.out'
      });

      gsap.from('.course-card', {
        scrollTrigger: {
          trigger: '.courses-section',
          start: 'top 85%',
          toggleActions: 'play none none none'
        },
        y: 40,
        opacity: 0,
        duration: 0.8,
        stagger: 0.12,
        ease: 'power3.out'
      });

      gsap.from('.club-card', {
        scrollTrigger: {
          trigger: '.clubs-section',
          start: 'top 85%',
          toggleActions: 'play none none none'
        },
        y: 40,
        opacity: 0,
        duration: 0.8,
        stagger: 0.15,
        ease: 'power3.out'
      });

      // 3. SVG Fluid Path Morphing (looping organic blob outline)
      const path1 = "M150,50 C230,50 280,120 280,200 C280,280 200,320 150,320 C80,320 40,260 40,200 C40,120 70,50 150,50 Z";
      const path2 = "M150,30 C250,50 290,90 290,180 C290,270 220,330 150,340 C60,350 30,270 30,180 C30,90 50,10 150,30 Z";
      
      gsap.to(svgPathRef.current, {
        attr: { d: path2 },
        duration: 5,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut'
      });

    }, heroContainerRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={heroContainerRef} className="w-full min-h-screen bg-slate-50 dark:bg-[#0a0a0a] transition-colors duration-300 overflow-x-hidden relative">
      
      {/* Morphing Background SVG Blob */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 -z-10 opacity-30 dark:opacity-20 pointer-events-none w-[500px] h-[500px]">
        <svg viewBox="0 0 400 400" className="w-full h-full fill-indigo-200/50 dark:fill-indigo-950/20 blur-2xl">
          <path
            ref={svgPathRef}
            d="M150,50 C230,50 280,120 280,200 C280,280 200,320 150,320 C80,320 40,260 40,200 C40,120 70,50 150,50 Z"
          />
        </svg>
      </div>

      {/* Public Header/Navbar */}
      <header className="fixed top-0 left-0 right-0 z-50 glass-nav border-b border-slate-200/40 dark:border-slate-800/40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-white flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white dark:text-slate-900" />
            </div>
            <span className="font-semibold text-lg tracking-tight text-slate-900 dark:text-white">Department of Commerce</span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            <a href="#about" className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors">About</a>
            <a href="#courses" className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors">Courses</a>
            <a href="#clubs" className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors">Clubs</a>
            <a href="#gallery" className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors">Gallery</a>
            <a href="#contact" className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors">Contact</a>
          </nav>
          <button
            onClick={() => navigate('/login')}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 font-medium rounded-lg text-sm transition-all shadow-sm"
          >
            DOC Portal Login
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-36 pb-20 px-6 max-w-7xl mx-auto flex flex-col items-center text-center">
        <div className="hero-badge inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs font-semibold mb-6 shadow-sm border border-slate-200/50 dark:border-slate-800/80">
          <Sparkles className="w-3.5 h-3.5 text-yellow-500 animate-pulse" />
          CHRIST (Deemed to be University)
        </div>
        <h1 className="hero-title text-4xl md:text-6xl font-extrabold tracking-tight text-slate-900 dark:text-white max-w-4xl leading-tight">
          Shape the Future of Global Commerce & Finance
        </h1>
        <p className="hero-desc mt-6 text-lg text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
          Unlock leadership opportunities, master technical accounting standards, and run student-led club operations within a premier environment of academic excellence.
        </p>
        <div className="hero-cta mt-10 flex flex-col sm:flex-row gap-4 items-center justify-center w-full sm:w-auto">
          <button
            onClick={() => navigate('/login')}
            className="w-full sm:w-auto px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 font-medium rounded-lg flex items-center justify-center gap-2 transition-all shadow"
          >
            Access ERP Portal
            <ArrowRight className="w-4 h-4" />
          </button>
          <a
            href="#courses"
            className="w-full sm:w-auto px-6 py-3 bg-white hover:bg-slate-50 text-slate-950 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800/80 border border-slate-200 dark:border-slate-800 font-medium rounded-lg text-center transition-all shadow-sm"
          >
            Explore Programmes
          </a>
        </div>
      </section>

      {/* Department Statistics Section */}
      <section className="stats-section py-12 bg-white dark:bg-slate-950/40 border-y border-slate-200/40 dark:border-slate-900/60">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          <div className="stat-card">
            <div className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white">{stats ? `${stats.total_students}+` : '—'}</div>
            <div className="text-xs font-medium text-slate-500 mt-1 uppercase tracking-wider">Enrolled Students</div>
          </div>
          <div className="stat-card">
            <div className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white">{stats ? `${stats.faculty_count}+` : '—'}</div>
            <div className="text-xs font-medium text-slate-500 mt-1 uppercase tracking-wider">Faculty Advisors</div>
          </div>
          <div className="stat-card">
            <div className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white">{stats?.number_of_clubs ?? '—'}</div>
            <div className="text-xs font-medium text-slate-500 mt-1 uppercase tracking-wider">Operational Clubs</div>
          </div>
          <div className="stat-card">
            <div className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white">{stats ? `${stats.years_established} Years` : '—'}</div>
            <div className="text-xs font-medium text-slate-500 mt-1 uppercase tracking-wider">Academic Legacy</div>
          </div>
        </div>
      </section>

      {/* About Department Section */}
      <section id="about" className="py-20 px-6 max-w-7xl mx-auto scroll-mt-10">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Our Vision & Mission</h2>
            <div className="mt-6 space-y-6">
              <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 shadow-sm">
                <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Compass className="w-4 h-4 text-indigo-500" /> Vision
                </h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  To be a center of excellence in commerce education, nurturing socially responsible leaders, financial experts, and outstanding researchers.
                </p>
              </div>
              <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 shadow-sm">
                <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-emerald-500" /> Mission
                </h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  To provide holistic commerce education integrated with global standards, professional certifications, corporate internships, and ethical principles.
                </p>
              </div>
            </div>
          </div>
          <div className="hero-image relative aspect-video rounded-2xl overflow-hidden shadow-lg border border-slate-200 dark:border-slate-800 bg-slate-100">
            <img src={docDeptImg} className="w-full h-full object-cover" alt="Department of Commerce" />
          </div>
        </div>
      </section>

      {/* Course Catalogue Section */}
      <section id="courses" className="courses-section py-20 bg-slate-100/60 dark:bg-slate-950/20 border-y border-slate-200/50 dark:border-slate-900/60 scroll-mt-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-xl mx-auto mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Academic Programmes</h2>
            <p className="text-sm text-slate-500 mt-3">Choose from our specialized undergraduate pathways integrated with professional skills.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {courses.map(course => (
              <div key={course.id} className="course-card rounded-2xl border border-slate-200/60 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-6 flex flex-col justify-between shadow-sm hover:shadow transition-shadow">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">{course.name}</h3>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">{course.description}</p>
                  
                  {activeCourseId === course.id ? (
                    <div className="mt-5 space-y-4 animate-fade-in">
                      <div>
                        <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">Learning Outcomes:</h4>
                        <ul className="mt-1.5 list-disc list-inside text-[11px] text-slate-600 dark:text-slate-400 space-y-1">
                          {course.outcomes.map((out, idx) => <li key={idx}>{out}</li>)}
                        </ul>
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">Career Roles:</h4>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {course.careers.map((car, idx) => (
                            <span key={idx} className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-300 font-medium">
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
                  className="w-full mt-6 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-slate-850 dark:hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                >
                  {activeCourseId === course.id ? "Hide Details" : "View Curriculum Outcomes"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Clubs & Student Life Section */}
      <section id="clubs" className="clubs-section py-20 px-6 max-w-7xl mx-auto scroll-mt-10">
        <div className="text-center max-w-xl mx-auto mb-16">
          <span className="text-xs font-bold text-indigo-500 uppercase tracking-wider">Dynamic Campus Culture</span>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white mt-1">Student-run Associations</h2>
          <p className="text-sm text-slate-500 mt-2">Get involved in our diverse specialized clubs to develop hands-on logistics and planning capabilities.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {clubs.map((club) => (
            <div key={club.id} className="club-card p-6 rounded-2xl border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between">
              <div>
                <span className="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  {club.category}
                </span>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-4">{club.name}</h3>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">{club.description}</p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <span>Inquiries:</span>
                <a href={`mailto:${club.contact_email}`} className="text-indigo-500 hover:underline">{club.contact_email}</a>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Photo Gallery Section */}
      <section id="gallery" className="py-20 bg-slate-100/60 dark:bg-slate-950/20 border-y border-slate-200/50 dark:border-slate-900/60 scroll-mt-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-xl mx-auto mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Campus Live Stream</h2>
            <p className="text-sm text-slate-500 mt-3">Glimpses of recent academic summits, recruitment days, and cultural fests.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {gallery.map((img) => (
              <div
                key={img.id}
                onClick={() => setActiveLightboxImg(img.url)}
                className="group relative aspect-square rounded-xl overflow-hidden cursor-pointer border border-slate-200 dark:border-slate-800 shadow-sm bg-slate-200"
              >
                <img src={img.url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt={img.title} />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <Eye className="w-6 h-6 text-white" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-20 px-6 max-w-3xl mx-auto scroll-mt-10">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Contact Department</h2>
          <p className="text-sm text-slate-500 mt-3">Address and details for official inquiries.</p>
        </div>
        <div className="p-6 rounded-2xl border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-6">
          <div className="flex items-start gap-4">
            <MapPin className="w-5 h-5 text-slate-400 mt-0.5" />
            <div>
              <h4 className="font-semibold text-slate-900 dark:text-white text-sm">Department Office Address</h4>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Department of Commerce, Block IV,<br />
                CHRIST (Deemed to be University), Hosur Road,<br />
                Bengaluru, Karnataka - 560029
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4 border-t border-slate-100 dark:border-slate-800 pt-4">
            <Mail className="w-5 h-5 text-slate-400 mt-0.5" />
            <div>
              <h4 className="font-semibold text-slate-900 dark:text-white text-sm">Official Support Email</h4>
              <p className="text-xs text-slate-500 mt-1">commerce.support@christuniversity.in</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 bg-white dark:bg-[#060606] border-t border-slate-200/60 dark:border-slate-900">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <span>&copy; {new Date().getFullYear()} Department of Commerce, CHRIST (Deemed to be University). All rights reserved.</span>
          <div className="flex gap-6">
            <a href="#" className="hover:underline">Privacy Policy</a>
            <a href="#" className="hover:underline">Terms of Use</a>
          </div>
        </div>
      </footer>

      {/* Lightbox Modal */}
      {activeLightboxImg ? (
        <div
          onClick={() => setActiveLightboxImg(null)}
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 animate-fade-in"
        >
          <img src={activeLightboxImg} className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain" alt="Lightbox" />
        </div>
      ) : null}
    </div>
  );
};
