// ─── Dark Mode ────────────────────────────────────────────────


document.addEventListener('DOMContentLoaded', () => {

  // ─── Hamburger Menu ─────────────────────────────────────────
  const hamburger = document.getElementById('hamburger');
  const navMenu = document.getElementById('navMenu');
  const overlay = document.getElementById('mobileOverlay');

  if (hamburger) {
    hamburger.addEventListener('click', () => {
      navMenu.classList.toggle('open');
      overlay?.classList.toggle('open');
    });
    overlay?.addEventListener('click', () => {
      navMenu.classList.remove('open');
      overlay.classList.remove('open');
    });
  }

  // ─── Admin Sidebar Mobile ────────────────────────────────────
  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');

  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      sidebarOverlay?.classList.toggle('open');
    });
    sidebarOverlay?.addEventListener('click', () => {
      sidebar.classList.remove('open');
      sidebarOverlay.classList.remove('open');
    });
  }

  // ─── Multi-Photo Upload ──────────────────────────────────────
  const photoInput = document.getElementById('fotoInput');
  const previewGrid = document.getElementById('previewGrid');
  let selectedFiles = [];

  if (photoInput) {
    photoInput.addEventListener('change', handleFiles);

    // Drag & Drop
    const uploadArea = document.getElementById('uploadArea');
    if (uploadArea) {
      uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('dragover'); });
      uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
      uploadArea.addEventListener('drop', e => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        addFiles(files);
      });
    }
  }

  function handleFiles(e) {
    const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
    addFiles(files);
  }

  function addFiles(files) {
    const remaining = 3 - selectedFiles.length;
    const toAdd = files.slice(0, remaining);
    if (files.length > remaining) alert(`Maksimal 3 foto. Hanya ${remaining} foto yang ditambahkan.`);
    toAdd.forEach(file => {
      selectedFiles.push(file);
      const reader = new FileReader();
      reader.onload = e => addPreview(e.target.result, selectedFiles.length - 1);
      reader.readAsDataURL(file);
    });
    updateFileInput();
  }

  function addPreview(src, idx) {
    if (!previewGrid) return;
    const div = document.createElement('div');
    div.className = 'preview-item fade-in';
    div.dataset.idx = idx;
    div.innerHTML = `<img src="${src}" alt="Preview"><button class="remove-btn" onclick="removePhoto(${idx})">✕</button>`;
    previewGrid.appendChild(div);
  }

  window.removePhoto = function(idx) {
    selectedFiles = selectedFiles.filter((_, i) => i !== idx);
    renderPreviews();
    updateFileInput();
  };

  function renderPreviews() {
    if (!previewGrid) return;
    previewGrid.innerHTML = '';
    selectedFiles.forEach((file, idx) => {
      const reader = new FileReader();
      reader.onload = e => addPreview(e.target.result, idx);
      reader.readAsDataURL(file);
    });
  }

  function updateFileInput() {
    if (!photoInput) return;
    const dt = new DataTransfer();
    selectedFiles.forEach(f => dt.items.add(f));
    photoInput.files = dt.files;
  }

  // ─── Lightbox ────────────────────────────────────────────────
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightboxImg');

  window.openLightbox = function(src) {
    if (!lightbox) return;
    lightboxImg.src = src;
    lightbox.classList.add('open');
    document.body.style.overflow = 'hidden';
  };

  window.closeLightbox = function() {
    lightbox?.classList.remove('open');
    document.body.style.overflow = '';
  };

  lightbox?.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });

  // ─── Copy Kode Tracking ──────────────────────────────────────
  window.copyKode = function(kode) {
    navigator.clipboard.writeText(kode).then(() => {
      const btn = document.getElementById('copyBtn');
      if (btn) { btn.textContent = '✅ Tersalin!'; setTimeout(() => btn.textContent = '📋 Salin Kode', 2000); }
    });
  };

  // ─── Confirm Delete ──────────────────────────────────────────
  document.querySelectorAll('[data-confirm]').forEach(btn => {
    btn.addEventListener('click', e => {
      if (!confirm(btn.dataset.confirm)) e.preventDefault();
    });
  });

  // ─── Animate bars ────────────────────────────────────────────
  document.querySelectorAll('.chart-bar-fill').forEach(bar => {
    const w = bar.style.width;
    bar.style.width = '0';
    setTimeout(() => { bar.style.width = w; }, 200);
  });

  // ─── Auto-dismiss alerts ─────────────────────────────────────
  document.querySelectorAll('.alert-auto').forEach(alert => {
    setTimeout(() => alert.style.display = 'none', 5000);
  });

  // ─── Chart Tooltip ──────────────────────────────────────────
  document.querySelectorAll('.chart-bar-row').forEach(row => {
    row.style.cursor = 'default';
  });

  // ─── Export ──────────────────────────────────────────────────
  window.exportTable = function(type) {
    const params = new URLSearchParams(window.location.search);
    params.set('export', type);
    window.location.href = '/admin/laporan/export?' + params.toString();
  };

  // ─── Sidebar active link ─────────────────────────────────────
  document.querySelectorAll('.sidebar-nav a').forEach(link => {
    if (link.href === window.location.href) link.classList.add('active');
  });
});

// PWA Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
