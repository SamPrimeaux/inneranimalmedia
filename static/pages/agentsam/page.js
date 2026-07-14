const sections = [...document.querySelectorAll('[data-section]')];
    const labels = [...document.querySelectorAll('[data-rail]')];
    const railDot = document.getElementById('railDot');

    const setActive = (id) => {
      labels.forEach((label, index) => {
        const active = label.dataset.rail === id;
        label.classList.toggle('active', active);
        if (active && railDot) railDot.style.top = `${44 + index * 31}px`;
      });
    };

    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActive(visible.target.dataset.section);
    }, { rootMargin: '-28% 0px -45% 0px', threshold: [0.12, 0.24, 0.42] });

    sections.forEach(section => observer.observe(section));

    const copyButton = document.getElementById('copyBrief');
    copyButton?.addEventListener('click', async () => {
      const brief = `AgentSam Cloud Contained Sandbox Capabilities\n\nGive agents a secure computer: ephemeral isolated sandboxes for agent-generated code, terminals, previews, tests, and long-running build sessions. Core story: contain untrusted work, proxy credentials through policy, scale parallel agent fleets, preserve state with TTLs/snapshots/tunnels, observe every command and artifact, then promote only reviewed output back to production.`;
      try {
        await navigator.clipboard.writeText(brief);
        copyButton.textContent = 'Copied brief';
        setTimeout(() => copyButton.textContent = 'Copy capability brief', 1600);
      } catch (error) {
        copyButton.textContent = 'Brief ready';
      }
    });
