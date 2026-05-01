/* =============================================
   MBG TRACKER — script.js
   Logika utama aplikasi: auth, data, charts, QR, export
   =============================================

   📌 KONFIGURASI GOOGLE SHEETS:
   Ganti APPS_SCRIPT_URL dengan URL Google Apps Script Anda.
   Lihat bagian "Export Data" di dashboard untuk panduan lengkap.
   ============================================= */

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwQs4I_rJMBU7Zh0ugBpoh3obTgj50GicB3jFm8CwRR_lQO2lNtt2-O88w5x7tq46Me/exec';

// =============================================
// USERS — Data akun guru (hardcoded untuk demo)
// Bisa dikembangkan ke Google Sheets sebagai sumber data
// =============================================
const USERS = [
  { username: 'guru1', password: 'mbg2024', nama: 'Bapak Andi Prasetyo', role: 'guru' },
  { username: 'guru2', password: 'mbg2024', nama: 'Ibu Sari Dewi',       role: 'guru' },
  { username: 'guru3', password: 'mbg2024', nama: 'Bapak Hendra Wijaya', role: 'guru' },
  { username: 'admin', password: 'admin123', nama: 'Administrator',      role: 'guru' },
];

// =============================================
// STORAGE KEYS
// =============================================
const STORAGE_KEYS = {
  user:  'mbg_current_user',
  data:  'mbg_data_records',
};

// =============================================
// NAMESPACE UTAMA: MBG
// Semua fungsi publik aplikasi ada di sini
// =============================================
const MBG = (function () {

  // ---- Private: ambil data dari localStorage ----
  function _getData() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.data)) || [];
    } catch { return []; }
  }

  // ---- Private: simpan data ke localStorage ----
  function _saveData(data) {
    localStorage.setItem(STORAGE_KEYS.data, JSON.stringify(data));
  }

  // =============================================
  // AUTH
  // =============================================

  /** Login: cek username & password, simpan sesi */
  function login(username, password) {
    const user = USERS.find(u => u.username === username && u.password === password);
    if (user) {
      const session = { username: user.username, nama: user.nama, role: user.role };
      localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(session));
      return session;
    }
    return null;
  }

  /** Ambil user yang sedang login */
  function getCurrentUser() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.user));
    } catch { return null; }
  }

  /** Logout */
  function logout() {
    localStorage.removeItem(STORAGE_KEYS.user);
    window.location.href = 'index.html';
  }

  // =============================================
  // TOAST NOTIFICATIONS
  // =============================================
  const TOAST_ICONS = {
    success: 'fa-solid fa-circle-check',
    error:   'fa-solid fa-circle-xmark',
    warning: 'fa-solid fa-triangle-exclamation',
    info:    'fa-solid fa-circle-info',
  };

  function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toastContainer');
    if (!container) {
      // Untuk halaman login, buat container sementara
      const tmp = document.createElement('div');
      tmp.id = 'toastContainer';
      tmp.className = 'toast-container';
      document.body.appendChild(tmp);
    }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `
      <i class="${TOAST_ICONS[type] || TOAST_ICONS.info} toast-icon"></i>
      <span class="toast-msg">${message}</span>
      <button class="toast-close" onclick="this.parentElement.remove()"><i class="fa-solid fa-xmark"></i></button>
    `;
    document.getElementById('toastContainer').appendChild(el);
    setTimeout(() => {
      el.classList.add('removing');
      setTimeout(() => el.remove(), 300);
    }, duration);
  }

  // =============================================
  // SECTION NAVIGATION
  // =============================================
  function showSection(name) {
    // Sembunyikan semua section
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    // Tampilkan section yang dipilih
    const sec = document.getElementById(`sec-${name}`);
    if (sec) sec.classList.add('active');

    // Aktifkan nav item
    const nav = document.querySelector(`.nav-item[data-section="${name}"]`);
    if (nav) nav.classList.add('active');

    // Update topbar title
    const titles = {
      dashboard: 'Dashboard', form: 'Input Data',
      history: 'Riwayat Pembagian', qr: 'QR Code Kelas', export: 'Export Data'
    };
    document.getElementById('topbarTitle').textContent = titles[name] || name;

    // Tutup sidebar di mobile
    closeSidebar();

    // Refresh konten berdasarkan section
    if (name === 'dashboard') refreshDashboard();
    if (name === 'history')   renderTable();
    if (name === 'export')    updateExportStats();
  }

  // =============================================
  // SIDEBAR (MOBILE)
  // =============================================
  function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebarOverlay').classList.add('open');
  }
  function closeSidebar() {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebarOverlay')?.classList.remove('open');
  }

  // =============================================
  // DASHBOARD: Statistik & Charts
  // =============================================
  let chartBar = null;
  let chartDoughnut = null;

  function refreshDashboard() {
    const today = new Date().toISOString().slice(0, 10);
    const allData = _getData();
    const todayData = allData.filter(r => r.tanggal === today);

    // Hitung statistik hari ini
    const totalDiterima   = todayData.reduce((s, r) => s + Number(r.diterima), 0);
    const totalDibagikan  = todayData.reduce((s, r) => s + Number(r.dibagikan), 0);
    const totalSisa       = todayData.reduce((s, r) => s + Number(r.sisa), 0);
    const kelasSet        = new Set(todayData.map(r => r.kelas));

    // Update stat cards
    animateNumber('cardTotal',     totalDiterima);
    animateNumber('cardDibagikan', totalDibagikan);
    animateNumber('cardSisa',      totalSisa);
    animateNumber('cardKelas',     kelasSet.size);

    // Update tanggal
    const el = document.getElementById('dashDate');
    if (el) el.textContent = formatDate(today);

    // Charts
    updateBarChart(todayData);
    updateDoughnutChart(allData);
    renderRecentList(allData);
  }

  /** Animasikan angka dari 0 ke target */
  function animateNumber(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    let current = 0;
    const step = Math.ceil(target / 20) || 1;
    const timer = setInterval(() => {
      current = Math.min(current + step, target);
      el.textContent = current;
      if (current >= target) clearInterval(timer);
    }, 40);
  }

  /** Bar chart: distribusi per kelas hari ini */
  function updateBarChart(data) {
    const ctx = document.getElementById('chartBar')?.getContext('2d');
    if (!ctx) return;

    // Grup per kelas
    const kelasMap = {};
    data.forEach(r => {
      if (!kelasMap[r.kelas]) kelasMap[r.kelas] = { diterima: 0, dibagikan: 0 };
      kelasMap[r.kelas].diterima  += Number(r.diterima);
      kelasMap[r.kelas].dibagikan += Number(r.dibagikan);
    });
    const labels   = Object.keys(kelasMap);
    const diterima = labels.map(k => kelasMap[k].diterima);
    const dibagikan = labels.map(k => kelasMap[k].dibagikan);

    if (chartBar) chartBar.destroy();
    chartBar = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels.length ? labels : ['Belum ada data'],
        datasets: [
          { label: 'Diterima',  data: labels.length ? diterima  : [0], backgroundColor: '#355872', borderRadius: 6 },
          { label: 'Dibagikan', data: labels.length ? dibagikan : [0], backgroundColor: '#9CD5FF', borderRadius: 6 },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { stepSize: 1 } }
        }
      }
    });
  }

  /** Doughnut chart: status selesai vs tidak sesuai */
  function updateDoughnutChart(data) {
    const ctx = document.getElementById('chartDoughnut')?.getContext('2d');
    if (!ctx) return;
    const selesai     = data.filter(r => r.status === 'Selesai').length;
    const tidakSesuai = data.filter(r => r.status === 'Tidak Sesuai').length;

    if (chartDoughnut) chartDoughnut.destroy();
    chartDoughnut = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Selesai', 'Tidak Sesuai'],
        datasets: [{
          data: [selesai || 0, tidakSesuai || 0],
          backgroundColor: ['#27ae60', '#e74c3c'],
          borderWidth: 0,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw} entri` } }
        },
        cutout: '68%',
      }
    });
  }

  /** Render daftar aktivitas terbaru */
  function renderRecentList(allData) {
    const container = document.getElementById('recentList');
    if (!container) return;
    if (!allData.length) {
      container.innerHTML = '<p class="empty-state">Belum ada data.</p>';
      return;
    }
    const recent = [...allData].reverse().slice(0, 6);
    container.innerHTML = recent.map(r => `
      <div class="recent-item">
        <div class="recent-dot ${r.status === 'Selesai' ? 'selesai' : 'tidak-sesuai'}"></div>
        <div class="recent-info">
          <div class="recent-kelas">${r.kelas}</div>
          <div class="recent-meta">${r.namaGuru} · ${formatDate(r.tanggal)} · ${r.waktuInput}</div>
        </div>
        <span class="recent-badge ${r.status === 'Selesai' ? 'badge-selesai' : 'badge-tidak-sesuai'}">${r.status}</span>
      </div>
    `).join('');
  }

  // =============================================
  // FORM INPUT
  // =============================================
  function initForm() {
    const user = getCurrentUser();
    if (!user) return;

    // Isi nama guru otomatis
    const fNama = document.getElementById('fNamaGuru');
    if (fNama) fNama.value = user.nama;

    // Set tanggal default hari ini
    const fTanggal = document.getElementById('fTanggal');
    if (fTanggal) fTanggal.value = new Date().toISOString().slice(0, 10);

    // Event: hitung sisa otomatis saat diterima/dibagikan berubah
    document.getElementById('fDiterima')?.addEventListener('input', hitungSisa);
    document.getElementById('fDibagikan')?.addEventListener('input', hitungSisa);

    // Event: preview foto
    document.getElementById('fotoBukti')?.addEventListener('change', previewFoto);

    // Event: submit form
    document.getElementById('mbgForm')?.addEventListener('submit', submitForm);

    // Ripple effect pada tombol submit
    document.getElementById('btnSubmit')?.addEventListener('click', createRipple);
  }

  /** Hitung sisa = diterima - dibagikan, validasi otomatis */
  function hitungSisa() {
    const diterima  = parseInt(document.getElementById('fDiterima').value)  || 0;
    const dibagikan = parseInt(document.getElementById('fDibagikan').value) || 0;
    const sisa      = diterima - dibagikan;
    const sisaEl    = document.getElementById('sisaVal');
    const sisaDisp  = document.getElementById('sisaDisplay');
    const sisaStat  = document.getElementById('sisaStatus');
    const warning   = document.getElementById('formWarning');
    const warnTxt   = document.getElementById('warningText');

    if (!document.getElementById('fDiterima').value && !document.getElementById('fDibagikan').value) {
      sisaEl.textContent = '—';
      sisaDisp.className = 'sisa-display';
      sisaStat.textContent = '';
      warning.classList.add('hidden');
      return;
    }

    sisaEl.textContent = sisa;

    if (sisa < 0) {
      // Dibagikan melebihi diterima — tidak valid
      sisaDisp.className = 'sisa-display warning';
      sisaStat.textContent = '⚠ Jumlah dibagikan melebihi diterima!';
      sisaStat.style.color = 'var(--danger)';
      warning.classList.remove('hidden');
      warnTxt.textContent = 'Jumlah dibagikan tidak boleh melebihi jumlah diterima.';
    } else if (sisa === 0) {
      sisaDisp.className = 'sisa-display ok';
      sisaStat.textContent = '✓ Semua ompreng sudah dibagikan';
      sisaStat.style.color = 'var(--success)';
      warning.classList.add('hidden');
    } else {
      sisaDisp.className = 'sisa-display ok';
      sisaStat.textContent = `✓ Sisa ${sisa} ompreng`;
      sisaStat.style.color = 'var(--success)';
      warning.classList.add('hidden');
    }
  }

  /** Preview foto yang diupload */
  function previewFoto(e) {
    const file = e.target.files[0];
    const preview = document.getElementById('fotoPreview');
    const placeholder = document.getElementById('uploadPlaceholder');
    if (file && preview) {
      const reader = new FileReader();
      reader.onload = ev => {
        preview.src = ev.target.result;
        preview.classList.remove('hidden');
        placeholder.classList.add('hidden');
      };
      reader.readAsDataURL(file);
    }
  }

  /** Submit form: validasi → simpan lokal → kirim ke Google Sheets */
  async function submitForm(e) {
    e.preventDefault();
    const user      = getCurrentUser();
    const tanggal   = document.getElementById('fTanggal').value;
    const kelas     = document.getElementById('fKelas').value;
    const diterima  = parseInt(document.getElementById('fDiterima').value);
    const dibagikan = parseInt(document.getElementById('fDibagikan').value);
    const sisa      = diterima - dibagikan;

    // Validasi
    if (!kelas) { showToast('Pilih kelas terlebih dahulu!', 'warning'); return; }
    if (isNaN(diterima) || isNaN(dibagikan)) { showToast('Isi jumlah diterima dan dibagikan!', 'warning'); return; }
    if (sisa < 0) { showToast('Jumlah dibagikan melebihi diterima!', 'error'); return; }

    // Status otomatis
    const status = (diterima === dibagikan + sisa && sisa >= 0) ? 'Selesai' : 'Tidak Sesuai';

    // Buat objek data
    const now = new Date();
    const record = {
      id:         Date.now(),
      tanggal,
      namaGuru:   user.nama,
      kelas,
      diterima,
      dibagikan,
      sisa,
      status,
      waktuInput: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    };

    // Loading state
    const btn     = document.getElementById('btnSubmit');
    const btnText = btn.querySelector('.btn-text');
    const btnLoad = btn.querySelector('.btn-loader');
    btn.disabled  = true;
    btnText.classList.add('hidden');
    btnLoad.classList.remove('hidden');

    // Simpan ke localStorage
    const allData = _getData();
    allData.push(record);
    _saveData(allData);

    // Coba kirim ke Google Apps Script (jika URL sudah dikonfigurasi)
    if (APPS_SCRIPT_URL && !APPS_SCRIPT_URL.includes('GANTI')) {
      try {
        await fetch(APPS_SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify(record),
          mode: 'no-cors', // Google Apps Script memerlukan no-cors
        });
      } catch (err) {
        console.warn('Gagal kirim ke Google Sheets:', err);
      }
    }

    // Simulasi loading 800ms
    await new Promise(r => setTimeout(r, 800));

    // Reset form
    btn.disabled = false;
    btnText.classList.remove('hidden');
    btnLoad.classList.add('hidden');
    document.getElementById('mbgForm').reset();
    document.getElementById('fNamaGuru').value = user.nama;
    document.getElementById('fTanggal').value  = new Date().toISOString().slice(0, 10);
    document.getElementById('fotoPreview').classList.add('hidden');
    document.getElementById('uploadPlaceholder').classList.remove('hidden');
    document.getElementById('sisaVal').textContent = '—';
    document.getElementById('sisaDisplay').className = 'sisa-display';
    document.getElementById('formWarning').classList.add('hidden');

    showToast(`Data kelas ${kelas} berhasil disimpan!`, 'success');
    setTimeout(() => showSection('dashboard'), 1200);
  }

  // =============================================
  // RIWAYAT / TABEL DATA
  // =============================================

  /** Render tabel dengan filter & search */
  function renderTable() {
    const allData  = _getData();
    const search   = document.getElementById('searchInput')?.value.toLowerCase()  || '';
    const dateFilter = document.getElementById('filterDate')?.value   || '';
    const kelasFilter = document.getElementById('filterKelas')?.value || '';

    let filtered = allData.filter(r => {
      const matchSearch = !search
        || r.kelas.toLowerCase().includes(search)
        || r.namaGuru.toLowerCase().includes(search)
        || r.status.toLowerCase().includes(search);
      const matchDate  = !dateFilter   || r.tanggal === dateFilter;
      const matchKelas = !kelasFilter  || r.kelas   === kelasFilter;
      return matchSearch && matchDate && matchKelas;
    });

    const tbody = document.getElementById('tableBody');
    const info  = document.getElementById('tableInfo');
    if (!tbody) return;

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Tidak ada data yang cocok.</td></tr>';
      if (info) info.textContent = '';
      return;
    }

    tbody.innerHTML = [...filtered].reverse().map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${formatDate(r.tanggal)}</td>
        <td>${r.namaGuru}</td>
        <td><strong>${r.kelas}</strong></td>
        <td>${r.diterima}</td>
        <td>${r.dibagikan}</td>
        <td>${r.sisa}</td>
        <td><span class="badge ${r.status === 'Selesai' ? 'badge-ok' : 'badge-warning'}">${r.status}</span></td>
        <td>${r.waktuInput}</td>
      </tr>
    `).join('');

    if (info) info.textContent = `Menampilkan ${filtered.length} dari ${allData.length} entri`;
  }

  // =============================================
  // QR CODE
  // =============================================
  function generateQR() {
    const kelas = document.getElementById('qrKelas').value;
    if (!kelas) { showToast('Pilih kelas terlebih dahulu!', 'warning'); return; }

    const qrBox    = document.getElementById('qrBox');
    const qrLabel  = document.getElementById('qrLabel');
    const qrResult = document.getElementById('qrResult');

    // Bersihkan QR lama
    qrBox.innerHTML = '';
    qrLabel.textContent = `Kelas ${kelas}`;

    // Data QR: info kelas + URL aplikasi
    const qrData = `MBG Tracker | Kelas: ${kelas} | ${new Date().toLocaleDateString('id-ID')}`;

    new QRCode(qrBox, {
      text: qrData,
      width: 200, height: 200,
      colorDark: '#355872', colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M,
    });

    qrResult.classList.remove('hidden');
    showToast(`QR Code kelas ${kelas} berhasil dibuat!`, 'success');
  }

  /** Download QR Code */
  function downloadQR() {
    const canvas = document.querySelector('#qrBox canvas');
    const img    = document.querySelector('#qrBox img');
    if (!canvas && !img) { showToast('Generate QR terlebih dahulu!', 'warning'); return; }
    const kelas = document.getElementById('qrKelas').value;
    const src = canvas ? canvas.toDataURL('image/png') : img.src;
    const a = document.createElement('a');
    a.href = src;
    a.download = `QR_MBG_${kelas.replace(/ /g,'_')}.png`;
    a.click();
  }

  // =============================================
  // EXPORT DATA
  // =============================================

  /** Export ke CSV */
  function exportCSV() {
    const data = _getData();
    if (!data.length) { showToast('Tidak ada data untuk diexport!', 'warning'); return; }
    const headers = ['Tanggal','Nama Guru','Kelas','Jumlah Diterima','Jumlah Dibagikan','Sisa','Status','Waktu Input'];
    const rows = data.map(r => [
      r.tanggal, r.namaGuru, r.kelas, r.diterima, r.dibagikan, r.sisa, r.status, r.waktuInput
    ].map(v => `"${v}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MBG_Tracker_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Data berhasil diexport ke CSV!', 'success');
  }

  /** Export ke Excel (format CSV dengan BOM, dibuka Excel) */
  function exportExcel() {
    // Untuk export Excel native perlu library seperti SheetJS
    // Versi sederhana: export CSV yang kompatibel Excel
    exportCSV();
    showToast('File CSV siap dibuka di Excel!', 'info');
  }

  /** Update statistik di halaman export */
  function updateExportStats() {
    const data = _getData();
    const today = new Date().toISOString().slice(0, 10);
    const todayData = data.filter(r => r.tanggal === today);
    const el = document.getElementById('exportStats');
    if (el) {
      el.innerHTML = `
        <strong>${data.length}</strong> total entri<br>
        <strong>${todayData.length}</strong> entri hari ini<br>
        <strong>${new Set(data.map(r => r.kelas)).size}</strong> kelas tercatat
      `;
    }
  }

  // =============================================
  // UTILITIES
  // =============================================

  /** Format tanggal Indonesia: "Senin, 1 Januari 2024" */
  function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('id-ID', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  }

  /** Ripple effect pada button */
  function createRipple(e) {
    const btn  = e.currentTarget;
    const circle = document.createElement('span');
    const diameter = Math.max(btn.clientWidth, btn.clientHeight);
    const rect = btn.getBoundingClientRect();
    circle.className = 'ripple';
    circle.style.cssText = `width:${diameter}px;height:${diameter}px;left:${e.clientX-rect.left-diameter/2}px;top:${e.clientY-rect.top-diameter/2}px`;
    btn.querySelector('.ripple')?.remove();
    btn.appendChild(circle);
  }

  // =============================================
  // INIT DASHBOARD
  // =============================================
  function initDashboard() {
    const user = getCurrentUser();
    if (!user) { window.location.href = 'index.html'; return; }

    // Isi info user
    const initials = user.nama.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    document.getElementById('sidebarAvatar').textContent = initials;
    document.getElementById('sidebarName').textContent   = user.nama;
    document.getElementById('topbarUser').textContent    = user.nama.split(' ')[0];
    document.getElementById('topbarDate').textContent    = new Date().toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

    // Init form
    initForm();

    // Sidebar toggle
    document.getElementById('sidebarToggle')?.addEventListener('click', openSidebar);
    document.getElementById('sidebarClose')?.addEventListener('click', closeSidebar);
    document.getElementById('sidebarOverlay')?.addEventListener('click', closeSidebar);

    // Nav items
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', e => {
        e.preventDefault();
        showSection(item.dataset.section);
      });
    });

    // Delegate link-all di recent activity
    document.querySelectorAll('.link-all').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        showSection(link.dataset.section || 'history');
      });
    });

    // Logout
    document.getElementById('btnLogout')?.addEventListener('click', logout);

    // Search & filter tabel
    document.getElementById('searchInput')?.addEventListener('input', renderTable);
    document.getElementById('filterDate')?.addEventListener('change', renderTable);
    document.getElementById('filterKelas')?.addEventListener('change', renderTable);
    document.getElementById('btnClearFilter')?.addEventListener('click', () => {
      document.getElementById('searchInput').value  = '';
      document.getElementById('filterDate').value   = '';
      document.getElementById('filterKelas').value  = '';
      renderTable();
    });

    // QR generate & download
    document.getElementById('btnGenerateQR')?.addEventListener('click', generateQR);
    document.getElementById('btnDownloadQR')?.addEventListener('click', downloadQR);

    // Load awal dashboard
    showSection('dashboard');
  }

  // =============================================
  // PUBLIC API
  // =============================================
  return {
    login, getCurrentUser, logout,
    initDashboard,
    showSection,
    showToast,
    exportCSV, exportExcel,
    refreshDashboard,
  };

})();

// =============================================
// GLOBAL: showToast untuk dipakai di login page
// =============================================
function showToast(msg, type) {
  MBG.showToast(msg, type);
}
