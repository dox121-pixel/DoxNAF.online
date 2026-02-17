// SMOOTH SCROLL (CSS handles this, but keep for older browsers)
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

// COUNTER ANIMATION (SAFE VERSION)
const statsSection = document.querySelector("#stats");
const counters = document.querySelectorAll('.counter');
let started = false;

function runCounter() {
  if (!statsSection || started) return;

  const trigger = statsSection.getBoundingClientRect().top;

  if (trigger < window.innerHeight - 100) {
    started = true;

    counters.forEach(counter => {
      const target = +counter.getAttribute('data-target');
      const speed = 200;
      let count = 0;

      const update = () => {
        const increment = Math.ceil(target / speed);
        count += increment;

        if (count < target) {
          counter.innerText = count;
          requestAnimationFrame(update);
        } else {
          counter.innerText = target.toLocaleString();
        }
      };

      update();
    });
  }
}

window.addEventListener('scroll', runCounter, { passive: true });
window.addEventListener('load', runCounter);


// SCROLL REVEAL ANIMATION
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
}, { threshold: 0.2 });

document.querySelectorAll('.reveal').forEach(el => {
  observer.observe(el);
});

// CONSOLIDATED SCROLL HANDLER (Active Nav + Header Shrink)
const sections = document.querySelectorAll("section");
const navLinks = document.querySelectorAll("nav a");
const header = document.querySelector("header");

let scrollY = 0;
let ticking = false;
let lastScrollY = 0;
let isResizing = false;
let resizeTimer = null;

function updateOnScroll() {
  const currentScrollY = scrollY;

  // Skip header state changes during active resize to prevent jitter
  if (!isResizing) {
    // Update header shrink state with hysteresis to prevent flicker
    const scrollingDown = currentScrollY > lastScrollY;
    const isShrunk = header.classList.contains("shrink");
    
    if (scrollingDown && currentScrollY > 70 && !isShrunk) {
      header.classList.add("shrink");
    } else if (!scrollingDown && currentScrollY < 50 && isShrunk) {
      header.classList.remove("shrink");
    }
  }
  
  lastScrollY = currentScrollY;

  // Update active nav link
  let current = "";

  // TOP OF PAGE FIX
  if (currentScrollY < 100) {
    if (sections.length > 0) {
      current = sections[0].getAttribute("id") || "";
    }
  } else {
    sections.forEach(section => {
      const rect = section.getBoundingClientRect();
      if (rect.top <= 150 && rect.bottom >= 150) {
        current = section.getAttribute("id");
      }
    });

    // BOTTOM OF PAGE FIX
    if ((window.innerHeight + currentScrollY) >= document.body.offsetHeight - 5) {
      if (sections.length > 0) {
        const lastSection = sections[sections.length - 1];
        current = lastSection.getAttribute("id") || "";
      }
    }
  }

  navLinks.forEach(link => {
    link.classList.remove("active");
    const href = link.getAttribute("href");
    if (href && href === '#' + current) {
      link.classList.add("active");
    }
  });

  ticking = false;
}

window.addEventListener("scroll", () => {
  scrollY = window.scrollY;

  if (!ticking) {
    requestAnimationFrame(updateOnScroll);
    ticking = true;
  }
}, { passive: true });

// Handle window resize to prevent header jitter
window.addEventListener("resize", () => {
  // Set resizing flag to pause header state changes
  isResizing = true;
  
  // Clear existing timer
  if (resizeTimer) {
    clearTimeout(resizeTimer);
  }
  
  // Debounce: wait for resize to finish before allowing header updates
  resizeTimer = setTimeout(() => {
    isResizing = false;
    // Trigger one final update after resize completes
    scrollY = window.scrollY;
    if (!ticking) {
      requestAnimationFrame(updateOnScroll);
      ticking = true;
    }
  }, 150);
}, { passive: true });
