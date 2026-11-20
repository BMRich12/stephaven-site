/* Each check marks a group of pieces the player already has. Only the checks
   are saved, on this browser. Shared links point to the unpersonalized plan. */
(() => {
  const prefix = 'stephaven.planner.v1.';
  document.querySelectorAll('.plan').forEach(plan => {
    const boxes = Array.from(plan.querySelectorAll('input[type=checkbox]'));
    const status = plan.querySelector('output');
    function render() {
      let remaining = 0;
      boxes.forEach(box => {
        if (!box.checked) {
          remaining += Number(box.closest('label').querySelector('data').value);
        }
      });
      status.textContent = remaining ? remaining.toLocaleString('en-US') + ' points left to collect' : 'You have all the pieces!';
    }
    function restore() {
      try {
        boxes.forEach(box => { box.checked = localStorage.getItem(prefix + box.id) === '1'; });
      } catch { /* The checklist also works without storage. */ }
      render();
    }
    boxes.forEach(box => box.addEventListener('change', () => {
      try {
        if (box.checked) localStorage.setItem(prefix + box.id, '1');
        else localStorage.removeItem(prefix + box.id);
      } catch { /* Keep this visit's checks. */ }
      render();
    }));
    window.addEventListener('storage', event => {
      if (event.key === null || event.key.startsWith(prefix + plan.id + '-')) restore();
    });
    restore();

    const link = plan.querySelector('.permalink');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.textContent = 'Copy plan link';
      const notice = plan.querySelector('.share-status');
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(link.href);
          notice.textContent = 'Link copied.';
        } catch {
          copy.replaceWith(link);
          link.focus();
          notice.textContent = 'Use this link to share the plan.';
        }
      });
      link.replaceWith(copy);
    }
  });
  document.documentElement.classList.add('checklists-ready');
})();
