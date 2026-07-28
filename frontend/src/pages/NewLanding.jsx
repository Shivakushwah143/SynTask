import { useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function NewLanding() {
  useEffect(() => {
    // 1. Dynamically load AOS CSS
    let link = document.getElementById('aos-css');
    if (!link) {
      link = document.createElement('link');
      link.id = 'aos-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/aos@2.3.1/dist/aos.css';
      document.head.appendChild(link);
    }

    // 2. Dynamically load AOS JS and initialize
    const loadAosScript = () => {
      return new Promise((resolve) => {
        if (window.AOS) {
          resolve(window.AOS);
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/aos@2.3.1/dist/aos.js';
        script.onload = () => resolve(window.AOS);
        document.body.appendChild(script);
      });
    };

    loadAosScript().then((AOS) => {
      if (AOS) {
        AOS.init({
          duration: 700,
          once: true,
          easing: 'ease-out-cubic',
          offset: 80
        });
      }
    });

    // 3. Sticky Navbar Shadow
    const handleScroll = () => {
      const nav = document.getElementById('main-nav');
      if (nav) {
        nav.classList.toggle('shadow-lg', window.scrollY > 10);
      }
    };
    window.addEventListener('scroll', handleScroll);

    // 4. Mobile Navigation Toggle
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    const toggleMobileMenu = () => {
      if (mobileMenu) mobileMenu.classList.toggle('hidden');
    };
    if (mobileMenuBtn) {
      mobileMenuBtn.addEventListener('click', toggleMobileMenu);
    }

    // 5. Theme Toggle Logic
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const themeToggleBtnMobile = document.getElementById('theme-toggle-btn-mobile');
    const sunIcon = document.getElementById('theme-sun-icon');
    const moonIcon = document.getElementById('theme-moon-icon');

    const updateThemeUI = (theme) => {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.dataset.theme = 'dark';
        document.documentElement.style.colorScheme = 'dark';
        if (sunIcon) sunIcon.classList.remove('hidden');
        if (moonIcon) moonIcon.classList.add('hidden');
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.dataset.theme = 'light';
        document.documentElement.style.colorScheme = 'light';
        if (sunIcon) sunIcon.classList.add('hidden');
        if (moonIcon) moonIcon.classList.remove('hidden');
      }
    };

    const currentTheme = localStorage.getItem('syntask-theme') || 'light';
    updateThemeUI(currentTheme);

    const toggleTheme = () => {
      const activeTheme = localStorage.getItem('syntask-theme') || 'light';
      const newTheme = activeTheme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('syntask-theme', newTheme);
      localStorage.setItem('theme', newTheme);
      updateThemeUI(newTheme);
    };

    if (themeToggleBtn) themeToggleBtn.addEventListener('click', toggleTheme);
    if (themeToggleBtnMobile) themeToggleBtnMobile.addEventListener('click', toggleTheme);

    // 6. Stats Bar Numbers Counter Animation
    function animateCounter(el) {
      const target = parseInt(el.getAttribute('data-target'));
      const suffix = el.getAttribute('data-suffix') || '';
      const prefix = el.getAttribute('data-prefix') || '';
      const duration = 1500;
      const step = target / (duration / 16);
      let current = 0;
      const timer = setInterval(() => {
        current += step;
        if (current >= target) {
          current = target;
          clearInterval(timer);
        }
        el.textContent = prefix + Math.floor(current).toLocaleString() + suffix;
      }, 16);
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.querySelectorAll('[data-target]').forEach(animateCounter);
          observer.unobserve(e.target);
        }
      });
    }, { threshold: 0.3 });

    document.querySelectorAll('.stats-section').forEach(s => observer.observe(s));

    // 7. Testimonials Carousel
    let currentSlide = 0;
    const slides = document.querySelectorAll('.testimonial-slide');
    const dots = document.querySelectorAll('.carousel-dot');

    function goToSlide(n) {
      if (slides.length === 0) return;
      slides.forEach((s, i) => s.classList.toggle('hidden', i !== n));
      dots.forEach((d, i) => d.classList.toggle('bg-orange-DEFAULT', i === n));
      currentSlide = n;
    }

    const prevBtn = document.querySelector('.carousel-prev');
    const nextBtn = document.querySelector('.carousel-next');

    const handlePrev = () => {
      if (slides.length > 0) {
        goToSlide((currentSlide - 1 + slides.length) % slides.length);
      }
    };
    const handleNext = () => {
      if (slides.length > 0) {
        goToSlide((currentSlide + 1) % slides.length);
      }
    };

    if (prevBtn) prevBtn.addEventListener('click', handlePrev);
    if (nextBtn) nextBtn.addEventListener('click', handleNext);

    let carouselInterval;
    if (slides.length > 0) {
      goToSlide(0);
      carouselInterval = setInterval(handleNext, 5000);
    }

    // 8. Pricing Toggle
    const billingToggle = document.getElementById('billing-toggle');
    const monthlyPrices = ['₹1,999', '₹4,999', '₹9,999'];
    const yearlyPrices = ['₹1,599', '₹3,999', '₹7,999'];
    const priceEls = document.querySelectorAll('.plan-price');
    const periodEls = document.querySelectorAll('.plan-period');

    const handleBillingToggle = () => {
      if (!billingToggle) return;
      const isYearly = billingToggle.checked;
      priceEls.forEach((el, i) => {
        if (i < monthlyPrices.length) {
          el.style.transform = 'scale(0.8)';
          el.style.opacity = '0';
          setTimeout(() => {
            el.textContent = isYearly ? yearlyPrices[i] : monthlyPrices[i];
            el.style.transform = 'scale(1)';
            el.style.opacity = '1';
          }, 200);
        }
      });
      periodEls.forEach(el => {
        el.textContent = isYearly ? '/month, billed yearly' : '/month';
      });
    };

    if (billingToggle) {
      billingToggle.addEventListener('change', handleBillingToggle);
      billingToggle.style.transition = 'all 0.2s';
    }
    priceEls.forEach(el => el.style.transition = 'all 0.2s ease');

    // 9. ROI Calculator
    const empSlider = document.getElementById('employee-slider');
    const toolSlider = document.getElementById('tool-slider');
    const empVal = document.getElementById('employee-count') || document.getElementById('emp-value');
    const toolVal = document.getElementById('tool-count') || document.getElementById('tool-value');
    const savingsEl = document.getElementById('roi-savings');

    function calcROI() {
      if (!empSlider || !toolSlider) return;
      const emp = parseInt(empSlider.value);
      const tools = parseInt(toolSlider.value);
      if (empVal) empVal.textContent = emp >= 1000 ? '1000+' : emp;
      if (toolVal) toolVal.textContent = tools >= 20 ? '20+' : tools;
      const savings = Math.min(emp * tools * 450, 2450000);
      if (savingsEl) {
        savingsEl.textContent = '₹' + savings.toLocaleString('en-IN');
      }
    }

    if (empSlider && toolSlider) {
      empSlider.addEventListener('input', calcROI);
      toolSlider.addEventListener('input', calcROI);
      calcROI();
    }

    // 10. Card Hover Classes
    const selectors = [
      "div.grid.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-3.gap-8 > div",
      "div.grid.md\\:grid-cols-3.gap-8 > div",
      "div.grid.grid-cols-2.md\\:grid-cols-3.gap-6 > div",
      "div.grid.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-3.gap-8.mb-16 > div",
      "div.grid.grid-cols-2.md\\:grid-cols-4.lg\\:grid-cols-7.gap-4 > div",
      "div.grid.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-3.gap-6.mb-12 > div",
      "div.grid.grid-cols-1.lg\\:grid-cols-3.gap-8.mb-16 > div",
      "div.grid.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-4.gap-8 > div"
    ];
    selectors.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(el => {
          el.classList.add('card-hover');
        });
      } catch (e) { }
    });

    // Cleanup listeners
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (mobileMenuBtn) mobileMenuBtn.removeEventListener('click', toggleMobileMenu);
      if (carouselInterval) clearInterval(carouselInterval);
      if (prevBtn) prevBtn.removeEventListener('click', handlePrev);
      if (nextBtn) nextBtn.removeEventListener('click', handleNext);
      if (billingToggle) billingToggle.removeEventListener('change', handleBillingToggle);
      if (empSlider) empSlider.removeEventListener('input', calcROI);
      if (toolSlider) toolSlider.removeEventListener('input', calcROI);
      if (themeToggleBtn) themeToggleBtn.removeEventListener('click', toggleTheme);
      if (themeToggleBtnMobile) themeToggleBtnMobile.removeEventListener('click', toggleTheme);
    };
  }, []);

  return (
    <>
      <style>{`
    
    body {
      font-family: 'Inter', sans-serif;
    }

    /* Custom brand colors and styles from Section 2 */
    .text-brand-orange { color: #FF5C00; }
    .bg-brand-orange { background-color: #FF5C00; }
    .bg-soft-blue { background-color: #F0F7FF; }
    .bg-soft-green { background-color: #F0FFF4; }
    .bg-soft-red { background-color: #FFF5F5; }
    .border-brand-orange { border-color: #FF5C00; }

    /* Custom table styles from Section 3 */
    .comparison-table td, .comparison-table th {
      padding: 1.25rem 1rem;
      border-bottom: 1px solid #E5E7EB;
      text-align: center;
    }
    .comparison-table td:first-child {
      text-align: left;
      font-weight: 500;
    }
    .highlight-column {
      background-color: #FFF7F2;
      border-left: 2px solid #FF5C00;
      border-right: 2px solid #FF5C00;
    }
    .highlight-header {
      background-color: #FF5C00;
      color: white;
    }

    /* Custom styles from Section 4 */
    .card-shadow {
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
    }
    .dotted-bg {
      background-image: radial-gradient(#d1d5db 1px, transparent 1px);
      background-size: 20px 20px;
    }

    /* Custom styles from Section 5 */
    .bg-syn-orange { background-color: #FF5A1F; }
    .text-syn-orange { color: #FF5A1F; }
    .border-syn-orange { border-color: #FF5A1F; }
    .hero-gradient { background: radial-gradient(circle at 70% 50%, #fff5f2 0%, #ffffff 100%); }

    /* Custom styles from Section 6 */
    .text-gradient-orange {
      background: linear-gradient(90deg, #FF4D00, #FF9500);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .toggle-checkbox:checked {
      right: 0;
      border-color: #68D391;
    }
    .toggle-checkbox:checked + .toggle-label {
      background-color: #68D391;
    }

    /* HOVER & TRANSITION EFFECTS CHECKLIST */
    .card-hover {
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .card-hover:hover {
      transform: translateY(-4px) !important;
      box-shadow: 0 12px 40px rgba(0,0,0,0.10) !important;
    }
    .btn-primary {
      transition: background-color 0.2s, transform 0.15s;
    }
    .btn-primary:hover {
      transform: scale(1.02);
    }
    .nav-link {
      position: relative;
    }
    .nav-link::after {
      content: '';
      position: absolute;
      bottom: -2px;
      left: 0;
      width: 0;
      height: 2px;
      background: #FF5C00;
      transition: width 0.2s;
    }
    .nav-link:hover::after {
      width: 100%;
    }
    img {
      transition: transform 0.5s ease;
    }

    /* DARK MODE OVERRIDES */
    .dark .comparison-table td, .dark .comparison-table th {
      border-bottom-color: #1e293b;
    }
    .dark .highlight-column {
      background-color: #18110b;
      border-left-color: #FF5C00;
      border-right-color: #FF5C00;
    }
    .dark .dotted-bg {
      background-image: radial-gradient(#334155 1px, transparent 1px);
    }
    .dark .hero-gradient {
      background: radial-gradient(circle at 70% 50%, #1c1512 0%, #0A0B1A 100%);
    }
    .dark .bg-slate-900 {
      background-color: #0d0e20;
    }

  `}</style>


      <header id="main-nav" className="sticky top-0 z-50 bg-white/90 dark:bg-[#0A0B1A]/90 backdrop-blur-md border-b border-gray-100 dark:border-slate-800 transition-shadow duration-300">
        <nav className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-10">
            <div className="flex items-center gap-2" data-purpose="logo">
              <div className="w-8 h-8 bg-brand-orange rounded-lg flex items-center justify-center">
                <div className="w-4 h-4 bg-white dark:bg-[#0A0B1A] rounded-sm transform rotate-45"></div>
              </div>
              <span className="text-2xl font-bold tracking-tight">SynTask</span>
            </div>
            <div className="hidden lg:flex items-center gap-8 text-sm font-medium text-gray-600 dark:text-gray-300">
              <a className="hover:text-black flex items-center gap-1" href="#">Features <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg></a>
              <a className="hover:text-black flex items-center gap-1" href="#">Solutions <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg></a>
              <a className="hover:text-black" href="#">AI Workforce</a>
              <a className="hover:text-black" href="#">Pricing</a>
              <a className="hover:text-black flex items-center gap-1" href="#">Resources <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg></a>
              <a className="hover:text-black flex items-center gap-1" href="#">Company <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg></a>
            </div>
          </div>
          <div className="flex items-center gap-4">

            <button id="theme-toggle-btn" className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 rounded-full hover:text-gray-900 transition dark:text-gray-400 dark:hover:bg-slate-800 dark:hover:text-white">
              <svg id="theme-sun-icon" className="w-5 h-5 hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z"></path>
              </svg>
              <svg id="theme-moon-icon" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path>
              </svg>
            </button>
            <button id="mobile-menu-btn" className="lg:hidden p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 rounded-full hover:text-gray-900 transition">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
            </button>

            <button className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 rounded-full"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg></button>
            <Link className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-full border border-gray-200 dark:border-slate-700 hover:bg-gray-50" to="/login">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
              Login
            </Link>
            <a className="bg-slate-900 text-white text-sm font-semibold px-5 py-2.5 rounded-full flex items-center gap-2 hover:bg-slate-800" href="#">
              Start Free Trial <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
            </a>
          </div>
        </nav>

        <div id="mobile-menu" className="hidden lg:hidden bg-white dark:bg-[#0A0B1A] dark:bg-[#0A0B1A] border-b border-gray-100 dark:border-slate-800 dark:border-slate-800 shadow-md px-6 py-4 flex flex-col gap-4">
          <a className="hover:text-[#FF5C00] font-medium dark:text-gray-300 dark:hover:text-white" href="#">Features</a>
          <a className="hover:text-[#FF5C00] font-medium dark:text-gray-300 dark:hover:text-white" href="#">Solutions</a>
          <a className="hover:text-[#FF5C00] font-medium dark:text-gray-300 dark:hover:text-white" href="#">AI Workforce</a>
          <a className="hover:text-[#FF5C00] font-medium dark:text-gray-300 dark:hover:text-white" href="#">Pricing</a>
          <a className="hover:text-[#FF5C00] font-medium dark:text-gray-300 dark:hover:text-white" href="#">Resources</a>
          <a className="hover:text-[#FF5C00] font-medium dark:text-gray-300 dark:hover:text-white" href="#">Company</a>
          <hr className="border-gray-100 dark:border-slate-800 dark:border-slate-800" />
          <button id="theme-toggle-btn-mobile" className="flex items-center gap-2 hover:text-[#FF5C00] font-medium text-left dark:text-gray-300 dark:hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
            Toggle Theme
          </button>
          <Link className="flex items-center gap-2 hover:text-[#FF5C00] font-medium dark:text-gray-300 dark:hover:text-white" to="/login">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
            Login
          </Link>
          <a className="bg-slate-900 dark:bg-slate-800 text-white text-center font-semibold py-2.5 rounded-full hover:bg-slate-800 dark:hover:bg-slate-700" href="#">
            Start Free Trial
          </a>
        </div>
      </header>

      <div id="content-sections">





        <main className="relative overflow-hidden pt-16 pb-24 lg:pt-24 bg-white dark:bg-[#0A0B1A]">
          <div className="max-w-7xl mx-auto px-4 grid lg:grid-cols-2 gap-12 items-center">
            <div data-purpose="hero-content">
              <div className="inline-block px-4 py-1.5 rounded-full bg-orange-50 dark:bg-orange-950/20 border border-orange-100 mb-6">
                <span className="text-xs font-bold uppercase tracking-widest text-brand-orange">AI THAT WORKS WHILE YOU GROW</span>
              </div>
              <h1 className="text-6xl lg:text-7xl font-extrabold text-slate-900 dark:text-white leading-[1.1] mb-6">
                One Platform.<br />
                <span className="text-brand-orange">Unlimited Possibilities.</span>
              </h1>
              <p className="text-lg text-slate-600 dark:text-gray-300 mb-10 max-w-lg leading-relaxed">
                SynTask's AI Workforce is designed to automate work, bring teams together and help you deliver exceptional results for your clients and your business.
              </p>
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-[#111224]/50">
                  <div className="w-8 h-8 rounded bg-white dark:bg-[#0A0B1A] shadow-sm flex items-center justify-center text-blue-500">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z"></path></svg>
                  </div>
                  <span className="text-xs font-semibold text-slate-700 dark:text-gray-200">All-in-One Platform</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-[#111224]/50">
                  <div className="w-8 h-8 rounded bg-white dark:bg-[#0A0B1A] shadow-sm flex items-center justify-center text-green-500">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" fillRule="evenodd"></path></svg>
                  </div>
                  <span className="text-xs font-semibold text-slate-700 dark:text-gray-200">AI-Powered Automation</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-[#111224]/50">
                  <div className="w-8 h-8 rounded bg-white dark:bg-[#0A0B1A] shadow-sm flex items-center justify-center text-blue-400">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"></path></svg>
                  </div>
                  <span className="text-xs font-semibold text-slate-700 dark:text-gray-200">Real-time Collaboration</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-[#111224]/50">
                  <div className="w-8 h-8 rounded bg-white dark:bg-[#0A0B1A] shadow-sm flex items-center justify-center text-indigo-500">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"></path></svg>
                  </div>
                  <span className="text-xs font-semibold text-slate-700 dark:text-gray-200">Built for Service Companies</span>
                </div>
              </div>
            </div>
            <div className="relative" data-purpose="hero-image-container">

              <img alt="SynTask Dashboard Preview" className="w-full h-auto rounded-3xl shadow-2xl" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCLeaLr-L9QlJqIws1q3315eXnXcYwpU_aoRZc47oIJz_0HiemVGEqsF-tcYQkK-MFCeUvIpBGx20OCsFk13prCPqmSuypHtZwfLKpfFK2SoEOGwECkHnj9tlYIja3ge1XyhwWuppNRFkygQQF4mq_L2Ho3-zwNyPSBRjNYxf1j4hRU11ml8y-IMuNdrnovrlVXtuaezhbFs3GXqLHgqzvG-yLJxXwg9SOk9utpP3zibS1YkoOvaIyV8w9sAQDT9QSZuWlSbCL4Pg" />
            </div>
          </div>
        </main>


        <section className="py-24 bg-gray-50/30 dark:bg-[#111224]/30">
          <div className="max-w-7xl mx-auto px-4">
            <div className="text-center mb-16">
              <div className="inline-block px-4 py-1.5 rounded-full bg-orange-50 dark:bg-orange-950/20 mb-4">
                <span className="text-xs font-bold uppercase tracking-widest text-brand-orange">WHY BUSINESSES CHOOSE SYNTASK</span>
              </div>
              <h2 className="text-4xl font-bold text-slate-900 dark:text-white">Replace Multiple Tools. Replace Manual Work.<br />Replace Limits.</h2>
            </div>
            <div className="grid lg:grid-cols-3 gap-8 items-stretch">

              <div className="bg-white dark:bg-[#0A0B1A] p-10 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-8 text-center">The Traditional Way</h3>
                <ul className="space-y-6">
                  <li className="flex items-center gap-3">
                    <div className="w-5 h-5 flex-shrink-0 bg-red-100 text-red-500 rounded-full flex items-center justify-center text-xs">✕</div>
                    <span className="text-gray-600 dark:text-gray-300 font-medium">10+ different tools &amp; subscriptions</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-5 h-5 flex-shrink-0 bg-red-100 text-red-500 rounded-full flex items-center justify-center text-xs">✕</div>
                    <span className="text-gray-600 dark:text-gray-300 font-medium">Manual follow-ups &amp; updates</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-5 h-5 flex-shrink-0 bg-red-100 text-red-500 rounded-full flex items-center justify-center text-xs">✕</div>
                    <span className="text-gray-600 dark:text-gray-300 font-medium">Scattered data &amp; reports</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-5 h-5 flex-shrink-0 bg-red-100 text-red-500 rounded-full flex items-center justify-center text-xs">✕</div>
                    <span className="text-gray-600 dark:text-gray-300 font-medium">Disconnected teams &amp; systems</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-5 h-5 flex-shrink-0 bg-red-100 text-red-500 rounded-full flex items-center justify-center text-xs">✕</div>
                    <span className="text-gray-600 dark:text-gray-300 font-medium">High software costs &amp; complexity</span>
                  </li>
                </ul>
              </div>

              <div className="relative bg-white dark:bg-[#0A0B1A] p-10 rounded-3xl border-2 border-green-500 shadow-xl lg:-mt-4 lg:mb-4">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-green-500 text-white text-[10px] font-bold uppercase rounded-full">VS</div>
                <h3 className="text-xl font-bold text-green-600 dark:text-green-400 mb-8 text-center">The SynTask Way</h3>
                <ul className="space-y-6">
                  <li className="flex items-center gap-3">
                    <div className="w-5 h-5 flex-shrink-0 bg-green-100 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center text-xs font-bold">✓</div>
                    <span className="text-slate-800 dark:text-white font-semibold">One AI-powered Business Operating System</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-5 h-5 flex-shrink-0 bg-green-100 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center text-xs font-bold">✓</div>
                    <span className="text-slate-800 dark:text-white font-semibold">AI automation handles repetitive work</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-5 h-5 flex-shrink-0 bg-green-100 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center text-xs font-bold">✓</div>
                    <span className="text-slate-800 dark:text-white font-semibold">Real-time dashboards &amp; unified data</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-5 h-5 flex-shrink-0 bg-green-100 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center text-xs font-bold">✓</div>
                    <span className="text-slate-800 dark:text-white font-semibold">Teams collaborate in one workspace</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-5 h-5 flex-shrink-0 bg-green-100 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center text-xs font-bold">✓</div>
                    <span className="text-slate-800 dark:text-white font-semibold">Lower costs. Higher productivity. More growth.</span>
                  </li>
                </ul>
              </div>

              <div className="bg-white dark:bg-[#0A0B1A] p-10 rounded-3xl border border-gray-100 dark:border-slate-800 flex flex-col justify-center items-center text-center shadow-sm">
                <div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center mb-6">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                </div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">Ready to see the difference?</h3>
                <p className="text-gray-500 dark:text-gray-400 mb-8 px-4">Thousands of service companies are running their entire business on SynTask.</p>
                <div className="w-full space-y-3">
                  <button className="w-full bg-brand-orange text-white font-bold py-4 rounded-xl hover:bg-orange-600 transition-colors">Start Free Trial</button>
                  <button className="w-full bg-white dark:bg-[#0A0B1A] text-slate-800 dark:text-white border border-gray-200 dark:border-slate-700 font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors">
                    Book a Demo <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>


        <section className="py-24 bg-white dark:bg-[#0A0B1A]">
          <div className="max-w-7xl mx-auto px-4">
            <div className="text-center mb-16">
              <div className="inline-block px-4 py-1.5 rounded-full bg-orange-50 dark:bg-orange-950/20 mb-4">
                <span className="text-xs font-bold uppercase tracking-widest text-brand-orange">TRUSTED BY MODERN BUSINESSES</span>
              </div>
              <h2 className="text-4xl font-bold text-slate-900 dark:text-white">Powering Growth Across Industries</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">

              <div className="p-6 text-center border border-gray-100 dark:border-slate-800 rounded-2xl hover:shadow-lg transition-shadow bg-white dark:bg-[#0A0B1A]">
                <div className="text-orange-500 mb-4 flex justify-center">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                </div>
                <span className="text-sm font-bold block">Digital Marketing Agencies</span>
              </div>

              <div className="p-6 text-center border border-gray-100 dark:border-slate-800 rounded-2xl hover:shadow-lg transition-shadow bg-white dark:bg-[#0A0B1A]">
                <div className="text-purple-500 mb-4 flex justify-center">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                </div>
                <span className="text-sm font-bold block">Creative Agencies</span>
              </div>

              <div className="p-6 text-center border border-gray-100 dark:border-slate-800 rounded-2xl hover:shadow-lg transition-shadow bg-white dark:bg-[#0A0B1A]">
                <div className="text-blue-500 mb-4 flex justify-center">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                </div>
                <span className="text-sm font-bold block">IT Services Companies</span>
              </div>

              <div className="p-6 text-center border border-gray-100 dark:border-slate-800 rounded-2xl hover:shadow-lg transition-shadow bg-white dark:bg-[#0A0B1A]">
                <div className="text-green-500 mb-4 flex justify-center">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                </div>
                <span className="text-sm font-bold block">Software Development Companies</span>
              </div>

              <div className="p-6 text-center border border-gray-100 dark:border-slate-800 rounded-2xl hover:shadow-lg transition-shadow bg-white dark:bg-[#0A0B1A]">
                <div className="text-indigo-500 mb-4 flex justify-center">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                </div>
                <span className="text-sm font-bold block">Product Engineering Companies</span>
              </div>

              <div className="p-6 text-center border border-gray-100 dark:border-slate-800 rounded-2xl hover:shadow-lg transition-shadow bg-white dark:bg-[#0A0B1A]">
                <div className="text-teal-500 mb-4 flex justify-center">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                </div>
                <span className="text-sm font-bold block">Consulting &amp; Professional Services</span>
              </div>
            </div>
          </div>
        </section>


        <section className="max-w-7xl mx-auto px-4 mb-24 stats-section">
          <div className="bg-slate-900 text-white rounded-[40px] p-12 relative overflow-hidden">

            <div className="absolute top-0 right-0 w-64 h-full bg-white/5 skew-x-12"></div>
            <div className="relative z-10 grid grid-cols-2 lg:grid-cols-5 gap-8 items-center">
              <div className="text-center">
                <div className="flex justify-center mb-2">
                  <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1a1 1 0 112 0v1a1 1 0 11-2 0zM13.536 14.95a1 1 0 010-1.414l.707-.707a1 1 0 011.414 1.414l-.707.707a1 1 0 01-1.414 0zM6.464 14.95a1 1 0 01-1.414 0l-.707-.707a1 1 0 011.414-1.414l.707.707a1 1 0 010 1.414z"></path></svg>
                  </div>
                </div>
                <div className="text-2xl font-bold" data-target="500" data-suffix="+">500+</div>
                <div className="text-[10px] uppercase tracking-wider text-gray-400">Companies Trust SynTask</div>
              </div>
              <div className="text-center">
                <div className="flex justify-center mb-2">
                  <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z" fillRule="evenodd"></path></svg>
                  </div>
                </div>
                <div className="text-2xl font-bold" data-target="25" data-suffix="+">25+</div>
                <div className="text-[10px] uppercase tracking-wider text-gray-400">Countries Worldwide</div>
              </div>
              <div className="text-center">
                <div className="flex justify-center mb-2">
                  <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" fillRule="evenodd"></path></svg>
                  </div>
                </div>
                <div className="text-2xl font-bold" data-target="10" data-suffix="M+">10M+</div>
                <div className="text-[10px] uppercase tracking-wider text-gray-400">Tasks Automated</div>
              </div>
              <div className="text-center">
                <div className="flex justify-center mb-2">
                  <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" fillRule="evenodd"></path></svg>
                  </div>
                </div>
                <div className="text-2xl font-bold" data-target="1" data-suffix="M+">1M+</div>
                <div className="text-[10px] uppercase tracking-wider text-gray-400">Users Empowered</div>
              </div>
              <div className="text-center">
                <div className="flex justify-center mb-2">
                  <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" fillRule="evenodd"></path></svg>
                  </div>
                </div>
                <div className="text-2xl font-bold" data-target="98" data-suffix="%">98%</div>
                <div className="text-[10px] uppercase tracking-wider text-gray-400">Customer Satisfaction</div>
              </div>
            </div>
          </div>
        </section>


        <section className="py-24 bg-gray-50/50 dark:bg-[#111224]/50">
          <div className="max-w-7xl mx-auto px-4">
            <div className="text-center mb-16">
              <div className="inline-block px-4 py-1.5 rounded-full bg-orange-50 dark:bg-orange-950/20 mb-4">
                <span className="text-xs font-bold uppercase tracking-widest text-brand-orange">RECOGNIZED &amp; CERTIFIED</span>
              </div>
              <h2 className="text-4xl font-bold text-slate-900 dark:text-white">Enterprise-Grade Security &amp; Compliance</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="bg-white dark:bg-[#0A0B1A] p-6 rounded-2xl border border-gray-100 dark:border-slate-800 flex flex-col items-center gap-3">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                <div className="text-center">
                  <div className="text-sm font-bold">ISO 27001</div>
                  <div className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">Certified</div>
                </div>
              </div>
              <div className="bg-white dark:bg-[#0A0B1A] p-6 rounded-2xl border border-gray-100 dark:border-slate-800 flex flex-col items-center gap-3">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                <div className="text-center">
                  <div className="text-sm font-bold">SOC 2</div>
                  <div className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">Compliant</div>
                </div>
              </div>
              <div className="bg-white dark:bg-[#0A0B1A] p-6 rounded-2xl border border-gray-100 dark:border-slate-800 flex flex-col items-center gap-3">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                <div className="text-center">
                  <div className="text-sm font-bold">GDPR</div>
                  <div className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">Ready</div>
                </div>
              </div>
              <div className="bg-white dark:bg-[#0A0B1A] p-6 rounded-2xl border border-gray-100 dark:border-slate-800 flex flex-col items-center gap-3">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                <div className="text-center">
                  <div className="text-sm font-bold">99.9%</div>
                  <div className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">Uptime SLA</div>
                </div>
              </div>
              <div className="bg-white dark:bg-[#0A0B1A] p-6 rounded-2xl border border-gray-100 dark:border-slate-800 flex flex-col items-center gap-3">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                <div className="text-center">
                  <div className="text-sm font-bold">256-bit</div>
                  <div className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">Encryption</div>
                </div>
              </div>
              <div className="bg-white dark:bg-[#0A0B1A] p-6 rounded-2xl border border-gray-100 dark:border-slate-800 flex flex-col items-center gap-3">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                <div className="text-center">
                  <div className="text-sm font-bold">Regular</div>
                  <div className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">Backups</div>
                </div>
              </div>
            </div>
          </div>
        </section>


        <section className="max-w-7xl mx-auto px-4 py-24">
          <div className="bg-slate-900 rounded-[40px] p-12 lg:p-16 flex flex-col lg:flex-row items-center gap-12 relative overflow-hidden">
            <div className="relative z-10 flex-1">
              <div className="flex items-start gap-6">
                <div className="w-16 h-16 bg-white/10 rounded-2xl flex-shrink-0 flex items-center justify-center text-white">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                </div>
                <div>
                  <h2 className="text-4xl font-extrabold text-white mb-4">Stay Ahead. Get Smarter.<br />Grow Faster.</h2>
                  <p className="text-gray-400 text-sm">Get weekly insights, product updates and automation tips straight to your inbox.</p>
                </div>
              </div>
            </div>
            <div className="relative z-10 w-full lg:w-auto">
              <form className="flex flex-col gap-4">
                <div className="flex flex-col md:flex-row gap-0 rounded-2xl overflow-hidden border border-white/10">
                  <input className="bg-white/5 border-none text-white px-6 py-4 w-full md:w-80 focus:ring-0 placeholder:text-gray-500" placeholder="Enter your work email" type="email" />
                  <button className="bg-brand-orange text-white font-bold px-8 py-4 hover:bg-orange-600 transition-colors" type="submit">Subscribe</button>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <div className="flex items-center gap-2 text-xs text-gray-400"><div className="w-4 h-4 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center text-[10px]">✓</div> No spam</div>
                  <div className="flex items-center gap-2 text-xs text-gray-400"><div className="w-4 h-4 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center text-[10px]">✓</div> Unsubscribe anytime</div>
                  <div className="flex items-center gap-2 text-xs text-gray-400"><div className="w-4 h-4 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center text-[10px]">✓</div> Actionable insights</div>
                </div>
              </form>
            </div>

            <div className="absolute right-0 bottom-0 w-32 h-32 bg-white/5 rounded-full blur-3xl"></div>
          </div>
        </section>






        <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent dark:via-slate-800 my-4"></div>





        <header className="pt-16 pb-20 px-6 overflow-hidden">
          <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-12">
            <div className="lg:w-1/2" data-purpose="hero-text-content">
              <span className="inline-block px-3 py-1 bg-orange-50 dark:bg-orange-950/20 text-syntaskOrange text-xs font-bold uppercase tracking-wider rounded-full mb-6">Compare SynTask</span>
              <h1 className="text-5xl lg:text-6xl font-extrabold leading-tight mb-6">
                SynTask vs The Rest.<br />
                See the <span className="text-syntaskOrange italic">Clear Difference.</span>
              </h1>
              <p className="text-gray-500 dark:text-gray-400 text-lg mb-10 max-w-lg">
                SynTask brings all your work, teams and clients together in one AI-powered platform. See how we compare with other popular tools.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="w-12 h-12 bg-purple-50 dark:bg-purple-950/20 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                  </div>
                  <p className="text-xs font-bold text-gray-800 dark:text-white">One Platform</p>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-green-50 dark:bg-green-950/20 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                  </div>
                  <p className="text-xs font-bold text-gray-800 dark:text-white">AI-Powered</p>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-orange-50 dark:bg-orange-950/20 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                  </div>
                  <p className="text-xs font-bold text-gray-800 dark:text-white">End-to-End Automation</p>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-blue-50 dark:bg-blue-950/20 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                  </div>
                  <p className="text-xs font-bold text-gray-800 dark:text-white">Lower Cost</p>
                </div>
              </div>
            </div>
            <div className="lg:w-1/2 relative" data-purpose="hero-dashboard-preview">
              <img alt="SynTask Dashboard Preview" className="w-full object-contain rounded-2xl shadow-2xl" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBQRgQDuakZM1U9-pFIzuFNmnxP9_9VkR0wo4AQxk15HS4_T3LRP5hHz1CMR3oNpLGq_8j9xQnGbfYOpePghW749V44G6GTf48EprmBhiJxbBf7BFS38kzcxwIDoWApkcr2QpiFXxUcCC3I7Mm288dkOsSD0BklDpFLDUZ4AkR5AGq7TCNJ3M07bK7PmpA7EVa5EHuFM_6cqoCq0NCYDHxzIrZYl5weO45qA1GF0cismwBVgZ9PBffrC6oOdVT6qwoy70ZOTQcwig" />
            </div>
          </div>
        </header>


        <section className="py-12 px-6 bg-white dark:bg-[#0A0B1A]">
          <div className="max-w-7xl mx-auto">

            <div className="flex flex-wrap justify-center gap-4 mb-12">
              <button className="flex items-center space-x-2 px-6 py-3 bg-white dark:bg-[#0A0B1A] border-2 border-syntaskOrange rounded-xl shadow-sm">
                <div className="w-5 h-5 bg-syntaskOrange rounded flex items-center justify-center text-[10px] text-white">S</div>
                <span className="font-bold text-sm">SynTask</span>
              </button>
              <div className="flex items-center text-gray-300">vs</div>
              <button className="flex items-center space-x-2 px-6 py-3 bg-white dark:bg-[#0A0B1A] border border-gray-200 dark:border-slate-700 rounded-xl hover:border-gray-300">
                <img alt="ClickUp" className="w-5 h-5" src="https://lh3.googleusercontent.com/aida-public/AB6AXuB-7eEdzd75P9hGB0whvyOGai1NZnUAQlA0nDG1_2VeKZzEt7Q8Xehimtb3W8DyGjIrkXGx--BRBMT0KG4EWCZ4tpsmIUYWbC8xJyurYuolWPBWa3kXw3KDTHoGT1EWktRK7VPeSh2vbsGyrrSzcdMRFH0Z4ssow2GPNMlu1jaICvA5e1_AOxDjt0tNXQ1GTRPuIaS6cPNicIl6ptVIjMFGrLrAKcGU7_FgZR73iy-_WbJNwJXnj2IuEGBjT7NADn3ylKZBJp6Mcw" />
                <span className="font-bold text-sm text-gray-600 dark:text-gray-300">ClickUp</span>
              </button>
              <div className="flex items-center text-gray-300">vs</div>
              <button className="flex items-center space-x-2 px-6 py-3 bg-white dark:bg-[#0A0B1A] border border-gray-200 dark:border-slate-700 rounded-xl hover:border-gray-300">
                <img alt="Monday.com" className="w-5 h-5" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCOjcameg2hBOEk3EL0O9nTH84QWDZHQRF01G9mG-ntG2jnwOSpvebHCkqpQXJ3Sbm_OWEbihB3o-6jZR809yYiZvmvxIkFuSyCZGidpMUScXuR3JREzsvV4_6cBBTbvJ0WoMFz6wFwJMU6yS-F6Bw6FoQxwdUMkZ8I0a2ubHDqCsSzJDL0WyHJCnZ5VRrP89qFcL1mAT7cYbWnBDcKuAf86piKGZ296HMKCeekO3TwTxB6p5QFPh4NIbr_0LljosBh15NUXYADIw" />
                <span className="font-bold text-sm text-gray-600 dark:text-gray-300">Monday.com</span>
              </button>
              <div className="flex items-center text-gray-300">vs</div>
              <button className="flex items-center space-x-2 px-6 py-3 bg-white dark:bg-[#0A0B1A] border border-gray-200 dark:border-slate-700 rounded-xl hover:border-gray-300">
                <img alt="HubSpot" className="w-5 h-5" src="https://lh3.googleusercontent.com/aida-public/AB6AXuA7HcIqm4vNsnz0Lpnc_8nqDqar3v-3EktM3xtVLkf9m-G33tQv8hyhF21crmnABMVfE_Tna_jwXF7vkp3DNmxAiVI25mah5iPOGRKkrqJBQEIT1dI2RNBM5r3W_ImDw_hV3biXCYzAEo5h2_WH7afosY_uE29rN3PnWUtW8zsW5jgfC6AGq8JmeV_ffUOFvVRymX6jE2xjIPGhlEuE3OkN3558H4UL6EN6jrS-EA4lc4txTrJ4lC5ldvbJfSQIikQPMpNDUISW5g" />
                <span className="font-bold text-sm text-gray-600 dark:text-gray-300">HubSpot</span>
              </button>
              <div className="flex items-center text-gray-300">vs</div>
              <button className="flex items-center space-x-2 px-6 py-3 bg-white dark:bg-[#0A0B1A] border border-gray-200 dark:border-slate-700 rounded-xl hover:border-gray-300">
                <img alt="Zoho One" className="w-5 h-5" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCiJD4IsUSiUYF__I3juOI2iX5_ECXGgFzvRC576NN5h7LogwrQcWEwIZhkS_2psOnRa_YKTHXQu7BClVaO3U1QWjgkXD5NO4EZEv4uy_B0dSO46P93Gl4Bue8OHT1mjkeUqkAqlndHxN8BIkwgE45svLZ7B-C7azoa-yTmIkJ23w-l79-ObwsIpZnqe-Xvc4ga1lwgyYDJvg--l17d92LqAVwFY8GNkZwHK82r4LcFEc031QMGvI9FhybweYHEq3BCg2Yw4vAlXg" />
                <span className="font-bold text-sm text-gray-600 dark:text-gray-300">Zoho One</span>
              </button>
              <div className="flex items-center text-gray-300">vs</div>
              <button className="flex items-center space-x-2 px-6 py-3 bg-white dark:bg-[#0A0B1A] border border-gray-200 dark:border-slate-700 rounded-xl hover:border-gray-300">
                <img alt="Salesforce" className="w-5 h-5" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDnM9XhvmrDqaf5XGyYPmiaDtN-LdECKh1ycZ6Zq7-mZa3g9V7pugPFftciC7dps5IbJBIyXMzyDrFp8BF9jKsFPouWMr6e669HcZzTh7axu_9yX_G97wbbUcSEGTKiJ5w1MICuMxg4nD4BHrC3XOyFGUZvm0rtpRw9mjXWyAAYW5BDCMN-879FCJroixWtyrlZspEiY6Z_87MiMHhzBSj6J9L-r0mSIeZVVYvJVhOYSA2T-yatyWXKxg_UMrzsCDbh58o5U-9fIw" />
                <span className="font-bold text-sm text-gray-600 dark:text-gray-300">Salesforce</span>
              </button>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-slate-700">
              <table className="w-full comparison-table border-collapse">
                <thead>
                  <tr>
                    <th className="bg-gray-50 dark:bg-[#111224] text-gray-700 dark:text-gray-200 font-bold w-1/5">Features</th>
                    <th className="highlight-header w-[15%]">
                      <div className="flex items-center justify-center space-x-2">
                        <div className="w-6 h-6 bg-white dark:bg-[#0A0B1A] rounded-md flex items-center justify-center text-syntaskOrange text-[10px]">S</div>
                        <span>SynTask</span>
                      </div>
                    </th>
                    <th className="bg-gray-50 dark:bg-[#111224] text-gray-700 dark:text-gray-200 w-[13%]">
                      <div className="flex flex-col items-center">
                        <span className="text-xs mb-1">ClickUp</span>
                      </div>
                    </th>
                    <th className="bg-gray-50 dark:bg-[#111224] text-gray-700 dark:text-gray-200 w-[13%] text-xs">Monday.com</th>
                    <th className="bg-gray-50 dark:bg-[#111224] text-gray-700 dark:text-gray-200 w-[13%] text-xs">HubSpot</th>
                    <th className="bg-gray-50 dark:bg-[#111224] text-gray-700 dark:text-gray-200 w-[13%] text-xs">Zoho One</th>
                    <th className="bg-gray-50 dark:bg-[#111224] text-gray-700 dark:text-gray-200 w-[13%] text-xs">Salesforce</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  <tr>
                    <td>AI-Powered Automation</td>
                    <td className="highlight-column text-green-600 dark:text-green-400 font-bold text-xl">✓</td>
                    <td className="text-gray-400">Limited</td>
                    <td className="text-gray-400">Limited</td>
                    <td className="text-gray-400">Limited</td>
                    <td className="text-gray-400">Limited</td>
                    <td className="text-gray-400">Limited</td>
                  </tr>
                  <tr>
                    <td>All-in-One Platform</td>
                    <td className="highlight-column text-green-600 dark:text-green-400 font-bold text-xl">✓</td>
                    <td className="text-gray-400">✕</td>
                    <td className="text-gray-400">✕</td>
                    <td className="text-gray-400">✕</td>
                    <td className="text-gray-400">✕</td>
                    <td className="text-gray-400">✕</td>
                  </tr>
                  <tr>
                    <td>Client Management</td>
                    <td className="highlight-column text-green-600 dark:text-green-400 font-bold text-xl">✓</td>
                    <td className="text-gray-400">Limited</td>
                    <td className="text-gray-400">Limited</td>
                    <td className="text-gray-400">Limited</td>
                    <td className="text-gray-400">Limited</td>
                    <td className="text-green-600 dark:text-green-400 text-xl">✓</td>
                  </tr>
                  <tr>
                    <td>Project Management</td>
                    <td className="highlight-column text-green-600 dark:text-green-400 font-bold text-xl">✓</td>
                    <td className="text-green-600 dark:text-green-400 text-xl">✓</td>
                    <td className="text-green-600 dark:text-green-400 text-xl">✓</td>
                    <td className="text-gray-400 text-xs">Limited</td>
                    <td className="text-gray-400 text-xs">Limited</td>
                    <td className="text-gray-400 text-xs">Limited</td>
                  </tr>
                  <tr>
                    <td>HR &amp; Team Management</td>
                    <td className="highlight-column text-green-600 dark:text-green-400 font-bold text-xl">✓</td>
                    <td className="text-gray-400 text-xs">Limited</td>
                    <td className="text-gray-400 text-xs">Limited</td>
                    <td className="text-gray-400 text-xs">Limited</td>
                    <td className="text-green-600 dark:text-green-400 text-xl">✓</td>
                    <td className="text-gray-400 text-xs">Limited</td>
                  </tr>
                  <tr>
                    <td>Finance &amp; Invoicing</td>
                    <td className="highlight-column text-green-600 dark:text-green-400 font-bold text-xl">✓</td>
                    <td className="text-gray-400 text-xs">Limited</td>
                    <td className="text-gray-400 text-xs">Limited</td>
                    <td className="text-green-600 dark:text-green-400 text-xl">✓</td>
                    <td className="text-green-600 dark:text-green-400 text-xl">✓</td>
                    <td className="text-gray-400 text-xs">Limited</td>
                  </tr>
                  <tr>
                    <td>AI Workforce (Virtual Employees)</td>
                    <td className="highlight-column text-green-600 dark:text-green-400 font-bold text-xl">✓</td>
                    <td className="text-gray-400">✕</td>
                    <td className="text-gray-400">✕</td>
                    <td className="text-gray-400">✕</td>
                    <td className="text-gray-400">✕</td>
                    <td className="text-gray-400">✕</td>
                  </tr>
                  <tr>
                    <td>Ease of Use</td>
                    <td className="highlight-column text-syntaskOrange">★★★★★</td>
                    <td>★★★☆☆</td>
                    <td>★★★☆☆</td>
                    <td>★★★☆☆</td>
                    <td>★★☆☆☆</td>
                    <td>★★☆☆☆</td>
                  </tr>
                  <tr>
                    <td>Integrations</td>
                    <td className="highlight-column font-bold">500+</td>
                    <td>1000+</td>
                    <td>200+</td>
                    <td>1500+</td>
                    <td>1000+</td>
                    <td>3000+</td>
                  </tr>
                  <tr>
                    <td>Starting Price</td>
                    <td className="highlight-column">
                      <div className="font-bold">₹149 /user</div>
                      <div className="text-[10px] text-gray-400">/month</div>
                    </td>
                    <td>
                      <div className="font-bold">$7 /user</div>
                      <div className="text-[10px] text-gray-400">/month</div>
                    </td>
                    <td>
                      <div className="font-bold">$8 /user</div>
                      <div className="text-[10px] text-gray-400">/month</div>
                    </td>
                    <td>
                      <div className="font-bold">$20 /user</div>
                      <div className="text-[10px] text-gray-400">/month</div>
                    </td>
                    <td>
                      <div className="font-bold">$37 /user</div>
                      <div className="text-[10px] text-gray-400">/month</div>
                    </td>
                    <td>
                      <div className="font-bold">$25 /user</div>
                      <div className="text-[10px] text-gray-400">/month</div>
                    </td>
                  </tr>
                  <tr>
                    <td>Best For</td>
                    <td className="highlight-column font-semibold text-xs leading-tight">Service Companies<br />Agencies, IT Teams</td>
                    <td className="text-gray-600 dark:text-gray-300 text-xs">Teams of all sizes</td>
                    <td className="text-gray-600 dark:text-gray-300 text-xs">Project-focused teams</td>
                    <td className="text-gray-600 dark:text-gray-300 text-xs">Marketing &amp; Sales Teams</td>
                    <td className="text-gray-600 dark:text-gray-300 text-xs">Businesses of all sizes</td>
                    <td className="text-gray-600 dark:text-gray-300 text-xs">Large Enterprises</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>


        <section className="py-12 px-6">
          <div className="max-w-7xl mx-auto bg-gray-50 dark:bg-[#111224] rounded-3xl p-10 flex flex-col md:flex-row items-center gap-10">
            <div className="flex-1 flex items-center gap-6">
              <div className="w-16 h-16 bg-white dark:bg-[#0A0B1A] rounded-2xl flex items-center justify-center shadow-sm">
                <svg className="w-10 h-10 text-purple-600" fill="currentColor" viewBox="0 0 20 20"><path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.242.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z"></path><path clipRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.514 1.31c.356.412.96.813 1.746 1.051V15a1 1 0 102 0v-.092c.735-.073 1.41-.367 1.901-.762.697-.559 1.099-1.34 1.099-2.146 0-.917-.503-1.611-1.137-2.033-.42-.28-.905-.48-1.413-.594V7.433c.27.09.488.21.637.33a1 1 0 101.264-1.557c-.456-.37-1.127-.677-1.901-.784V5z" fillRule="evenodd"></path></svg>
              </div>
              <div>
                <h3 className="text-2xl font-bold mb-1">Companies save up to 60% on software costs by switching to SynTask.</h3>
                <p className="text-gray-500 dark:text-gray-400">One platform. More productivity. Lower cost. Higher growth.</p>
              </div>
            </div>
            <div className="flex gap-12 text-center">
              <div>
                <div className="text-3xl font-extrabold text-purple-700">60%</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase mt-1">Cost Savings</div>
              </div>
              <div>
                <div className="text-3xl font-extrabold text-purple-700">3X</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase mt-1">More Productive</div>
              </div>
              <div>
                <div className="text-3xl font-extrabold text-purple-700">100%</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase mt-1">Work in One Place</div>
              </div>
            </div>
          </div>
        </section>


        <section className="py-16 px-6">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-3xl font-extrabold mb-12">Real Results from Real Businesses</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">

              <div className="bg-white dark:bg-[#0A0B1A] border border-gray-100 dark:border-slate-800 rounded-3xl p-8 shadow-sm h-full flex flex-col justify-between">
                <div>
                  <div className="flex items-center space-x-3 mb-8">
                    <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">TN</div>
                    <div className="font-bold text-xl">TechNovo <span className="text-xs font-normal text-gray-400 block tracking-widest">SOLUTIONS</span></div>
                  </div>
                  <p className="text-xl text-gray-700 dark:text-gray-200 font-medium leading-relaxed italic mb-8">
                    "We replaced 6 different tools with SynTask and saved over ₹18 Lakhs annually. Our team is 3X more productive now."
                  </p>
                </div>
                <div className="flex items-center space-x-4">
                  <img alt="Rahul Mehta" className="w-12 h-12 rounded-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBu4xVSl8F76oEFJEZHDkFe3wfd71fHj_4NJxMYc7udXu-HONdNM6PEKVTHgfBcr4lK0QuPi8kdbkeZUDpjBf_o_XhmR2YPJt5laqrLBdM4hz3CMSc8RcwiWYYTV5UB5TsMygFXI3udY61uV-xZCN9rmYgp2mYopS8UfVfCHm1VNWs3V74XGrTfpqn_2L7T4fadHBPomroWQVNdquunW45jzk1xWXp8HGotrM9ZpD8TrKKsn4YTthgVg9EiKV7OzMNRcoDw5Fstyg" />
                  <div>
                    <div className="font-bold">Rahul Mehta</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">CEO, TechNovo Solutions</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 h-full">
                <div className="bg-white dark:bg-[#0A0B1A] border border-gray-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm text-center">
                  <div className="w-10 h-10 bg-green-50 dark:bg-green-950/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                  </div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">₹18L+</div>
                  <div className="text-[10px] text-gray-400 font-bold uppercase">Annual Savings</div>
                </div>
                <div className="bg-white dark:bg-[#0A0B1A] border border-gray-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm text-center">
                  <div className="w-10 h-10 bg-orange-50 dark:bg-orange-950/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                  </div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">120+</div>
                  <div className="text-[10px] text-gray-400 font-bold uppercase leading-tight">Hours Saved<br />Every Month</div>
                </div>
                <div className="bg-white dark:bg-[#0A0B1A] border border-gray-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm text-center">
                  <div className="w-10 h-10 bg-purple-50 dark:bg-purple-950/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                  </div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">3X</div>
                  <div className="text-[10px] text-gray-400 font-bold uppercase leading-tight">Team Productivity<br />Improvement</div>
                </div>
                <div className="bg-white dark:bg-[#0A0B1A] border border-gray-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm text-center">
                  <div className="w-10 h-10 bg-blue-50 dark:bg-blue-950/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                  </div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">98%</div>
                  <div className="text-[10px] text-gray-400 font-bold uppercase leading-tight">Client Satisfaction<br />Achieved</div>
                </div>
              </div>
            </div>
          </div>
        </section>


        <section className="py-16 px-6 bg-gray-50 dark:bg-[#111224]">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16">

            <div data-purpose="faq-container">
              <h2 className="text-2xl font-extrabold mb-8">Frequently Compared. Clearly Answered.</h2>
              <div className="space-y-4">
                <div className="bg-white dark:bg-[#0A0B1A] border border-gray-100 dark:border-slate-800 rounded-xl p-5 flex items-center justify-between cursor-pointer">
                  <span className="font-bold text-gray-800 dark:text-white">Is SynTask really an all-in-one platform?</span>
                  <span className="text-gray-400">+</span>
                </div>
                <div className="bg-white dark:bg-[#0A0B1A] border border-gray-100 dark:border-slate-800 rounded-xl p-5 flex items-center justify-between cursor-pointer">
                  <span className="font-bold text-gray-800 dark:text-white">How is SynTask different from ClickUp or Monday.com?</span>
                  <span className="text-gray-400">+</span>
                </div>
                <div className="bg-white dark:bg-[#0A0B1A] border border-gray-100 dark:border-slate-800 rounded-xl p-5 flex items-center justify-between cursor-pointer">
                  <span className="font-bold text-gray-800 dark:text-white">Does SynTask offer better pricing than other tools?</span>
                  <span className="text-gray-400">+</span>
                </div>
                <div className="bg-white dark:bg-[#0A0B1A] border border-gray-100 dark:border-slate-800 rounded-xl p-5 flex items-center justify-between cursor-pointer">
                  <span className="font-bold text-gray-800 dark:text-white">Can I migrate my data from other platforms?</span>
                  <span className="text-gray-400">+</span>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-[#0A0B1A] rounded-3xl p-10 shadow-lg border border-gray-100 dark:border-slate-800 relative overflow-hidden flex flex-col justify-center">
              <div className="relative z-10">
                <h2 className="text-3xl font-extrabold mb-4">Still comparing?</h2>
                <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-sm">Book a personalized demo and see why 500+ businesses switched to SynTask.</p>
                <div className="flex gap-4">
                  <button className="bg-syntaskBlue text-white px-8 py-3 rounded-xl font-bold">Book a Demo</button>
                  <button className="bg-white dark:bg-[#0A0B1A] text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-slate-700 px-8 py-3 rounded-xl font-bold hover:bg-gray-50">Talk to Sales</button>
                </div>
              </div>

              <img alt="UI Element" className="absolute -bottom-10 -right-10 w-64 opacity-50" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAhAGinA-IuvW54U2w4KDnZS3WeaKmnWckeDteaJO9ik-AzPahek5VijvLPwUkTpy_mCOz3rwS6sSNd3T7Kn7Zjy7pNqBgYpNjpyMb5Fi-H45wsNI1t7y_KSCjKxP3WHoXao2IFpxTeY-WzNZFjowi_EVspPL-MPW8nZ3Y8WwJ5D7A_Pcu0_KQ1VC3XRMiMHhnRuCL9IdI-xcCdWTIbqrDrxYfhNwlItobQHivCI6pcWC4VrR5rVTDkeVAk9qNmTbxQfhMPO837hg" />
            </div>
          </div>
        </section>


        <section className="py-16 px-6">
          <div className="max-w-7xl mx-auto bg-syntaskBlue rounded-[2.5rem] p-10 md:p-16 flex flex-col items-center text-center text-white relative overflow-hidden">
            <div className="absolute left-10 top-1/2 -translate-y-1/2 opacity-20 hidden lg:block">
              <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center">
                <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
              </div>
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold mb-6">Stop Switching. Start Scaling.</h2>
            <p className="text-gray-400 text-lg mb-10 max-w-2xl">Join 500+ service companies using SynTask to automate operations, deliver better and grow faster.</p>
            <div className="flex flex-wrap justify-center gap-8 mb-10 text-sm font-medium text-gray-300">
              <div className="flex items-center gap-2"><span className="text-green-500">✓</span> 14 Days Free Trial</div>
              <div className="flex items-center gap-2"><span className="text-green-500">✓</span> No Credit Card Required</div>
              <div className="flex items-center gap-2"><span className="text-green-500">✓</span> Cancel Anytime</div>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <button className="bg-syntaskOrange text-white px-10 py-4 rounded-xl font-bold text-lg hover:bg-opacity-90 transition flex items-center gap-2">Start Free Trial →</button>
              <button className="bg-transparent border border-white border-opacity-20 px-10 py-4 rounded-xl font-bold text-lg hover:bg-white hover:bg-opacity-10 transition flex items-center gap-2">Book a Live Demo <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg></button>
            </div>
          </div>
        </section>






        <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent dark:via-slate-800 my-4"></div>




        <main>

          <section className="pt-20 pb-24 overflow-hidden" data-purpose="hero-section">
            <div className="container mx-auto px-6 flex flex-col lg:flex-row items-center gap-12">
              <div className="lg:w-5/12">
                <span className="inline-block px-4 py-1.5 rounded-full bg-orange-50 dark:bg-orange-950/20 text-brand-orange text-xs font-bold uppercase tracking-widest mb-6">AI Workforce</span>
                <h1 className="text-6xl font-bold leading-tight mb-6">Meet Your AI Workforce. They Work <span className="text-brand-orange">24/7.</span> You <span className="text-brand-orange">Grow.</span></h1>
                <p className="text-gray-500 dark:text-gray-400 text-lg mb-10 max-w-lg leading-relaxed">SynTask's AI employees handle the work that slows you down, so your team can focus on what truly matters.</p>
                <ul className="space-y-4 mb-10">
                  <li className="flex items-center space-x-3 text-gray-700 dark:text-gray-200 font-medium">
                    <span className="w-5 h-5 bg-brand-orange rounded-full flex items-center justify-center text-white text-[10px]">✓</span>
                    <span>AI employees for every department</span>
                  </li>
                  <li className="flex items-center space-x-3 text-gray-700 dark:text-gray-200 font-medium">
                    <span className="w-5 h-5 bg-brand-orange rounded-full flex items-center justify-center text-white text-[10px]">✓</span>
                    <span>Trained on best practices &amp; your data</span>
                  </li>
                  <li className="flex items-center space-x-3 text-gray-700 dark:text-gray-200 font-medium">
                    <span className="w-5 h-5 bg-brand-orange rounded-full flex items-center justify-center text-white text-[10px]">✓</span>
                    <span>Always-on. Always-learning. Always-delivering.</span>
                  </li>
                </ul>
                <div className="flex items-center space-x-4">
                  <button className="bg-brand-orange text-white px-8 py-4 rounded-lg font-bold text-lg shadow-lg hover:bg-orange-600 transition-colors">Start Free Trial</button>
                  <button className="border border-gray-300 px-8 py-4 rounded-lg font-bold text-lg flex items-center hover:bg-gray-50 transition-colors">
                    Book a Demo <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                  </button>
                </div>
              </div>
              <div className="lg:w-7/12 relative">

                <div className="relative z-10 rounded-2xl shadow-2xl bg-white dark:bg-[#0A0B1A] p-2 border border-gray-100 dark:border-slate-800 overflow-hidden">
                  <img alt="Dashboard Interface" className="w-full rounded-xl object-top object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBkecMTbApdKXQET8FI1jeHvmLhzwsf1_As4w6SUchUXoY9HA7oFdLRxBH9qd-mhGhTmljKe72UTmxy28XoWT-_GsADxAmMKxaJE-tT6FrpvArPTzB8Z_VVmF-1M_-P72ZPCW6T_TXgfLHTTGthdmvKni1srdlOAPrW6GXZUz1T0IowgOqsGH52QLaiNTHX3MUAmvkQhYtylWgXGcsKpUTFse_PTutD_ZZa2nFUfOmkkcBZMObNer3VoC3iCJGkPGdsZcUncEQHWA" style={{ height: "600px" }} />
                </div>

                <div className="absolute -top-12 -right-12 w-64 h-64 bg-brand-orange opacity-5 rounded-full -z-10"></div>
                <div className="absolute -bottom-8 -left-8 w-40 h-40 bg-gray-200 opacity-20 rounded-full -z-10"></div>
              </div>
            </div>
          </section>


          <section className="py-24 bg-gray-50/50 dark:bg-[#111224]/50" data-purpose="employees-directory">
            <div className="container mx-auto px-6 text-center">
              <span className="inline-block px-4 py-1.5 rounded-full bg-orange-50 dark:bg-orange-950/20 text-brand-orange text-xs font-bold uppercase tracking-widest mb-4">AI Employees</span>
              <h2 className="text-4xl font-bold mb-4">An AI Employee for Every Function</h2>
              <p className="text-gray-500 dark:text-gray-400 mb-16 max-w-2xl mx-auto">Delegate repetitive work, automate complex processes, and achieve more with your AI team.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">

                <div className="bg-white dark:bg-[#0A0B1A] rounded-2xl p-6 border border-gray-100 dark:border-slate-800 text-left card-shadow hover:-translate-y-1 transition-transform">
                  <div className="relative mb-6">
                    <div className="bg-orange-100 rounded-xl aspect-[4/5] overflow-hidden">
                      <img alt="Sales Manager" className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuA5pv7DiQ-tgaL8mj4C69zVAOWhTEutxsHR8LyS06zMoJoAzqaTppYhIS5yolly7VlkOyk3SOdSpLcGWRHyBkflhFt0U_2aBP6pXx500tMAX5wonUuh33noVFv5fFqMsP8bkadgafK10fuYUxzjT7-KHITj4MKr8eXGHHezbyFwhdq-nOdeaFZ-dNl-67icUpYy9kX8JK-ZFMRXAcH-FjkjSnPDyvBlU2fLSY__SA6Rksv2Z20FfLOVjbNqVBCK66fS4wT4QDxQMA" />
                    </div>
                    <div className="absolute bottom-2 left-2 p-1.5 bg-brand-orange rounded-lg text-white">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                    </div>
                  </div>
                  <h3 className="font-bold text-lg mb-3">AI Sales Manager</h3>
                  <ul className="text-xs text-gray-500 dark:text-gray-400 space-y-2 mb-6">
                    <li>• Lead qualification</li>
                    <li>• Follow-ups &amp; nurturing</li>
                    <li>• Proposals &amp; quotations</li>
                    <li>• Deal tracking &amp; insights</li>
                  </ul>
                  <a className="text-brand-orange text-sm font-bold flex items-center" href="#">Explore <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17 8l4 4m0 0l-4 4m4-4H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg></a>
                </div>

                <div className="bg-white dark:bg-[#0A0B1A] rounded-2xl p-6 border border-gray-100 dark:border-slate-800 text-left card-shadow hover:-translate-y-1 transition-transform">
                  <div className="relative mb-6">
                    <div className="bg-purple-100 rounded-xl aspect-[4/5] overflow-hidden">
                      <img alt="HR Manager" className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDj4UU-qZ3_svdL_P5vAQs7nsctS36ogg0fuXjUiu4Xfy0PaejUw2G_I8QDtqGLIO1L-Yo95duD9FbQ1DKohal7DqA0aucFGWF_hmH6MomX5TlaEVbRmUHd8hKSeuP6t4M37SS-Uvq1K_tOPSVcoUtveWjdcuQEJ8ArY3enqHJmO1TNAevFWZW8sfMBoI0zq40JvI4gBg4tBq0ZdiSn8KPSgo_Cph9GSPaTr78TMbign3_RSAJ_VgM60-1eZ8xft_pNhPCFRT_jQg" />
                    </div>
                    <div className="absolute bottom-2 left-2 p-1.5 bg-purple-600 rounded-lg text-white">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                    </div>
                  </div>
                  <h3 className="font-bold text-lg mb-3">AI HR Manager</h3>
                  <ul className="text-xs text-gray-500 dark:text-gray-400 space-y-2 mb-6">
                    <li>• Resume screening</li>
                    <li>• Interview scheduling</li>
                    <li>• JD &amp; offer letters</li>
                    <li>• Employee support</li>
                  </ul>
                  <a className="text-purple-600 text-sm font-bold flex items-center" href="#">Explore <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17 8l4 4m0 0l-4 4m4-4H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg></a>
                </div>

                <div className="bg-white dark:bg-[#0A0B1A] rounded-2xl p-6 border border-gray-100 dark:border-slate-800 text-left card-shadow hover:-translate-y-1 transition-transform">
                  <div className="relative mb-6">
                    <div className="bg-blue-100 rounded-xl aspect-[4/5] overflow-hidden">
                      <img alt="Project Manager" className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAVt5SLXlV-OsnqpZXoAdssF2Zzlr3rzCWzYXqNC6edMuZjskUyWcBN6iEH7FvhsY7Ib-grXGokkGzV-S25AaTTBs6I7bqHygPR_vy4668T9fLzakdePqQyHAf5oHaIVjBc8UoyxIENu4aXGIg-T2UZDJdWBRGcdjFQkPFZJVosoffD2rKpVJS03Ne1E3uGXPvbrHQNR2LZmOU1j_xirvt8bFECDJuFbsTgnRgtS1Bx73i7VZgGDlQHkJ_BVsQCdGAkBPF57paAIA" />
                    </div>
                    <div className="absolute bottom-2 left-2 p-1.5 bg-blue-600 rounded-lg text-white">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                    </div>
                  </div>
                  <h3 className="font-bold text-lg mb-3">AI Project Manager</h3>
                  <ul className="text-xs text-gray-500 dark:text-gray-400 space-y-2 mb-6">
                    <li>• Task planning</li>
                    <li>• Progress tracking</li>
                    <li>• Risk &amp; issue detection</li>
                    <li>• Timeline management</li>
                  </ul>
                  <a className="text-blue-600 text-sm font-bold flex items-center" href="#">Explore <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17 8l4 4m0 0l-4 4m4-4H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg></a>
                </div>

                <div className="bg-white dark:bg-[#0A0B1A] rounded-2xl p-6 border border-gray-100 dark:border-slate-800 text-left card-shadow hover:-translate-y-1 transition-transform">
                  <div className="relative mb-6">
                    <div className="bg-emerald-100 rounded-xl aspect-[4/5] overflow-hidden">
                      <img alt="Marketing Assistant" className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBvCNkmyRqMurzi2zKzQ33ntOQKT0grN-hBGk0x-jNaOdLFPYeRi-seak-WyFA-3Flf7Fn4oVzNdsg_QpKY8-m67GiSUsLTY1fNimZorsJC3hOjNS8yvPS980-bA7Zo9z7HTqi0kZIB90_q1JX_-rlZf-lfgFHfFQLrrrN5zeJL_4AoqtH1gUqA2EMX8PWRe2XDhx5rQ8PA8x1mJvGfS-CCrfuqfy9my7gpOruCwmdHqJu6mW92E8eBwhprCAMgq4cTk2MIceeN7w" />
                    </div>
                    <div className="absolute bottom-2 left-2 p-1.5 bg-emerald-600 rounded-lg text-white">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                    </div>
                  </div>
                  <h3 className="font-bold text-lg mb-3">AI Marketing Assistant</h3>
                  <ul className="text-xs text-gray-500 dark:text-gray-400 space-y-2 mb-6">
                    <li>• Content creation</li>
                    <li>• Social media posts</li>
                    <li>• Ad copy &amp; creatives</li>
                    <li>• Campaign ideas</li>
                  </ul>
                  <a className="text-emerald-600 text-sm font-bold flex items-center" href="#">Explore <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17 8l4 4m0 0l-4 4m4-4H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg></a>
                </div>

                <div className="bg-white dark:bg-[#0A0B1A] rounded-2xl p-6 border border-gray-100 dark:border-slate-800 text-left card-shadow hover:-translate-y-1 transition-transform">
                  <div className="relative mb-6">
                    <div className="bg-orange-50 dark:bg-orange-950/20 rounded-xl aspect-[4/5] overflow-hidden">
                      <img alt="Operations Manager" className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBlY1xRVYrSj7KKxAXyedRzHplmfUImIxi-r3LwB7cgt8V3Y9gGdfei6x6dEWK8BMardQF0uZ0qFImGzTa9TeQ6F9-Z0L-XYKezUkFzVjYAOADTLDzTn4QNaFHFmU4myYTkdtwkUMP_UOx8uNzC_Lroh39WJrltoox1mfCOyavoOJ50spRcZTvJKXMADoK3wl9TWli-Aq0QUgnIpuBeg8FRJ6om89P7aj-MjGN8fcEeQg6qpTyAj9ZozShXJpv7mbDSsxp5oKqkkw" />
                    </div>
                    <div className="absolute bottom-2 left-2 p-1.5 bg-brand-orange rounded-lg text-white">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                    </div>
                  </div>
                  <h3 className="font-bold text-lg mb-3">AI Operations Manager</h3>
                  <ul className="text-xs text-gray-500 dark:text-gray-400 space-y-2 mb-6">
                    <li>• Workflow optimization</li>
                    <li>• Process automation</li>
                    <li>• Bottleneck detection</li>
                    <li>• Performance reports</li>
                  </ul>
                  <a className="text-brand-orange text-sm font-bold flex items-center" href="#">Explore <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17 8l4 4m0 0l-4 4m4-4H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg></a>
                </div>

                <div className="bg-white dark:bg-[#0A0B1A] rounded-2xl p-6 border border-gray-100 dark:border-slate-800 text-left card-shadow hover:-translate-y-1 transition-transform">
                  <div className="relative mb-6">
                    <div className="bg-blue-50 dark:bg-blue-950/20 rounded-xl aspect-[4/5] overflow-hidden">
                      <img alt="Business Analyst" className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAThp4ZQFyQZE6ZnMIOgo_Ui5mTMpObhS7GmQ0G6TnBHr-9B4SbnoMvZ5a4ieos3BtqLrYGepUXMPYl7qFKmUruHPfLhao8Jok6XfNAENE-_RZNoEvtxtKQMnTzyLF-zEMltE68eTRfhgBXG4AQtOEpMrx2OgSUwFkgnhZsyEM_xQZ1zXB7IIX1ZE8g7jElQU6ROjsizyvdnMFQxVBiwfQ_zdnxjoNxyOv2-XdsBmSKZtgVozD0Wu64Y171WeTwcddW7OApA-9zfA" />
                    </div>
                    <div className="absolute bottom-2 left-2 p-1.5 bg-blue-700 rounded-lg text-white">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                    </div>
                  </div>
                  <h3 className="font-bold text-lg mb-3">AI Business Analyst</h3>
                  <ul className="text-xs text-gray-500 dark:text-gray-400 space-y-2 mb-6">
                    <li>• Data analysis</li>
                    <li>• Business insights</li>
                    <li>• Reports &amp; dashboards</li>
                    <li>• Forecasting &amp; trends</li>
                  </ul>
                  <a className="text-blue-700 text-sm font-bold flex items-center" href="#">Explore <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17 8l4 4m0 0l-4 4m4-4H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg></a>
                </div>
              </div>
            </div>
          </section>


          <section className="py-24" data-purpose="how-it-works">
            <div className="container mx-auto px-6 text-center">
              <span className="inline-block px-4 py-1.5 rounded-full bg-orange-50 dark:bg-orange-950/20 text-brand-orange text-xs font-bold uppercase tracking-widest mb-4">How It Works</span>
              <h2 className="text-4xl font-bold mb-16">Onboard. Train. Delegate. Scale.</h2>
              <div className="relative max-w-5xl mx-auto">

                <div className="absolute top-1/4 left-0 right-0 h-0.5 border-t-2 border-dashed border-gray-200 dark:border-slate-700 -z-10 hidden md:block"></div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-12">

                  <div className="flex flex-col items-center">
                    <div className="w-20 h-20 bg-purple-50 dark:bg-purple-950/20 rounded-full flex items-center justify-center mb-6 shadow-sm">
                      <svg className="w-10 h-10 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                    </div>
                    <h4 className="font-bold text-lg mb-3">1. Choose Your AI Employee</h4>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">Pick the AI role you want to add to your team.</p>
                  </div>

                  <div className="flex flex-col items-center">
                    <div className="w-20 h-20 bg-blue-50 dark:bg-blue-950/20 rounded-full flex items-center justify-center mb-6 shadow-sm">
                      <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                    </div>
                    <h4 className="font-bold text-lg mb-3">2. Train with Your Data</h4>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">Our AI learns your processes, tools and company knowledge.</p>
                  </div>

                  <div className="flex flex-col items-center">
                    <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-6 shadow-sm">
                      <svg className="w-10 h-10 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                    </div>
                    <h4 className="font-bold text-lg mb-3">3. Delegate &amp; Automate</h4>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">Assign tasks and watch your AI employee get to work.</p>
                  </div>

                  <div className="flex flex-col items-center">
                    <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mb-6 shadow-sm">
                      <svg className="w-10 h-10 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                    </div>
                    <h4 className="font-bold text-lg mb-3">4. Track &amp; Improve</h4>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">Monitor performance, gain insights and scale your AI team.</p>
                  </div>
                </div>
              </div>
            </div>
          </section>


          <section className="py-12 px-6" data-purpose="impact-stats">
            <div className="container mx-auto bg-brand-dark rounded-3xl p-12 text-white relative overflow-hidden dotted-bg">
              <div className="relative z-10 grid grid-cols-1 md:grid-cols-5 gap-12 items-center">
                <div className="md:col-span-1">
                  <h3 className="text-2xl font-bold mb-2">The Power of an AI Workforce</h3>
                  <p className="text-gray-400 text-sm">Real impact for modern service businesses</p>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="p-3 bg-white/10 rounded-xl">
                    <svg className="w-6 h-6 text-brand-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                  </div>
                  <div>
                    <p className="text-3xl font-bold" data-target="10" data-suffix="M+">10M+</p>
                    <p className="text-gray-400 text-xs uppercase tracking-wider">Tasks Automated</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="p-3 bg-white/10 rounded-xl">
                    <svg className="w-6 h-6 text-brand-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                  </div>
                  <div>
                    <p className="text-3xl font-bold" data-target="1" data-suffix="M+">1M+</p>
                    <p className="text-gray-400 text-xs uppercase tracking-wider">Hours Saved</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="p-3 bg-white/10 rounded-xl">
                    <svg className="w-6 h-6 text-brand-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                  </div>
                  <div>
                    <p className="text-3xl font-bold" data-prefix="₹" data-target="200" data-suffix="Cr+">₹200Cr+</p>
                    <p className="text-gray-400 text-xs uppercase tracking-wider">Revenue Impacted</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="p-3 bg-white/10 rounded-xl">
                    <svg className="w-6 h-6 text-brand-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                  </div>
                  <div>
                    <p className="text-3xl font-bold" data-target="500" data-suffix="+">500+</p>
                    <p className="text-gray-400 text-xs uppercase tracking-wider">Businesses Trust Us</p>
                  </div>
                </div>
              </div>
            </div>
          </section>


          <section className="py-24 bg-gray-50/30 dark:bg-[#111224]/30" data-purpose="testimonials">
            <div className="container mx-auto px-6 text-center">
              <span className="inline-block px-4 py-1.5 rounded-full bg-orange-50 dark:bg-orange-950/20 text-brand-orange text-xs font-bold uppercase tracking-widest mb-4">Loved by Leaders</span>
              <h2 className="text-4xl font-bold mb-16">What Leaders Say About Our AI Workforce</h2>
              <div className="relative flex items-center justify-center">

                <button className="absolute left-0 p-3 bg-white dark:bg-[#0A0B1A] rounded-full shadow-md border border-gray-100 dark:border-slate-800 hover:bg-gray-50 z-10">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                </button>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 px-12">

                  <div className="bg-white dark:bg-[#0A0B1A] p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 text-left">
                    <div className="text-brand-orange text-3xl mb-4">“</div>
                    <p className="text-gray-600 dark:text-gray-300 mb-8 leading-relaxed italic">Our AI Sales Manager increased our qualified leads by 3X. It never sleeps, never forgets, and never misses a follow-up.</p>
                    <div className="flex items-center space-x-4">
                      <img alt="Rohit Sharma" className="w-12 h-12 rounded-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBbwI1V9NX0CeQSFr2dhprg6Rj3yQ-06sI6adHCC62BwDKp9QlFPZK6dMxp-rzemHxnRKqdA2QTRuU0BJ4DX5-dTdcKjA5JnAnZqZwodgCKQF8Kky1ZwE424g5NRM9ER3WPKwtbLWQAtc2ds8cWyQn0_mmZzS2W7PlpgC05ydMd8bupKEwqn-aR0SjjzbjakKsohjM7B5sqWDmuv6JQwEKcTTv1OpAAW21mWE4NxJ8aZtMZaX1M7ZCQKg9ympEiFx0Yy9DCuwgihA" />
                      <div>
                        <h5 className="font-bold text-sm">Rohit Sharma</h5>
                        <p className="text-gray-400 text-xs">CEO, GrowthHackers Marketing</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-[#0A0B1A] p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 text-left">
                    <div className="text-brand-orange text-3xl mb-4">“</div>
                    <p className="text-gray-600 dark:text-gray-300 mb-8 leading-relaxed italic">AI HR Manager reduced our hiring time by 60%. From screening to scheduling, everything is now effortless.</p>
                    <div className="flex items-center space-x-4">
                      <img alt="Neha Kapoor" className="w-12 h-12 rounded-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAdtK_03oU5nZgAZEWuZbgsswOV8uYdHMvUwiJ92joEUtxUzpu_reMt_wb2lsu58THM-shlllwlD7TvJcpr9jspUlPEnLvOBgcx7whMkH6I4XaE5giHfIDPc_ZUPMTOWckTo0WWC_ft7kEo97GTY9QSywDArqf_0rZ__mJFFOOhaOQoixpza32EbNr7E4UQl3Lyw_LAiNAj6ZJ-VBkby_x1qKeU_5nL61_N9bu6cLocidsx05gzu-MFZ4jhdVbUcub-g9VR8RU46g" />
                      <div>
                        <h5 className="font-bold text-sm">Neha Kapoor</h5>
                        <p className="text-gray-400 text-xs">Head of HR, TechNovate</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-[#0A0B1A] p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 text-left">
                    <div className="text-brand-orange text-3xl mb-4">“</div>
                    <p className="text-gray-600 dark:text-gray-300 mb-8 leading-relaxed italic">AI Project Manager keeps our projects on track, risks under control, and clients always happy. It's like having a co-pilot.</p>
                    <div className="flex items-center space-x-4">
                      <img alt="Arjun Mehta" className="w-12 h-12 rounded-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCajN48LJRetnJiJjtnxa6HYXiKyGzsTRDzotOR1c3-9ZOLNeQipciNr44hC1pWaUQDXH4rKgD9qIDd_3lQdN9xwgeiStq55k84QD5ZbwxWVPwfMQFWuLLbPZLJjFXCf_ZhvB2u6AS9auxLaqFBTkuFrQkA-xfJIgsAotJxB5f2Wj5Zkx5NIBwhWqLMUIENtBJfDz5JjYVpOrl6_WfPD6_XANU_cxAKFQaV5X-dTAdxXdkZEPkS7EG7Ixq126UYdlzE8KUDUxLFzA" />
                      <div>
                        <h5 className="font-bold text-sm">Arjun Mehta</h5>
                        <p className="text-gray-400 text-xs">Delivery Head, PixelCraft</p>
                      </div>
                    </div>
                  </div>
                </div>

                <button className="absolute right-0 p-3 bg-white dark:bg-[#0A0B1A] rounded-full shadow-md border border-gray-100 dark:border-slate-800 hover:bg-gray-50 z-10">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                </button>
              </div>

              <div className="flex justify-center space-x-2 mt-12">
                <div className="w-2 h-2 rounded-full bg-gray-200"></div>
                <div className="w-2 h-2 rounded-full bg-brand-orange"></div>
                <div className="w-2 h-2 rounded-full bg-gray-200"></div>
                <div className="w-2 h-2 rounded-full bg-gray-200"></div>
              </div>
            </div>
          </section>


          <section className="py-24" data-purpose="cta-banner">
            <div className="container mx-auto px-6">
              <div className="bg-blue-50 dark:bg-blue-950/20 rounded-3xl p-12 flex flex-col lg:flex-row items-center justify-between">
                <div className="flex items-center space-x-8 mb-8 lg:mb-0">
                  <div className="hidden md:block">
                    <img alt="SynTask Robot" className="w-32" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDtgpgDV4ZKAmTa436bYvoECZfEG3se8hvQh_BToHvNE8p6Q8M5DRAkuOW6lNB5Kfw0LrjNy-Hy3Tpm2NqT7Xo7JC3h_SnlXQ8qKqNeGL0WjVnUeUZwri5SlmVx5NOM3Whcz_I-n5o3lTVtED8QTJOzv2OmdvQoN3p3a3cgKW7ApxHrh9OL5VVqxPGZxFTQe6DDr-EVs9ZnB-aBudQIGhc8fSJdlJBinhYii2R37bu7szdIOdcPhHQuFd2QUcAwy8UykoZkaNVlbA" />
                  </div>
                  <div>
                    <h2 className="text-4xl font-bold mb-4">Build Your AI Workforce Today</h2>
                    <p className="text-gray-600 dark:text-gray-300 mb-6">Start with one AI employee. Scale to an entire AI-powered organization.</p>
                    <div className="grid grid-cols-2 gap-4 text-xs font-bold text-gray-700 dark:text-gray-200">
                      <span className="flex items-center"><span className="w-4 h-4 bg-emerald-500 rounded-full mr-2 text-white flex items-center justify-center text-[10px]">✓</span> 14 Days Free Trial</span>
                      <span className="flex items-center"><span className="w-4 h-4 bg-emerald-500 rounded-full mr-2 text-white flex items-center justify-center text-[10px]">✓</span> No Credit Card Required</span>
                      <span className="flex items-center"><span className="w-4 h-4 bg-emerald-500 rounded-full mr-2 text-white flex items-center justify-center text-[10px]">✓</span> Cancel Anytime</span>
                      <span className="flex items-center"><span className="w-4 h-4 bg-emerald-500 rounded-full mr-2 text-white flex items-center justify-center text-[10px]">✓</span> Full Onboarding Support</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
                  <button className="bg-brand-orange text-white px-8 py-4 rounded-lg font-bold text-lg shadow-lg hover:bg-orange-600 flex items-center justify-center">Start Free Trial <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg></button>
                  <button className="bg-white dark:bg-[#0A0B1A] border border-gray-200 dark:border-slate-700 text-brand-dark px-8 py-4 rounded-lg font-bold text-lg shadow-sm hover:bg-gray-50 flex items-center justify-center">Book a Demo <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg></button>
                </div>
              </div>
            </div>
          </section>

        </main>





        <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent dark:via-slate-800 my-4"></div>





        <section className="hero-gradient pt-16 pb-20 relative overflow-hidden" data-purpose="hero-area">
          <div className="max-w-7xl mx-auto px-4 grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-orange-50 dark:bg-orange-950/20 text-syn-orange text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-6">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" fillRule="evenodd"></path></svg>
                Resources that help you grow
              </div>
              <h1 className="text-5xl md:text-6xl font-extrabold leading-tight mb-6">
                Learn. Implement. <span className="text-syn-orange">Grow.</span><br />Everything for Service Companies.
              </h1>
              <p className="text-lg text-gray-600 dark:text-gray-300 mb-10 max-w-lg leading-relaxed">
                Guides, templates, playbooks and insights to help you streamline operations, improve productivity and scale your business with SynTask.
              </p>

              <div className="relative max-w-xl group">
                <input className="w-full h-14 pl-6 pr-32 rounded-xl border-gray-200 dark:border-slate-700 shadow-sm focus:ring-syn-orange focus:border-syn-orange transition-all" placeholder="What do you want to learn today?" type="text" />
                <button className="absolute right-2 top-2 h-10 px-6 bg-gray-900 text-white rounded-lg font-medium flex items-center gap-2 hover:bg-black transition">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                  Search
                </button>
              </div>
            </div>

            <div className="relative hidden md:block" data-purpose="hero-graphics">
              <div className="relative z-10 bg-white dark:bg-[#0A0B1A] p-4 rounded-xl shadow-2xl border border-gray-100 dark:border-slate-800 transform -rotate-2">
                <img alt="Platform Interface" className="rounded-lg w-full h-auto object-cover max-h-[400px]" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDIXvU-jbnEpY6VuKDGl2kVkmEnJUUE3pwD5CTMEBFn0jA6RncFGJf1Ycl5peR5hAUDE72RPLYW3MAg421n3XEWoa7ZaR4B3QdNO8EtV7rGLhIBhzo1r4xFOGELXTXSjY0t7ESlAkHkSGn5Q-c2LG5UDReUuGIX8eOVulf4VKlVk8Fwkos5_PiC6YhAEpZtXlr8pWvyYeUa9SnDw4ircFNNht0gUNBcR6CUYQiYKEIK8rgXlIPjqi6h-Rhv1EcVEXvA81_KjXrO2g" />
              </div>

              <div className="absolute -right-10 top-10 z-20 bg-white dark:bg-[#0A0B1A] p-4 rounded-xl shadow-xl border border-gray-50 flex items-center gap-4 w-48 transform translate-x-4">
                <div className="w-10 h-10 bg-green-50 dark:bg-green-950/20 rounded-lg flex items-center justify-center text-green-600 dark:text-green-400">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.168.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                </div>
                <span className="font-bold text-xs">Guides</span>
              </div>
              <div className="absolute -right-4 top-28 z-20 bg-white dark:bg-[#0A0B1A] p-4 rounded-xl shadow-xl border border-gray-50 flex items-center gap-4 w-48">
                <div className="w-10 h-10 bg-blue-50 dark:bg-blue-950/20 rounded-lg flex items-center justify-center text-blue-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                </div>
                <span className="font-bold text-xs">Playbooks</span>
              </div>
            </div>
          </div>
        </section>


        <section className="max-w-7xl mx-auto px-4 -mt-12 relative z-30" data-purpose="resource-categories">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">

            <div className="bg-white dark:bg-[#0A0B1A] border border-gray-100 dark:border-slate-800 rounded-xl p-6 shadow-sm hover:shadow-md transition cursor-pointer text-center group">
              <div className="w-10 h-10 bg-orange-50 dark:bg-orange-950/20 rounded-lg flex items-center justify-center text-syn-orange mx-auto mb-4 group-hover:bg-syn-orange group-hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
              </div>
              <p className="text-xs font-bold mb-1">All Resources</p>
              <p className="text-[10px] text-syn-orange font-bold uppercase">120+</p>
            </div>

            <div className="bg-white dark:bg-[#0A0B1A] border border-gray-100 dark:border-slate-800 rounded-xl p-6 shadow-sm hover:shadow-md transition cursor-pointer text-center group">
              <div className="w-10 h-10 bg-blue-50 dark:bg-blue-950/20 rounded-lg flex items-center justify-center text-blue-600 mx-auto mb-4 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.168.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
              </div>
              <p className="text-xs font-bold mb-1">Guides &amp; Ebooks</p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase">24</p>
            </div>

            <div className="bg-white dark:bg-[#0A0B1A] border border-gray-100 dark:border-slate-800 rounded-xl p-6 shadow-sm hover:shadow-md transition cursor-pointer text-center group">
              <div className="w-10 h-10 bg-green-50 dark:bg-green-950/20 rounded-lg flex items-center justify-center text-green-600 dark:text-green-400 mx-auto mb-4 group-hover:bg-green-600 group-hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
              </div>
              <p className="text-xs font-bold mb-1">Templates</p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase">18</p>
            </div>

            <div className="bg-white dark:bg-[#0A0B1A] border border-gray-100 dark:border-slate-800 rounded-xl p-6 shadow-sm hover:shadow-md transition cursor-pointer text-center group">
              <div className="w-10 h-10 bg-blue-50 dark:bg-blue-950/20 rounded-lg flex items-center justify-center text-blue-800 mx-auto mb-4 group-hover:bg-blue-800 group-hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
              </div>
              <p className="text-xs font-bold mb-1">Playbooks</p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase">16</p>
            </div>

            <div className="bg-white dark:bg-[#0A0B1A] border border-gray-100 dark:border-slate-800 rounded-xl p-6 shadow-sm hover:shadow-md transition cursor-pointer text-center group">
              <div className="w-10 h-10 bg-purple-50 dark:bg-purple-950/20 rounded-lg flex items-center justify-center text-purple-600 mx-auto mb-4 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
              </div>
              <p className="text-xs font-bold mb-1">Case Studies</p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase">20</p>
            </div>

            <div className="bg-white dark:bg-[#0A0B1A] border border-gray-100 dark:border-slate-800 rounded-xl p-6 shadow-sm hover:shadow-md transition cursor-pointer text-center group">
              <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center text-red-500 mx-auto mb-4 group-hover:bg-red-500 group-hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
              </div>
              <p className="text-xs font-bold mb-1">Webinars</p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase">12</p>
            </div>

            <div className="bg-white dark:bg-[#0A0B1A] border border-gray-100 dark:border-slate-800 rounded-xl p-6 shadow-sm hover:shadow-md transition cursor-pointer text-center group">
              <div className="w-10 h-10 bg-cyan-50 rounded-lg flex items-center justify-center text-cyan-600 mx-auto mb-4 group-hover:bg-cyan-600 group-hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
              </div>
              <p className="text-xs font-bold mb-1">Product Updates</p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold uppercase">10</p>
            </div>
          </div>
        </section>


        <section className="max-w-7xl mx-auto px-4 py-24" data-purpose="featured-articles">
          <div className="flex items-center justify-between mb-12">
            <h2 className="text-3xl font-bold">Featured Articles</h2>
            <a className="text-syn-orange font-bold text-sm flex items-center gap-2 hover:underline" href="#">View all articles <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg></a>
          </div>
          <div className="grid md:grid-cols-3 gap-8">

            <article className="flex flex-col group cursor-pointer">
              <div className="relative mb-6 overflow-hidden rounded-2xl h-64">
                <img alt="Article Thumbnail" className="w-full h-full object-cover transform group-hover:scale-105 transition duration-500" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCP1uR7z2NJPkJsYKO_ddgNuhuWDj5Gi2ggiGv2HMU3U0aLMfL_9Idrectar3-NjUJ4j_uLbOiCrNz_0_hjb7vX74oV-xuO0ktYhHhMR4mOB_5oa2ougOrF_Txt0OwZNiRFlwiX8EzYYpEBSP8fLispt1OhNYqkcHB-xqTn5X7iQ3JtRVSiwlnJSbC9Djnt1FMBcayWVBiv1gVVI2X2Qyh2yFCNZpSVB2ydjV72RUqML3wKC-YiJ7OkfSxali9wZtq7-cyK1V6R0A" />
                <span className="absolute top-4 left-4 bg-syn-orange text-white text-[10px] font-bold uppercase px-2 py-1 rounded">Featured</span>
                <span className="absolute bottom-4 left-4 bg-black/40 backdrop-blur-md text-white text-[10px] font-bold uppercase px-2 py-1 rounded">Operations</span>
              </div>
              <h3 className="text-xl font-bold mb-3 group-hover:text-syn-orange transition">How to Run Your Agency Like a Well-Oiled Machine</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-6 line-clamp-2">Discover the exact framework top agencies use to streamline operations and deliver projects on time, every time.</p>
              <div className="mt-auto flex items-center justify-between border-t border-gray-100 dark:border-slate-800 pt-4">
                <div className="flex items-center gap-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  <span>May 20, 2024</span>
                  <span>8 min read</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-gray-200 rounded-full"></div>
                  <span className="text-xs font-bold">By Ankit Sen</span>
                </div>
              </div>
            </article>

            <article className="flex flex-col group cursor-pointer">
              <div className="relative mb-6 overflow-hidden rounded-2xl h-64">
                <img alt="Article Thumbnail" className="w-full h-full object-cover transform group-hover:scale-105 transition duration-500" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDxAPgvZAvEn1frTQ9Fr3F1AgnnSGw1bxJ--w844f4V3Uv8rVnzrdGWP3Ae1QEVdKpwOxAJ1pkqiHmva741aK6dPbBAt2Ko_IaMixPbiYikdejhL0j0vh-UzeAsFgdMuDbOYPTuXArD-ujK_Wk625q4UN4EW3UEheyAw0olKqXvSS5g09dHqWRwUyTCqsPPsUNqyNBKaQUKG_KGS5mnxXyEMA8K89cL32FPU8cSSwJJBYOiByc4Pox2mCb3UXDPQoXmx-2EeHG8UA" />
                <span className="absolute top-4 left-4 bg-green-500 text-white text-[10px] font-bold uppercase px-2 py-1 rounded">Guide</span>
                <span className="absolute bottom-4 left-4 bg-black/40 backdrop-blur-md text-white text-[10px] font-bold uppercase px-2 py-1 rounded">Productivity</span>
              </div>
              <h3 className="text-xl font-bold mb-3 group-hover:text-syn-orange transition">10 Ways to Improve Team Productivity with AI</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-6 line-clamp-2">Practical strategies to leverage AI and automation to get more done with less effort.</p>
              <div className="mt-auto flex items-center justify-between border-t border-gray-100 dark:border-slate-800 pt-4">
                <div className="flex items-center gap-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  <span>May 15, 2024</span>
                  <span>6 min read</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-gray-200 rounded-full"></div>
                  <span className="text-xs font-bold">By Neha Kapoor</span>
                </div>
              </div>
            </article>

            <article className="flex flex-col group cursor-pointer">
              <div className="relative mb-6 overflow-hidden rounded-2xl h-64">
                <img alt="Article Thumbnail" className="w-full h-full object-cover transform group-hover:scale-105 transition duration-500" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDBWrO_vABFarYHJ8h19q6_4S5f8FBoUbfCRQ1EPEv8czeB2WdME8FuNes4Qi5heF9_1nrw18Qn2RNRASSXMGmN8ZJbPuu2i32pomCDZ7RKHq39pHbKe41l2Gj-SzsrCofZNkgbJE2fUqpn89DWId28A9wCaq2MXClfjoHF8n6_QCchu48Cnnf9FaVs12Ub2Vnhs1WLicuTF-vIqvP0kZZ0ym-dKVPZ7dE5JEIBIOLpgRk_O35YElqFb_dRrRkiI1CBElItHkvOUw" />
                <span className="absolute top-4 left-4 bg-purple-600 text-white text-[10px] font-bold uppercase px-2 py-1 rounded">Case Study</span>
                <span className="absolute bottom-4 right-4 bg-black/40 backdrop-blur-md text-white text-[10px] font-bold uppercase px-2 py-1 rounded">Growth</span>
              </div>
              <h3 className="text-xl font-bold mb-3 group-hover:text-syn-orange transition">How WebClue Increased Productivity by 45% with SynTask</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-6 line-clamp-2">See how a digital marketing agency scaled to 25+ clients without increasing headcount.</p>
              <div className="mt-auto flex items-center justify-between border-t border-gray-100 dark:border-slate-800 pt-4">
                <div className="flex items-center gap-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  <span>May 10, 2024</span>
                  <span>5 min read</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-gray-200 rounded-full"></div>
                  <span className="text-xs font-bold">By Aarav Mehta</span>
                </div>
              </div>
            </article>
          </div>
        </section>


        <section className="bg-gray-50 dark:bg-[#111224] py-24" data-purpose="resource-library">
          <div className="max-w-7xl mx-auto px-4">
            <div className="mb-12">
              <h2 className="text-3xl font-bold mb-4">Explore Our Resource Library</h2>
            </div>
            <div className="grid md:grid-cols-3 gap-6 mb-12">

              <div className="bg-white dark:bg-[#0A0B1A] p-6 rounded-2xl border border-gray-100 dark:border-slate-800 flex gap-5 group hover:border-syn-orange transition-colors">
                <div className="w-12 h-12 bg-orange-50 dark:bg-orange-950/20 rounded-xl flex-shrink-0 flex items-center justify-center text-syn-orange">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.168.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                </div>
                <div className="flex-grow">
                  <h4 className="font-bold text-sm mb-1">Agency Operations Playbook</h4>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-4">Step-by-step guide to build scalable operations for your agency.</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                      <span className="flex items-center gap-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg> PDF Guide</span>
                      <span>• 24 Pages</span>
                    </div>
                    <a className="text-syn-orange text-[10px] font-extrabold uppercase flex items-center gap-1 hover:gap-2 transition-all" href="#">Download <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg></a>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-[#0A0B1A] p-6 rounded-2xl border border-gray-100 dark:border-slate-800 flex gap-5 group hover:border-green-500 transition-colors">
                <div className="w-12 h-12 bg-green-50 dark:bg-green-950/20 rounded-xl flex-shrink-0 flex items-center justify-center text-green-600 dark:text-green-400">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                </div>
                <div className="flex-grow">
                  <h4 className="font-bold text-sm mb-1">Project Management Template</h4>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-4">Ready-to-use project plan template to manage tasks, timelines and deliverables.</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                      <span className="flex items-center gap-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg> Excel Sheet</span>
                      <span>• Customizable</span>
                    </div>
                    <a className="text-green-600 dark:text-green-400 text-[10px] font-extrabold uppercase flex items-center gap-1 hover:gap-2 transition-all" href="#">Download <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg></a>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-[#0A0B1A] p-6 rounded-2xl border border-gray-100 dark:border-slate-800 flex gap-5 group hover:border-purple-500 transition-colors">
                <div className="w-12 h-12 bg-purple-50 dark:bg-purple-950/20 rounded-xl flex-shrink-0 flex items-center justify-center text-purple-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                </div>
                <div className="flex-grow">
                  <h4 className="font-bold text-sm mb-1">Client Onboarding Checklist</h4>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-4">Complete checklist to onboard clients professionally and efficiently.</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                      <span className="flex items-center gap-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg> Checklist</span>
                      <span>• 15 Steps</span>
                    </div>
                    <a className="text-purple-600 text-[10px] font-extrabold uppercase flex items-center gap-1 hover:gap-2 transition-all" href="#">Download <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg></a>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-[#0A0B1A] p-6 rounded-2xl border border-gray-100 dark:border-slate-800 flex gap-5 group hover:border-blue-600 transition-colors">
                <div className="w-12 h-12 bg-blue-50 dark:bg-blue-950/20 rounded-xl flex-shrink-0 flex items-center justify-center text-blue-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                </div>
                <div className="flex-grow">
                  <h4 className="font-bold text-sm mb-1">SOP Template Bundle</h4>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-4">50+ SOP templates for HR, finance, projects, sales and more.</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                      <span className="flex items-center gap-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg> ZIP File</span>
                      <span>• 50+ Templates</span>
                    </div>
                    <a className="text-blue-600 text-[10px] font-extrabold uppercase flex items-center gap-1 hover:gap-2 transition-all" href="#">Download <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg></a>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-[#0A0B1A] p-6 rounded-2xl border border-gray-100 dark:border-slate-800 flex gap-5 group hover:border-syn-orange transition-colors">
                <div className="w-12 h-12 bg-orange-50 dark:bg-orange-950/20 rounded-xl flex-shrink-0 flex items-center justify-center text-syn-orange">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                </div>
                <div className="flex-grow">
                  <h4 className="font-bold text-sm mb-1">KPI Dashboard Template</h4>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-4">Track the right metrics and grow your business with data.</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                      <span className="flex items-center gap-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg> Google Sheets</span>
                      <span>• Real-time</span>
                    </div>
                    <a className="text-syn-orange text-[10px] font-extrabold uppercase flex items-center gap-1 hover:gap-2 transition-all" href="#">Download <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg></a>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-[#0A0B1A] p-6 rounded-2xl border border-gray-100 dark:border-slate-800 flex gap-5 group hover:border-green-600 transition-colors">
                <div className="w-12 h-12 bg-green-50 dark:bg-green-950/20 rounded-xl flex-shrink-0 flex items-center justify-center text-green-600 dark:text-green-400">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                </div>
                <div className="flex-grow">
                  <h4 className="font-bold text-sm mb-1">AI Prompts for Agencies</h4>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-4">100+ ready-to-use AI prompts for marketing, sales, HR and operations.</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                      <span className="flex items-center gap-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10l4 4v10a2 2 0 01-2 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg> Document</span>
                      <span>• 100+ Prompts</span>
                    </div>
                    <a className="text-green-600 dark:text-green-400 text-[10px] font-extrabold uppercase flex items-center gap-1 hover:gap-2 transition-all" href="#">Download <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg></a>
                  </div>
                </div>
              </div>
            </div>
            <div className="text-center">
              <button className="px-8 py-3 bg-white dark:bg-[#0A0B1A] border border-gray-200 dark:border-slate-700 rounded-xl font-bold text-sm hover:bg-gray-50 transition shadow-sm flex items-center gap-2 mx-auto">
                View All Resources
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 14l-7 7m0 0l-7-7m7 7V3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
              </button>
            </div>
          </div>
        </section>


        <section className="max-w-7xl mx-auto px-4 py-12" data-purpose="newsletter-signup">
          <div className="bg-slate-900 rounded-[32px] p-8 md:p-12 relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-8">

            <div className="absolute top-0 right-0 w-64 h-64 bg-syn-orange/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
            <div className="flex items-center gap-6 relative z-10">
              <div className="w-16 h-16 bg-syn-orange/20 rounded-2xl flex items-center justify-center text-syn-orange">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"></path></svg>
              </div>
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">Stay Ahead with Actionable Insights</h2>
                <p className="text-slate-400 max-w-md">Join 5,000+ agency owners and operators who get our best content straight to their inbox.</p>
              </div>
            </div>
            <div className="w-full md:w-auto relative z-10">
              <form className="flex flex-col gap-4">
                <div className="flex flex-col md:flex-row gap-2">
                  <input className="bg-white/10 border-white/20 text-white placeholder-slate-500 rounded-xl px-6 py-4 min-w-[300px] focus:ring-syn-orange" placeholder="Enter your work email" type="email" />
                  <button className="bg-syn-orange text-white font-bold px-8 py-4 rounded-xl hover:bg-orange-600 transition shadow-lg" type="submit">Subscribe</button>
                </div>
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" fillRule="evenodd"></path></svg> No spam
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" fillRule="evenodd"></path></svg> Unsubscribe anytime
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" fillRule="evenodd"></path></svg> Weekly insights
                  </div>
                </div>
              </form>
            </div>
          </div>
        </section>






        <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent dark:via-slate-800 my-4"></div>





        <header className="pt-16 pb-12 text-center">
          <div className="inline-flex items-center gap-2 bg-orange-50 dark:bg-orange-950/20 text-orange-600 dark:text-orange-400 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider mb-6">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1a1 1 0 10-2 0v1a1 1 0 102 0zM16.464 14.95a1 1 0 010 1.414l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 0zM14.95 5.05a1 1 0 011.414 0l.707.707a1 1 0 01-1.414 1.414l-.707-.707a1 1 0 010-1.414z"></path></svg>
            Simple Pricing. Powerful Value.
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-slate-900 dark:text-white mb-4">
            Choose the Plan That<br />
            <span className="text-gradient-orange">Transforms</span> Your Business
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-lg max-w-2xl mx-auto mb-10">
            All plans include access to core modules. Upgrade or downgrade at any time.
          </p>

          <div className="flex items-center justify-center space-x-4">
            <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">Billed Monthly</span>
            <div className="relative inline-block w-12 h-6 align-middle select-none transition duration-200 ease-in">
              <input checked="" className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white dark:bg-[#0A0B1A] border-4 border-gray-300 appearance-none cursor-pointer outline-none transition-all duration-300" id="billing-toggle" name="toggle" type="checkbox" />
              <label className="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer" for="billing-toggle"></label>
            </div>
            <span className="text-sm font-semibold text-blue-600">Billed Yearly</span>
            <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-1 rounded-md uppercase">Save up to 20%</span>
          </div>
        </header>


        <main className="max-w-7xl mx-auto px-4 py-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">

            <div className="bg-white dark:bg-[#0A0B1A] rounded-3xl border border-gray-100 dark:border-slate-800 p-8 flex flex-col shadow-sm hover:shadow-xl transition-shadow">
              <h3 className="text-2xl font-bold text-green-600 dark:text-green-400 mb-2">Starter</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">Perfect for small teams getting started.</p>
              <div className="mb-6">
                <span className="text-3xl font-extrabold">₹1,999</span>
                <span className="text-gray-400 text-sm font-medium">/month</span>
                <p className="text-[10px] text-gray-400 mt-1 uppercase font-semibold">Billed monthly</p>
              </div>
              <button className="w-full py-2.5 rounded-lg border border-green-500 text-green-600 dark:text-green-400 font-bold text-sm mb-8 hover:bg-green-50 transition-colors">Start Free Trial</button>
              <div className="space-y-3">
                <p className="text-xs font-bold text-gray-800 dark:text-white uppercase tracking-wide">Includes:</p>
                <ul className="space-y-2.5 text-xs font-medium text-gray-600 dark:text-gray-300">
                  <li className="flex items-center gap-2"><svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fillRule="evenodd"></path></svg> Up to 5 Users</li>
                  <li className="flex items-center gap-2"><svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fillRule="evenodd"></path></svg> Sales OS</li>
                  <li className="flex items-center gap-2"><svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fillRule="evenodd"></path></svg> Project OS</li>
                  <li className="flex items-center gap-2"><svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fillRule="evenodd"></path></svg> People OS</li>
                  <li className="flex items-center gap-2"><svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fillRule="evenodd"></path></svg> Basic Reports</li>
                  <li className="flex items-center gap-2"><svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fillRule="evenodd"></path></svg> Email Support</li>
                </ul>
              </div>
            </div>

            <div className="relative bg-white dark:bg-[#0A0B1A] rounded-3xl border-2 border-blue-600 p-8 flex flex-col shadow-xl">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-900 text-white text-[10px] font-bold px-4 py-1 rounded-full uppercase tracking-widest">Most Popular</div>
              <h3 className="text-2xl font-bold text-blue-700 mb-2">Growth</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">Ideal for growing agencies &amp; IT companies.</p>
              <div className="mb-6">
                <span className="text-3xl font-extrabold">₹4,999</span>
                <span className="text-gray-400 text-sm font-medium">/month</span>
                <p className="text-[10px] text-gray-400 mt-1 uppercase font-semibold">Billed monthly</p>
              </div>
              <button className="w-full py-2.5 rounded-lg bg-blue-600 text-white font-bold text-sm mb-8 hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200">Start Free Trial</button>
              <div className="space-y-3">
                <p className="text-xs font-bold text-gray-800 dark:text-white uppercase tracking-wide">Everything in Starter, plus:</p>
                <ul className="space-y-2.5 text-xs font-medium text-gray-600 dark:text-gray-300">
                  <li className="flex items-center gap-2"><svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fillRule="evenodd"></path></svg> Up to 20 Users</li>
                  <li className="flex items-center gap-2"><svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fillRule="evenodd"></path></svg> Recruitment OS</li>
                  <li className="flex items-center gap-2"><svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fillRule="evenodd"></path></svg> Finance OS</li>
                  <li className="flex items-center gap-2"><svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fillRule="evenodd"></path></svg> Automation (50 Workflows)</li>
                  <li className="flex items-center gap-2"><svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fillRule="evenodd"></path></svg> Client Portal</li>
                  <li className="flex items-center gap-2"><svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fillRule="evenodd"></path></svg> Priority Support</li>
                </ul>
              </div>
            </div>

            <div className="bg-white dark:bg-[#0A0B1A] rounded-3xl border border-gray-100 dark:border-slate-800 p-8 flex flex-col shadow-sm hover:shadow-xl transition-shadow">
              <h3 className="text-2xl font-bold text-purple-600 mb-2">Business</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">Advanced features for scaling businesses.</p>
              <div className="mb-6">
                <span className="text-3xl font-extrabold">₹9,999</span>
                <span className="text-gray-400 text-sm font-medium">/month</span>
                <p className="text-[10px] text-gray-400 mt-1 uppercase font-semibold">Billed monthly</p>
              </div>
              <button className="w-full py-2.5 rounded-lg border border-purple-500 text-purple-600 font-bold text-sm mb-8 hover:bg-purple-50 transition-colors">Start Free Trial</button>
              <div className="space-y-3">
                <p className="text-xs font-bold text-gray-800 dark:text-white uppercase tracking-wide">Everything in Growth, plus:</p>
                <ul className="space-y-2.5 text-xs font-medium text-gray-600 dark:text-gray-300">
                  <li className="flex items-center gap-2"><svg className="w-4 h-4 text-purple-600" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fillRule="evenodd"></path></svg> Up to 50 Users</li>
                  <li className="flex items-center gap-2"><svg className="w-4 h-4 text-purple-600" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fillRule="evenodd"></path></svg> AI Workforce (Basic)</li>
                  <li className="flex items-center gap-2"><svg className="w-4 h-4 text-purple-600" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fillRule="evenodd"></path></svg> Advanced Reports &amp; Analytics</li>
                  <li className="flex items-center gap-2"><svg className="w-4 h-4 text-purple-600" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fillRule="evenodd"></path></svg> Automation (Unlimited)</li>
                  <li className="flex items-center gap-2"><svg className="w-4 h-4 text-purple-600" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fillRule="evenodd"></path></svg> Custom Roles &amp; Permissions</li>
                  <li className="flex items-center gap-2"><svg className="w-4 h-4 text-purple-600" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fillRule="evenodd"></path></svg> Phone Support</li>
                </ul>
              </div>
            </div>

            <div className="bg-white dark:bg-[#0A0B1A] rounded-3xl border border-gray-100 dark:border-slate-800 p-8 flex flex-col shadow-sm hover:shadow-xl transition-shadow">
              <h3 className="text-2xl font-bold text-orange-600 dark:text-orange-400 mb-2">Enterprise</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">For large teams with custom needs &amp; security.</p>
              <div className="mb-6">
                <span className="text-3xl font-extrabold">Custom</span>
                <p className="text-[10px] text-gray-400 mt-1 uppercase font-semibold">Billed yearly</p>
              </div>
              <button className="w-full py-2.5 rounded-lg border border-orange-500 text-orange-600 dark:text-orange-400 font-bold text-sm mb-8 hover:bg-orange-50 transition-colors">Contact Sales</button>
              <div className="space-y-3">
                <p className="text-xs font-bold text-gray-800 dark:text-white uppercase tracking-wide">Everything in Business, plus:</p>
                <ul className="space-y-2.5 text-xs font-medium text-gray-600 dark:text-gray-300">
                  <li className="flex items-center gap-2"><svg className="w-4 h-4 text-orange-600 dark:text-orange-400" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fillRule="evenodd"></path></svg> Unlimited Users</li>
                  <li className="flex items-center gap-2"><svg className="w-4 h-4 text-orange-600 dark:text-orange-400" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fillRule="evenodd"></path></svg> AI Workforce (Advanced)</li>
                  <li className="flex items-center gap-2"><svg className="w-4 h-4 text-orange-600 dark:text-orange-400" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fillRule="evenodd"></path></svg> Custom Integrations</li>
                  <li className="flex items-center gap-2"><svg className="w-4 h-4 text-orange-600 dark:text-orange-400" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fillRule="evenodd"></path></svg> Dedicated Account Manager</li>
                  <li className="flex items-center gap-2"><svg className="w-4 h-4 text-orange-600 dark:text-orange-400" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fillRule="evenodd"></path></svg> SLA &amp; Uptime Guarantee</li>
                  <li className="flex items-center gap-2"><svg className="w-4 h-4 text-orange-600 dark:text-orange-400" fill="currentColor" viewBox="0 0 20 20"><path clipRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fillRule="evenodd"></path></svg> On-premise / Private Cloud</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-12 flex flex-wrap justify-center items-center gap-x-12 gap-y-4 text-gray-400 text-sm font-semibold">
            <span className="flex items-center gap-1"><svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"></path></svg> 14 Days Free Trial</span>
            <span className="flex items-center gap-1"><svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"></path></svg> No Credit Card Required</span>
            <span className="flex items-center gap-1"><svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"></path></svg> Cancel Anytime</span>
          </div>
        </main>


        <section className="max-w-7xl mx-auto px-4 py-20">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">

            <div className="lg:col-span-2">
              <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-8">Compare Plans</h2>
              <div className="overflow-hidden rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm bg-white dark:bg-[#0A0B1A]">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-[#111224] border-b border-gray-100 dark:border-slate-800">
                      <th className="p-4 font-bold text-gray-500 dark:text-gray-400">Features</th>
                      <th className="p-4 font-bold text-green-600 dark:text-green-400 bg-green-50/30 text-center">Starter</th>
                      <th className="p-4 font-bold text-blue-600 bg-blue-50/30 text-center relative">
                        Growth
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-900 text-white text-[8px] px-2 py-0.5 rounded-full">MOST POPULAR</div>
                      </th>
                      <th className="p-4 font-bold text-purple-600 bg-purple-50/30 text-center">Business</th>
                      <th className="p-4 font-bold text-orange-600 dark:text-orange-400 bg-orange-50/30 text-center">Enterprise</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">

                    <tr>
                      <td className="p-4 text-gray-600 dark:text-gray-300 font-medium flex items-center gap-2">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                        Users
                      </td>
                      <td className="p-4 text-center text-gray-600 dark:text-gray-300">Up to 5</td>
                      <td className="p-4 text-center text-gray-600 dark:text-gray-300">Up to 20</td>
                      <td className="p-4 text-center text-gray-600 dark:text-gray-300">Up to 50</td>
                      <td className="p-4 text-center text-gray-600 dark:text-gray-300">Unlimited</td>
                    </tr>

                    <tr>
                      <td className="p-4 text-gray-600 dark:text-gray-300 font-medium flex items-center gap-2">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                        All Core Modules
                      </td>
                      <td className="p-4 text-center"><svg className="w-4 h-4 text-green-500 mx-auto" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"></path></svg></td>
                      <td className="p-4 text-center"><svg className="w-4 h-4 text-blue-500 mx-auto" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"></path></svg></td>
                      <td className="p-4 text-center"><svg className="w-4 h-4 text-purple-500 mx-auto" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"></path></svg></td>
                      <td className="p-4 text-center"><svg className="w-4 h-4 text-orange-500 mx-auto" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"></path></svg></td>
                    </tr>

                    <tr>
                      <td className="p-4 text-gray-600 dark:text-gray-300 font-medium flex items-center gap-2">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                        AI Assistant
                      </td>
                      <td className="p-4 text-center text-gray-500 dark:text-gray-400">Basic</td>
                      <td className="p-4 text-center text-gray-500 dark:text-gray-400">Basic</td>
                      <td className="p-4 text-center text-gray-500 dark:text-gray-400">Advanced</td>
                      <td className="p-4 text-center text-gray-500 dark:text-gray-400">Advanced</td>
                    </tr>

                    <tr>
                      <td className="p-4 text-gray-600 dark:text-gray-300 font-medium flex items-center gap-2">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 011-1h1a2 2 0 100-4H7a1 1 0 01-1-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                        Automation
                      </td>
                      <td className="p-4 text-center text-gray-500 dark:text-gray-400">10 Workflows</td>
                      <td className="p-4 text-center text-gray-500 dark:text-gray-400">50 Workflows</td>
                      <td className="p-4 text-center text-gray-500 dark:text-gray-400">Unlimited</td>
                      <td className="p-4 text-center text-gray-500 dark:text-gray-400">Unlimited</td>
                    </tr>

                    <tr>
                      <td className="p-4 text-gray-600 dark:text-gray-300 font-medium flex items-center gap-2">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                        Storage
                      </td>
                      <td className="p-4 text-center text-gray-500 dark:text-gray-400">10 GB</td>
                      <td className="p-4 text-center text-gray-500 dark:text-gray-400">50 GB</td>
                      <td className="p-4 text-center text-gray-500 dark:text-gray-400">200 GB</td>
                      <td className="p-4 text-center text-gray-500 dark:text-gray-400">Custom</td>
                    </tr>

                    <tr>
                      <td className="p-4 text-gray-600 dark:text-gray-300 font-medium flex items-center gap-2">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                        Client Portal
                      </td>
                      <td className="p-4 text-center"><svg className="w-4 h-4 text-green-500 mx-auto" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"></path></svg></td>
                      <td className="p-4 text-center"><svg className="w-4 h-4 text-blue-500 mx-auto" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"></path></svg></td>
                      <td className="p-4 text-center"><svg className="w-4 h-4 text-purple-500 mx-auto" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"></path></svg></td>
                      <td className="p-4 text-center"><svg className="w-4 h-4 text-orange-500 mx-auto" fill="currentColor" viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"></path></svg></td>
                    </tr>

                    <tr>
                      <td className="p-4 text-gray-600 dark:text-gray-300 font-medium flex items-center gap-2">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04M12 21a11.955 11.955 0 01-8.618-3.04m17.236 0A11.955 11.955 0 0112 21" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                        SLA Uptime
                      </td>
                      <td className="p-4 text-center text-gray-300">—</td>
                      <td className="p-4 text-center text-gray-600 dark:text-gray-300">99%</td>
                      <td className="p-4 text-center text-gray-600 dark:text-gray-300">99.9%</td>
                      <td className="p-4 text-center text-gray-600 dark:text-gray-300">99.99%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="lg:col-span-1">
              <div className="bg-white dark:bg-[#0A0B1A] rounded-3xl border border-gray-100 dark:border-slate-800 p-8 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-orange-50 dark:bg-orange-950/20 rounded-xl flex items-center justify-center text-orange-600 dark:text-orange-400">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                  </div>
                  <h3 className="text-xl font-bold">Calculate Your ROI</h3>
                </div>
                <div className="space-y-8">

                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">How many employees do you have?</label>
                      <span className="text-lg font-bold text-orange-600 dark:text-orange-400" id="employee-count">25</span>
                    </div>
                    <input className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-600" id="employee-slider" max="1000" min="1" type="range" value="25" />
                    <div className="flex justify-between text-[10px] font-bold text-gray-400 mt-2">
                      <span>1</span>
                      <span>1000+</span>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">How many tools are you using today?</label>
                      <span className="text-lg font-bold text-orange-600 dark:text-orange-400" id="tool-count">8</span>
                    </div>
                    <input className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-600" id="tool-slider" max="20" min="1" type="range" value="8" />
                    <div className="flex justify-between text-[10px] font-bold text-gray-400 mt-2">
                      <span>1</span>
                      <span>20+</span>
                    </div>
                  </div>

                  <div className="bg-green-50/50 dark:bg-green-950/20 rounded-2xl p-6 relative overflow-hidden border border-green-100">
                    <p className="text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">You can save up to</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-extrabold text-green-600 dark:text-green-400" id="roi-savings">₹2,45,000</span>
                      <span className="text-gray-500 dark:text-gray-400 font-bold text-sm">/year</span>
                    </div>
                    <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase">with SynTask</p>

                    <div className="absolute bottom-4 right-4 w-20 h-10">
                      <svg className="w-full h-full" viewBox="0 0 100 40">
                        <path d="M0 35 Q 10 30 20 32 T 40 10 T 60 25 T 80 5 T 100 15" fill="none" stroke="#22C55E" strokeLinecap="round" strokeWidth="2"></path>
                      </svg>
                    </div>
                  </div>

                  <div className="space-y-3 pt-6 border-t border-gray-100 dark:border-slate-800">
                    <h4 className="text-sm font-bold text-gray-800 dark:text-white">Frequently Asked Questions</h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-slate-800 text-xs font-semibold text-gray-600 dark:text-gray-300">
                        Can I change my plan later?
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-slate-800 text-xs font-semibold text-gray-600 dark:text-gray-300">
                        Is my data secure with SynTask?
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>


        <section className="max-w-7xl mx-auto px-4 py-16">
          <div className="bg-slate-950 rounded-[40px] p-8 md:p-16 relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-12">

            <div className="absolute top-0 right-0 w-64 h-64 bg-orange-600/10 blur-[100px]"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-600/10 blur-[100px]"></div>
            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
                  <span className="text-4xl">🚀</span>
                </div>
                <div>
                  <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-2">Ready to Transform Your Business?</h2>
                  <p className="text-gray-400 text-lg">Join hundreds of agencies &amp; IT companies already growing with SynTask.</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-6 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mt-8">
                <span className="flex items-center gap-2"><svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg> 14 Days Free Trial</span>
                <span className="flex items-center gap-2"><svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg> No Credit Card</span>
                <span className="flex items-center gap-2"><svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg> Cancel Anytime</span>
              </div>
            </div>
            <div className="relative z-10 flex flex-col gap-4 w-full max-w-xs">
              <button className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-4 rounded-2xl text-lg flex items-center justify-center gap-2 transition-all shadow-xl shadow-orange-900/20">
                Start Free Trial <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
              </button>
              <button className="bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold py-4 rounded-2xl text-lg flex items-center justify-center gap-2 transition-all">
                Book a Live Demo <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
              </button>
            </div>
          </div>
        </section>








      </div>

      <footer className="bg-white dark:bg-[#0A0B1A] border-t border-gray-100 dark:border-slate-800 pt-20 pb-10" data-purpose="site-footer">
        <div className="max-w-7xl mx-auto px-4 grid md:grid-cols-6 gap-12 mb-20">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-8 h-8 bg-syn-orange rounded-lg flex items-center justify-center">
                <div className="w-4 h-4 bg-white dark:bg-[#0A0B1A] rounded-sm rotate-45"></div>
              </div>
              <span className="text-xl font-bold tracking-tight">SynTask <span className="text-xs block text-gray-500 dark:text-gray-400 -mt-1 uppercase tracking-widest">Agency OS</span></span>
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-8 leading-relaxed max-w-xs">
              The AI Business Operating System built exclusively for agencies &amp; IT companies.
            </p>
            <div className="flex items-center gap-4">
              <a className="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-syn-orange hover:text-white transition" href="#"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"></path></svg></a>
              <a className="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-syn-orange hover:text-white transition" href="#"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z"></path></svg></a>
              <a className="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-syn-orange hover:text-white transition" href="#"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"></path></svg></a>
              <a className="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-syn-orange hover:text-white transition" href="#"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z"></path></svg></a>
              <a className="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-syn-orange hover:text-white transition" href="#"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"></path></svg></a>
            </div>
          </div>
          <div>
            <h4 className="font-bold text-sm mb-6">Product</h4>
            <ul className="space-y-4 text-gray-500 dark:text-gray-400 text-sm">
              <li><a className="hover:text-syn-orange" href="#">Features</a></li>
              <li><a className="hover:text-syn-orange" href="#">AI Workforce</a></li>
              <li><a className="hover:text-syn-orange" href="#">Integrations</a></li>
              <li><a className="hover:text-syn-orange" href="#">What's New</a></li>
              <li><a className="hover:text-syn-orange" href="#">Roadmap</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-sm mb-6">Solutions</h4>
            <ul className="space-y-4 text-gray-500 dark:text-gray-400 text-sm">
              <li><a className="hover:text-syn-orange" href="#">Digital Marketing Agencies</a></li>
              <li><a className="hover:text-syn-orange" href="#">Creative Agencies</a></li>
              <li><a className="hover:text-syn-orange" href="#">IT Services Companies</a></li>
              <li><a className="hover:text-syn-orange" href="#">Software Development Companies</a></li>
              <li><a className="hover:text-syn-orange" href="#">Product Engineering Companies</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-sm mb-6">Resources</h4>
            <ul className="space-y-4 text-gray-500 dark:text-gray-400 text-sm">
              <li><a className="hover:text-syn-orange" href="#">Blog</a></li>
              <li><a className="hover:text-syn-orange" href="#">Guides &amp; Ebooks</a></li>
              <li><a className="hover:text-syn-orange" href="#">Templates</a></li>
              <li><a className="hover:text-syn-orange" href="#">Case Studies</a></li>
              <li><a className="hover:text-syn-orange" href="#">Help Center</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-sm mb-6">Company</h4>
            <ul className="space-y-4 text-gray-500 dark:text-gray-400 text-sm">
              <li><a className="hover:text-syn-orange" href="#">About Us</a></li>
              <li><a className="hover:text-syn-orange" href="#">Careers</a></li>
              <li><a className="hover:text-syn-orange" href="#">Partners</a></li>
              <li><a className="hover:text-syn-orange" href="#">Contact Us</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-sm mb-6">Stay Updated</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Get tips, updates &amp; offers straight to your inbox.</p>
            <div className="relative flex items-center">
              <input className="w-full bg-gray-50 dark:bg-[#111224] border-gray-100 dark:border-slate-800 rounded-lg py-2 px-4 text-sm focus:ring-syn-orange focus:border-syn-orange" placeholder="Enter your email" type="email" />
              <button className="absolute right-1 top-1 bg-syn-orange text-white p-1.5 rounded-md hover:bg-orange-600 transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
              </button>
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 pt-10 border-t border-gray-100 dark:border-slate-800 flex flex-col md:flex-row items-center justify-between gap-6">
          <p className="text-xs text-gray-400">© 2024 SynTask. All rights reserved.</p>
          <div className="flex items-center gap-8 text-xs text-gray-400">
            <a className="hover:text-syn-orange" href="#">Privacy Policy</a>
            <a className="hover:text-syn-orange" href="#">Terms of Service</a>
            <a className="hover:text-syn-orange" href="#">Security</a>
            <a className="hover:text-syn-orange" href="#">Sitemap</a>
          </div>
        </div>
      </footer>




    </>
  );
}
