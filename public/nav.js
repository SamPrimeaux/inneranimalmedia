(function() {
    // 1. Theme Logic
    const path = window.location.pathname;
    // Determine theme based on path
    // Dark: Home (/), Services, Dashboard, Scan
    // Light: Work, About, MeauxAI
    let isLight = false;
    if (path.includes('work') || path.includes('about') || path.includes('meauxai') || path.includes('meauxbility')) {
        isLight = true;
    }
    
    const themeClass = isLight ? 'nav-theme-light' : 'nav-theme-dark';

    // 2. Inject CSS
    const style = document.createElement('style');
    style.textContent = `
        :root {
            --nav-z-index: 9999;
            --nav-transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            
            /* Dark Theme Variables (Default) */
            --nav-bg-dark: rgba(20, 20, 20, 0.7);
            --nav-border-dark: rgba(255, 255, 255, 0.1);
            --nav-text-dark: #ffffff;
            --nav-accent-dark: #3b82f6;
            --footer-bg-dark: rgba(20, 20, 20, 0.8);

            /* Light Theme Variables */
            --nav-bg-light: rgba(255, 255, 255, 0.8);
            --nav-border-light: rgba(0, 0, 0, 0.1);
            --nav-text-light: #1a1a1a;
            --nav-accent-light: #3b82f6;
            --footer-bg-light: rgba(255, 255, 255, 0.9);
        }

        /* Hamburger Button */
        .nav-toggle {
            position: fixed;
            top: 24px;
            right: 24px;
            width: 48px;
            height: 48px;
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            z-index: var(--nav-z-index);
            transition: transform 0.2s ease, background 0.2s;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }

        /* Theme-specific toggle styles */
        .nav-theme-light .nav-toggle {
            background: rgba(255, 255, 255, 0.8);
            border-color: rgba(0, 0, 0, 0.1);
        }
        
        .nav-theme-dark .nav-toggle {
            background: rgba(0, 0, 0, 0.5);
            border-color: rgba(255, 255, 255, 0.1);
        }

        .nav-toggle:hover {
            transform: scale(1.05);
        }

        .hamburger {
            width: 24px;
            height: 24px;
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .hamburger span {
            position: absolute;
            width: 100%;
            height: 2px;
            border-radius: 2px;
            transition: var(--nav-transition);
        }

        /* Theme-specific hamburger lines */
        .nav-theme-light .hamburger span { background-color: #1a1a1a; }
        .nav-theme-dark .hamburger span { background-color: #ffffff; }

        .hamburger span:nth-child(1) { transform: translateY(-8px); }
        .hamburger span:nth-child(2) { transform: translateY(0); opacity: 1; }
        .hamburger span:nth-child(3) { transform: translateY(8px); }

        /* Morph to X */
        .nav-open .hamburger span:nth-child(1) { transform: translateY(0) rotate(45deg); }
        .nav-open .hamburger span:nth-child(2) { opacity: 0; transform: translateX(10px); }
        .nav-open .hamburger span:nth-child(3) { transform: translateY(0) rotate(-45deg); }

        /* Glassmorphic Side Nav */
        .side-nav {
            position: fixed;
            top: 0;
            right: 0;
            width: 300px;
            height: 100vh;
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            z-index: 9998;
            transform: translateX(100%);
            transition: var(--nav-transition);
            display: flex;
            flex-direction: column;
            padding: 100px 40px 40px;
            box-shadow: -10px 0 30px rgba(0,0,0,0.1);
        }

        .side-nav.active {
            transform: translateX(0);
        }

        /* Theme Styles for Side Nav */
        .side-nav.nav-theme-light {
            background: var(--nav-bg-light);
            border-left: 1px solid var(--nav-border-light);
            color: var(--nav-text-light);
        }

        .side-nav.nav-theme-dark {
            background: var(--nav-bg-dark);
            border-left: 1px solid var(--nav-border-dark);
            color: var(--nav-text-dark);
        }

        /* Nav Links */
        .nav-links {
            list-style: none;
            padding: 0;
            margin: 0;
            display: flex;
            flex-direction: column;
            gap: 24px;
        }

        .nav-link {
            font-size: 24px;
            font-weight: 600;
            text-decoration: none;
            position: relative;
            display: inline-block;
            transition: color 0.2s;
            color: inherit; /* Inherit from parent theme */
        }

        .nav-link:hover {
            opacity: 0.7;
        }

        /* Glassmorphic Footer */
        .glass-footer {
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            width: 90%;
            max-width: 600px;
            padding: 16px 24px;
            border-radius: 16px;
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            z-index: 9990;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 14px;
            font-weight: 500;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
            transition: var(--nav-transition);
        }

        /* Theme Styles for Footer */
        .glass-footer.nav-theme-light {
            background: var(--footer-bg-light);
            border: 1px solid var(--nav-border-light);
            color: var(--nav-text-light);
        }

        .glass-footer.nav-theme-dark {
            background: var(--footer-bg-dark);
            border: 1px solid var(--nav-border-dark);
            color: var(--nav-text-dark);
        }

        .footer-brand {
            font-weight: 700;
            opacity: 0.9;
        }

        .footer-links {
            display: flex;
            gap: 16px;
        }

        .footer-link {
            color: inherit;
            text-decoration: none;
            opacity: 0.7;
            transition: opacity 0.2s;
        }

        .footer-link:hover {
            opacity: 1;
        }

        /* Mobile Overlay */
        .nav-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.2);
            backdrop-filter: blur(2px);
            -webkit-backdrop-filter: blur(2px);
            z-index: 9997;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.3s ease;
        }

        .nav-overlay.active {
            opacity: 1;
            pointer-events: auto;
        }

        @media (max-width: 480px) {
            .side-nav {
                width: 100%;
            }
            .glass-footer {
                width: calc(100% - 32px);
                bottom: 16px;
                flex-direction: column;
                gap: 8px;
                text-align: center;
            }
        }
    `;
    document.head.appendChild(style);

    // 3. Inject HTML
    const navContainer = document.createElement('div');
    // Apply theme class to container to cascade to children if needed, 
    // but we will apply directly to elements for precision.
    navContainer.className = themeClass; 
    
    navContainer.innerHTML = `
        <div class="nav-overlay" id="navOverlay"></div>
        
        <button class="nav-toggle" id="navToggle" aria-label="Toggle Navigation">
            <div class="hamburger">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </button>

        <nav class="side-nav ${themeClass}" id="sideNav">
            <ul class="nav-links">
                <li><a href="/" class="nav-link">Home</a></li>
                <li><a href="/work.html" class="nav-link">Work</a></li>
                <li><a href="/meauxbility" class="nav-link">Meauxbility</a></li>
                <li><a href="/dashboard/kanban" class="nav-link">Launch Guide</a></li>
                <li><a href="/services.html" class="nav-link">Services</a></li>
                <li><a href="/about.html" class="nav-link">About</a></li>
                <li><a href="/dashboard.html" class="nav-link">Dashboard</a></li>
            </ul>
        </nav>

        <footer class="glass-footer ${themeClass}">
            <div class="footer-brand">InnerAnimal Media</div>
            <div class="footer-links">
                <a href="/work.html" class="footer-link">Work</a>
                <a href="/services.html" class="footer-link">Services</a>
                <a href="/about.html" class="footer-link">About</a>
                <span style="opacity:0.3">|</span>
                <a href="https://github.com/SamPrimeaux/inneranimalmedia" target="_blank" class="footer-link">GitHub</a>
            </div>
        </footer>
    `;
    document.body.appendChild(navContainer);

    // 4. Logic
    const toggle = document.getElementById('navToggle');
    const sideNav = document.getElementById('sideNav');
    const overlay = document.getElementById('navOverlay');
    const links = document.querySelectorAll('.nav-link');

    function toggleNav() {
        const isOpen = sideNav.classList.contains('active');
        
        if (isOpen) {
            sideNav.classList.remove('active');
            overlay.classList.remove('active');
            toggle.classList.remove('nav-open');
        } else {
            sideNav.classList.add('active');
            overlay.classList.add('active');
            toggle.classList.add('nav-open');
        }
    }

    toggle.addEventListener('click', toggleNav);
    overlay.addEventListener('click', toggleNav);

    // Close on link click
    links.forEach(link => {
        link.addEventListener('click', () => {
            sideNav.classList.remove('active');
            overlay.classList.remove('active');
            toggle.classList.remove('nav-open');
        });
    });

})();
