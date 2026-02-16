// SMOOTH SCROLL (already handled in CSS but safe fallback)
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

window.addEventListener('scroll', runCounter);
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

// ACTIVE NAV HIGHLIGHT
const sections = document.querySelectorAll("section");
const navLinks = document.querySelectorAll("nav a");

window.addEventListener("scroll", () => {
  let current = "";

  sections.forEach(section => {
    const sectionTop = section.offsetTop;
    if (scrollY >= sectionTop - 200) {
      current = section.getAttribute("id");
    }
  });

  navLinks.forEach(link => {
    link.classList.remove("active");
    if (link.getAttribute("href").includes(current)) {
      link.classList.add("active");
    }
  });
});

// SHRINKING HEADER
const header = document.querySelector("header");

window.addEventListener("scroll", () => {
  if (window.scrollY > 50) {
    header.classList.add("shrink");
  } else {
    header.classList.remove("shrink");
  }
});
