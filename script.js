const counters = document.querySelectorAll('.counter');
let started = false;

function runCounter() {
  if (started) return;

  const trigger = document.querySelector("#stats").getBoundingClientRect().top;
  if (trigger < window.innerHeight - 100) {
    started = true;

    counters.forEach(counter => {
      const target = +counter.getAttribute('data-target');
      const speed = 200; // smaller = faster
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
