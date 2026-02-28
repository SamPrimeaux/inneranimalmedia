(function() {
    // 1. Inject CSS
    const style = document.createElement('style');
    style.textContent = `
        :root {
            --nav-z-index: 9999;
            --nav-glass-bg: rgba(255, 255, 255, 0.1);
            --nav-glass-border: rgba(255, 255, 255, 0.2);
            --nav-text-color: #333;
            --nav-accent-color: #3b82f6;
        }

        /* Hamburger Button */
        .nav-toggle {
            position: fixed;
            top: 24px;
            right: 24px;
            width: 48px;
            height: 48px;
            background: rgba(255, 255, 255, 0.8);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(0, 0, 0, 0.1);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            z-index: var(--nav-z-index);
            transition: all 0.3s ease;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }

        .nav-toggle:hover {
            transform: scale(1.05);
            background: #fff;
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
            background-color: #333;
            border-radius: 2px;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

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
            background: rgba(255, 255, 255, 0.7);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-left: 1px solid var(--nav-glass-border);
            box-shadow: -10px 0 30px rgba(0,0,0,0.1);
            z-index: 9998;
            transform: translateX(100%);
            transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            display: flex;
            flex-direction: column;
            padding: 100px 40px 40px;
        }

        .side-nav.active {
            transform: translateX(0);
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
            color: var(--nav-text-color);
            text-decoration: none;
            position: relative;
            display: inline-block;
            transition: color 0.2s;
        }

        .nav-link:hover {
            color: var(--nav-accent-color);
        }

        .nav-link::after {
            content: '';
            position: absolute;
            bottom: -4px;
            left: 0;
            width: 0;
            height: 2px;
            background: var(--nav-accent-color);
            transition: width 0.3s ease;
        }

        .nav-link:hover::after {
            width: 100%;
        }

        /* Mobile Overlay */
        .nav-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.2);
            backdrop-filter: blur(2px);
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
        }
    `;
    document.head.appendChild(style);

    // 2. Inject HTML
    const navContainer = document.createElement('div');
    navContainer.innerHTML = `
        <div class="nav-overlay" id="navOverlay"></div>
        
        <button class="nav-toggle" id="navToggle" aria-label="Toggle Navigation">
            <div class="hamburger">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </button>

        <nav class="side-nav" id="sideNav">
            <ul class="nav-links">
                <li><a href="/" class="nav-link">Home</a></li>
                <li><a href="/work.html" class="nav-link">Work</a></li>
                <li><a href="/services.html" class="nav-link">Services</a></li>
                <li><a href="/about.html" class="nav-link">About</a></li>
                <li><a href="/dashboard.html" class="nav-link">Dashboard</a></li>
            </ul>
        </nav>
    `;
    document.body.appendChild(navContainer);

    // 3. Logic
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
