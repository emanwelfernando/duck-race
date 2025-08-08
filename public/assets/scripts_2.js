const drawer    = document.getElementById('setupDrawer');
const toggleBtn = document.getElementById('drawerToggle');
const resetBtn  = document.getElementById('resetBtn');

function openDrawer()  { drawer.classList.add('open');  drawer.classList.remove('closed'); }
function closeDrawer() { drawer.classList.remove('open'); drawer.classList.add('closed'); }

// Opening on page start
openDrawer();

// When starting the race:
setupForm.addEventListener('submit', e => {
  e.preventDefault();
  // … your existing parse logic …
  closeDrawer();    // slide it away instead of hiding entirely
  nextHeat();
});

// “Close” button in the drawer
toggleBtn.addEventListener('click', () => {
  closeDrawer();
});

// “New Simulation” brings it back
resetBtn.addEventListener('click', () => {
  openDrawer();
  // … any reset logic you already have …
});
