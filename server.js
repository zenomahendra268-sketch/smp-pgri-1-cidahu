const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const multer = require('multer');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// Clerk keys (opsional — app tetap jalan tanpa Clerk)
const CLERK_PUBLISHABLE_KEY = process.env.CLERK_PUBLISHABLE_KEY || '';
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || '';

// ─── Database ─────────────────────────────────────────────────
// Railway pakai /tmp untuk volume sementara, atau gunakan path lokal
const DB_DIR = process.env.DB_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
const DB_PATH = path.join(DB_DIR, 'sekolah.db');
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS laporan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kode_tracking TEXT UNIQUE,
    nama_pelapor TEXT NOT NULL,
    email_pelapor TEXT,
    kelas TEXT NOT NULL,
    kategori TEXT NOT NULL,
    judul TEXT NOT NULL,
    deskripsi TEXT NOT NULL,
    foto TEXT,
    status TEXT DEFAULT 'baru',
    catatan_admin TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS masukan_guru (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT NOT NULL,
    email TEXT,
    kelas TEXT,
    nama_guru TEXT NOT NULL,
    mata_pelajaran TEXT NOT NULL,
    pesan TEXT NOT NULL,
    rating INTEGER DEFAULT 5,
    reply_admin TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS pengumuman (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    judul TEXT NOT NULL,
    isi TEXT NOT NULL,
    penting INTEGER DEFAULT 0,
    dibuat_oleh TEXT DEFAULT 'Admin',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS admin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    nama TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Admin default
const adminExist = db.prepare('SELECT id FROM admin WHERE username = ?').get('admin');
if (!adminExist) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO admin (username, password, nama) VALUES (?,?,?)').run('admin', hash, 'Administrator');
  console.log('✅ Admin default dibuat: username=admin password=admin123');
}

// ─── Upload ───────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `foto_${Date.now()}_${Math.random().toString(36).slice(2,6)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Hanya file gambar yang diizinkan'));
  }
});

// ─── Helpers ──────────────────────────────────────────────────
function generateKode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let kode = 'RPT-';
  for (let i = 0; i < 6; i++) kode += chars[Math.floor(Math.random() * chars.length)];
  return kode;
}

function getStatsKategori() {
  const rows = db.prepare('SELECT kategori, COUNT(*) as c FROM laporan GROUP BY kategori').all();
  const obj = {};
  rows.forEach(r => obj[r.kategori] = r.c);
  return obj;
}

// ─── Clerk Auth Middleware (opsional) ─────────────────────────
// Verifikasi token Clerk secara manual tanpa SDK server
async function verifyClerkToken(req) {
  if (!CLERK_SECRET_KEY || !req.headers.authorization) return null;
  try {
    const token = req.headers.authorization.replace('Bearer ', '');
    // Gunakan Clerk JWKS endpoint untuk verifikasi
    return null; // Placeholder — user info dari cookie Clerk di frontend
  } catch { return null; }
}

// Middleware untuk inject Clerk vars ke semua views
const clerkVars = (req, res, next) => {
  res.locals.clerkPublishableKey = CLERK_PUBLISHABLE_KEY;
  res.locals.clerkEnabled = !!CLERK_PUBLISHABLE_KEY;
  next();
};

// ─── Middleware ───────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'smpPGRI1Cidahu_rahasia_2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000, secure: false }
}));
app.use(clerkVars);

const requireAdmin = (req, res, next) => {
  if (req.session.admin) return next();
  res.redirect('/admin/login');
};

// ─── Auth Pages ───────────────────────────────────────────────
app.get('/masuk', (req, res) => res.render('masuk'));
app.get('/daftar', (req, res) => res.render('daftar'));

// ─── Public Routes ────────────────────────────────────────────
app.get('/', (req, res) => {
  const totalLaporan = db.prepare('SELECT COUNT(*) as c FROM laporan').get().c;
  const totalMasukan = db.prepare('SELECT COUNT(*) as c FROM masukan_guru').get().c;
  res.render('index', { totalLaporan, totalMasukan, activePage: 'home' });
});

// Laporan
app.get('/laporan', (req, res) => {
  res.render('laporan', { sukses: null, error: null, kode: null, activePage: 'laporan' });
});

app.post('/laporan', upload.array('foto', 3), (req, res) => {
  try {
    const { nama_pelapor, kelas, kategori, judul, deskripsi } = req.body;
    if (!nama_pelapor || !kelas || !kategori || !judul || !deskripsi)
      return res.render('laporan', { sukses: null, error: 'Semua kolom wajib diisi!', kode: null, activePage: 'laporan' });

    const fotos = req.files?.map(f => `/uploads/${f.filename}`).join(',') || null;
    let kode = generateKode();
    while (db.prepare('SELECT id FROM laporan WHERE kode_tracking = ?').get(kode)) kode = generateKode();

    db.prepare('INSERT INTO laporan (kode_tracking, nama_pelapor, kelas, kategori, judul, deskripsi, foto) VALUES (?,?,?,?,?,?,?)')
      .run(kode, nama_pelapor.trim(), kelas.trim(), kategori, judul.trim(), deskripsi.trim(), fotos);

    res.render('laporan', { sukses: 'Laporan berhasil dikirim!', error: null, kode, activePage: 'laporan' });
  } catch (err) {
    console.error('Error submit laporan:', err);
    res.render('laporan', { sukses: null, error: 'Terjadi kesalahan, coba lagi.', kode: null, activePage: 'laporan' });
  }
});

// Masukan Guru
app.get('/masukan-guru', (req, res) => res.render('masukan_guru', { sukses: null, error: null, activePage: 'masukan' }));

app.post('/masukan-guru', (req, res) => {
  const { nama, kelas, nama_guru, mata_pelajaran, pesan, rating } = req.body;
  if (!nama || !nama_guru || !mata_pelajaran || !pesan)
    return res.render('masukan_guru', { sukses: null, error: 'Semua kolom wajib diisi!', activePage: 'masukan' });
  db.prepare('INSERT INTO masukan_guru (nama, kelas, nama_guru, mata_pelajaran, pesan, rating) VALUES (?,?,?,?,?,?)')
    .run(nama.trim(), kelas || '-', nama_guru.trim(), mata_pelajaran.trim(), pesan.trim(), parseInt(rating) || 5);
  res.render('masukan_guru', { sukses: 'Masukan berhasil dikirim! Terima kasih.', error: null, activePage: 'masukan' });
});

// Pengumuman (dihapus dari publik, redirect ke home)
app.get('/pengumuman', (req, res) => res.redirect('/'));

// Cek Laporan
app.get('/cek-laporan', (req, res) => {
  const { kode } = req.query;
  if (!kode) return res.render('cek_laporan', { laporan: null, error: null, kode: '', activePage: 'cek' });
  const laporan = db.prepare('SELECT * FROM laporan WHERE kode_tracking = ?').get(kode.toUpperCase().trim());
  if (!laporan) return res.render('cek_laporan', { laporan: null, error: 'Kode tidak ditemukan. Periksa kembali.', kode, activePage: 'cek' });
  const safeData = { ...laporan, nama_pelapor: '***' };
  res.render('cek_laporan', { laporan: safeData, error: null, kode, activePage: 'cek' });
});

// ─── Admin Auth ───────────────────────────────────────────────
app.get('/admin/login', (req, res) => {
  if (req.session.admin) return res.redirect('/admin/dashboard');
  res.render('admin/login', { error: null });
});

app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  const admin = db.prepare('SELECT * FROM admin WHERE username = ?').get(username);
  if (admin && bcrypt.compareSync(password, admin.password)) {
    req.session.admin = { id: admin.id, username: admin.username, nama: admin.nama };
    return res.redirect('/admin/dashboard');
  }
  res.render('admin/login', { error: 'Username atau password salah!' });
});

app.get('/admin/logout', (req, res) => { req.session.destroy(); res.redirect('/admin/login'); });

// ─── Admin Dashboard ──────────────────────────────────────────
app.get('/admin/dashboard', requireAdmin, (req, res) => {
  const stats = {
    total: db.prepare('SELECT COUNT(*) as c FROM laporan').get().c,
    baru: db.prepare("SELECT COUNT(*) as c FROM laporan WHERE status='baru'").get().c,
    proses: db.prepare("SELECT COUNT(*) as c FROM laporan WHERE status='proses'").get().c,
    selesai: db.prepare("SELECT COUNT(*) as c FROM laporan WHERE status='selesai'").get().c,
    ditolak: db.prepare("SELECT COUNT(*) as c FROM laporan WHERE status='ditolak'").get().c,
    masukan: db.prepare('SELECT COUNT(*) as c FROM masukan_guru').get().c,
    perKategori: getStatsKategori(),
  };
  const laporanTerbaru = db.prepare('SELECT * FROM laporan ORDER BY created_at DESC LIMIT 5').all();
  res.render('admin/dashboard', { stats, laporanTerbaru, admin: req.session.admin });
});

// ─── Admin Laporan ────────────────────────────────────────────
app.get('/admin/laporan', requireAdmin, (req, res) => {
  const { kategori, status, search } = req.query;
  let query = 'SELECT * FROM laporan WHERE 1=1';
  const params = [];
  if (kategori) { query += ' AND kategori = ?'; params.push(kategori); }
  if (status) { query += ' AND status = ?'; params.push(status); }
  if (search) { query += ' AND (judul LIKE ? OR nama_pelapor LIKE ? OR deskripsi LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  query += ' ORDER BY created_at DESC';
  const laporan = db.prepare(query).all(...params);
  const statsBar = { baru: db.prepare("SELECT COUNT(*) as c FROM laporan WHERE status='baru'").get().c };
  res.render('admin/laporan', { laporan, admin: req.session.admin, filter: { kategori, status, search }, stats: statsBar });
});

app.get('/admin/laporan/export', requireAdmin, (req, res) => {
  const { format, kategori, status } = req.query;
  let query = 'SELECT * FROM laporan WHERE 1=1';
  const params = [];
  if (kategori) { query += ' AND kategori = ?'; params.push(kategori); }
  if (status) { query += ' AND status = ?'; params.push(status); }
  query += ' ORDER BY created_at DESC';
  const laporan = db.prepare(query).all(...params);

  if (format === 'csv') {
    const header = 'ID,Kode,Nama Pelapor,Kelas,Kategori,Judul,Status,Tanggal\n';
    const rows = laporan.map(l =>
      `${l.id},"${l.kode_tracking||''}","${l.nama_pelapor}","${l.kelas}","${l.kategori}","${l.judul.replace(/"/g,'""')}","${l.status}","${l.created_at}"`
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="laporan_${Date.now()}.csv"`);
    return res.send('\uFEFF' + header + rows);
  }

  if (format === 'pdf') {
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>body{font-family:Arial;font-size:12px}h1{color:#4F7254}table{width:100%;border-collapse:collapse}
    th{background:#4F7254;color:white;padding:8px;text-align:left}td{padding:6px;border-bottom:1px solid #ddd}
    tr:nth-child(even){background:#f9f9f9}</style></head><body>
    <h1>Laporan SMP PGRI 1 CIDAHU</h1>
    <p>Dicetak: ${new Date().toLocaleDateString('id-ID',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</p>
    <table><thead><tr><th>#</th><th>Kode</th><th>Pelapor</th><th>Kelas</th><th>Kategori</th><th>Judul</th><th>Status</th><th>Tanggal</th></tr></thead>
    <tbody>${laporan.map((l,i)=>`<tr><td>${i+1}</td><td>${l.kode_tracking||'-'}</td><td>${l.nama_pelapor}</td><td>${l.kelas}</td><td>${l.kategori}</td><td>${l.judul}</td><td>${l.status}</td><td>${new Date(l.created_at).toLocaleDateString('id-ID')}</td></tr>`).join('')}
    </tbody></table><p style="margin-top:20px;color:#888">Total: ${laporan.length} laporan</p></body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="laporan_${Date.now()}.html"`);
    return res.send(html);
  }
  res.redirect('/admin/laporan');
});

app.get('/admin/laporan/:id', requireAdmin, (req, res) => {
  const laporan = db.prepare('SELECT * FROM laporan WHERE id = ?').get(req.params.id);
  if (!laporan) return res.redirect('/admin/laporan');
  res.render('admin/detail_laporan', { laporan, admin: req.session.admin });
});

app.post('/admin/laporan/:id/update', requireAdmin, (req, res) => {
  const { status, catatan_admin } = req.body;
  db.prepare('UPDATE laporan SET status=?, catatan_admin=? WHERE id=?').run(status, catatan_admin || '', req.params.id);
  res.redirect(`/admin/laporan/${req.params.id}`);
});

app.post('/admin/laporan/:id/hapus', requireAdmin, (req, res) => {
  const laporan = db.prepare('SELECT foto FROM laporan WHERE id = ?').get(req.params.id);
  if (laporan?.foto) {
    laporan.foto.split(',').filter(Boolean).forEach(f => {
      const p = path.join(__dirname, 'public', f.trim());
      if (fs.existsSync(p)) fs.unlinkSync(p);
    });
  }
  db.prepare('DELETE FROM laporan WHERE id = ?').run(req.params.id);
  res.redirect('/admin/laporan');
});

// ─── Admin Masukan Guru ───────────────────────────────────────
app.get('/admin/masukan-guru', requireAdmin, (req, res) => {
  const masukan = db.prepare('SELECT * FROM masukan_guru ORDER BY created_at DESC').all();
  res.render('admin/masukan_guru', { masukan, admin: req.session.admin });
});

app.post('/admin/masukan-guru/:id/reply', requireAdmin, (req, res) => {
  db.prepare('UPDATE masukan_guru SET reply_admin=? WHERE id=?').run(req.body.reply || '', req.params.id);
  res.redirect('/admin/masukan-guru');
});

app.post('/admin/masukan-guru/:id/hapus', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM masukan_guru WHERE id = ?').run(req.params.id);
  res.redirect('/admin/masukan-guru');
});

// ─── Admin Rekap Guru ─────────────────────────────────────────
app.get('/admin/rekap-guru', requireAdmin, (req, res) => {
  const rekapGuru = db.prepare(`
    SELECT nama_guru, mata_pelajaran, COUNT(*) as jumlah, AVG(rating) as avg_rating,
      SUM(CASE WHEN rating=5 THEN 1 ELSE 0 END) as r5,
      SUM(CASE WHEN rating=4 THEN 1 ELSE 0 END) as r4,
      SUM(CASE WHEN rating=3 THEN 1 ELSE 0 END) as r3,
      SUM(CASE WHEN rating=2 THEN 1 ELSE 0 END) as r2,
      SUM(CASE WHEN rating=1 THEN 1 ELSE 0 END) as r1
    FROM masukan_guru GROUP BY nama_guru, mata_pelajaran ORDER BY avg_rating DESC
  `).all();
  res.render('admin/rekap_guru', { rekapGuru, admin: req.session.admin });
});

// ─── Admin Pengumuman ─────────────────────────────────────────
app.get('/admin/pengumuman', requireAdmin, (req, res) => {
  const pengumuman = db.prepare('SELECT * FROM pengumuman ORDER BY penting DESC, created_at DESC').all();
  res.render('admin/pengumuman', { pengumuman, admin: req.session.admin, sukses: req.query.sukses || null });
});

app.post('/admin/pengumuman/buat', requireAdmin, (req, res) => {
  const { judul, isi, penting } = req.body;
  if (!judul || !isi) return res.redirect('/admin/pengumuman');
  db.prepare('INSERT INTO pengumuman (judul, isi, penting, dibuat_oleh) VALUES (?,?,?,?)')
    .run(judul.trim(), isi.trim(), penting ? 1 : 0, req.session.admin.nama);
  res.redirect('/admin/pengumuman?sukses=Pengumuman+berhasil+dipublikasikan');
});

app.get('/admin/pengumuman/:id/edit', requireAdmin, (req, res) => {
  const pengumuman = db.prepare('SELECT * FROM pengumuman ORDER BY penting DESC, created_at DESC').all();
  const editPengumuman = db.prepare('SELECT * FROM pengumuman WHERE id = ?').get(req.params.id);
  res.render('admin/pengumuman', { pengumuman, editPengumuman, admin: req.session.admin, sukses: null });
});

app.post('/admin/pengumuman/:id/update', requireAdmin, (req, res) => {
  const { judul, isi, penting } = req.body;
  db.prepare('UPDATE pengumuman SET judul=?, isi=?, penting=? WHERE id=?').run(judul.trim(), isi.trim(), penting ? 1 : 0, req.params.id);
  res.redirect('/admin/pengumuman?sukses=Pengumuman+berhasil+diupdate');
});

app.post('/admin/pengumuman/:id/hapus', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM pengumuman WHERE id = ?').run(req.params.id);
  res.redirect('/admin/pengumuman?sukses=Pengumuman+berhasil+dihapus');
});

// ─── Admin Statistik ──────────────────────────────────────────
app.get('/admin/statistik', requireAdmin, (req, res) => {
  const stats = {
    total: db.prepare('SELECT COUNT(*) as c FROM laporan').get().c,
    baru: db.prepare("SELECT COUNT(*) as c FROM laporan WHERE status='baru'").get().c,
    proses: db.prepare("SELECT COUNT(*) as c FROM laporan WHERE status='proses'").get().c,
    selesai: db.prepare("SELECT COUNT(*) as c FROM laporan WHERE status='selesai'").get().c,
    ditolak: db.prepare("SELECT COUNT(*) as c FROM laporan WHERE status='ditolak'").get().c,
    perKategori: getStatsKategori(),
  };
  const bulanan = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0');
    const row = db.prepare("SELECT COUNT(*) as c FROM laporan WHERE strftime('%Y-%m', created_at) = ?").get(`${y}-${m}`);
    bulanan.push({ bulan: d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }), jumlah: row.c });
  }
  const perKelas = db.prepare('SELECT kelas, COUNT(*) as jumlah FROM laporan GROUP BY kelas ORDER BY jumlah DESC LIMIT 8').all();
  const statsGuru = db.prepare(`SELECT COUNT(*) as total, AVG(rating) as avgRating,
    SUM(CASE WHEN rating=5 THEN 1 ELSE 0 END) as r5, SUM(CASE WHEN rating=4 THEN 1 ELSE 0 END) as r4,
    SUM(CASE WHEN rating=3 THEN 1 ELSE 0 END) as r3, SUM(CASE WHEN rating=2 THEN 1 ELSE 0 END) as r2,
    SUM(CASE WHEN rating=1 THEN 1 ELSE 0 END) as r1 FROM masukan_guru`).get();
  res.render('admin/statistik', { stats, bulanan, perKelas, statsGuru, admin: req.session.admin });
});

// ─── Admin Ganti Password ─────────────────────────────────────
app.get('/admin/ganti-password', requireAdmin, (req, res) => {
  res.render('admin/ganti_password', { sukses: null, error: null, admin: req.session.admin });
});

app.post('/admin/ganti-password', requireAdmin, (req, res) => {
  const { password_lama, password_baru, konfirmasi_password } = req.body;
  const admin = db.prepare('SELECT * FROM admin WHERE id = ?').get(req.session.admin.id);
  if (!bcrypt.compareSync(password_lama, admin.password))
    return res.render('admin/ganti_password', { sukses: null, error: 'Password lama salah!', admin: req.session.admin });
  if (password_baru !== konfirmasi_password)
    return res.render('admin/ganti_password', { sukses: null, error: 'Konfirmasi password tidak cocok!', admin: req.session.admin });
  if (password_baru.length < 8)
    return res.render('admin/ganti_password', { sukses: null, error: 'Password minimal 8 karakter!', admin: req.session.admin });
  db.prepare('UPDATE admin SET password=? WHERE id=?').run(bcrypt.hashSync(password_baru, 10), req.session.admin.id);
  res.render('admin/ganti_password', { sukses: 'Password berhasil diubah!', error: null, admin: req.session.admin });
});

// ─── Error Handler ────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Terjadi kesalahan server. Silakan coba lagi.');
});

// ─── Start ────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🏫 SMP PGRI 1 CIDAHU berjalan di port ${PORT}`);
  if (!CLERK_SECRET_KEY) {
    console.log('ℹ️  Clerk tidak dikonfigurasi — login Google dinonaktifkan.');
    console.log('   Set CLERK_PUBLISHABLE_KEY & CLERK_SECRET_KEY di Railway untuk mengaktifkan.');
  }
});
