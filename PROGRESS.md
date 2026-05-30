# 🏫 SMP PGRI 1 CIDAHU — Portal Sekolah v2.1 (Fixed)

## ✅ Yang Sudah Difix

| Masalah | Solusi |
|---------|--------|
| `@clerk/clerk-sdk-node` error | Dihapus dari server — Clerk hanya jalan di frontend (browser JS) |
| `svix` tidak diperlukan | Dihapus dari dependencies |
| DB path error di Railway | Path otomatis buat folder `data/` jika belum ada |
| `require('@clerk/clerk-sdk-node')` crash | Server jalan 100% tanpa Clerk SDK |
| Clerk UI error jika key kosong | Ada fallback UI jika Clerk belum dikonfigurasi |

---

## 🚀 CARA UPLOAD KE GITHUB + RAILWAY (via Termux)

### Langkah 1 — Hapus semua file di repo GitHub lama (jika ada)

```bash
# Di Termux, masuk ke folder repo lama
cd ~/nama-folder-repo-lama

# Hapus semua file KECUALI .git
find . -not -path './.git*' -not -name '.' -delete

# Commit penghapusan
git add -A
git commit -m "chore: reset repo"
git push origin main
```

> ⚠️ Kalau belum punya repo, skip langkah ini dan lanjut ke Langkah 2.

---

### Langkah 2 — Setup & upload project baru

```bash
# Install git di Termux (jika belum)
pkg install git -y

# Konfigurasi git (ganti dengan data kamu)
git config --global user.name "NamaKamu"
git config --global user.email "email@gmail.com"

# Masuk ke folder project (setelah unzip)
cd ~
unzip smp-pgri-1-cidahu-fixed.zip
cd sekolah-app

# Inisialisasi git
git init
git add .
git commit -m "feat: portal sekolah SMP PGRI 1 CIDAHU v2.1"
git branch -M main

# Hubungkan ke GitHub (ganti USERNAME dan REPO)
git remote add origin https://github.com/USERNAME/REPO.git
git push -u origin main
```

> Kalau diminta login GitHub di Termux, gunakan **Personal Access Token** (bukan password).
> Buat token di: GitHub → Settings → Developer Settings → Personal Access Tokens → Tokens (classic)

---

### Langkah 3 — Deploy ke Railway

1. Buka [railway.app](https://railway.app) → Login
2. **New Project** → **Deploy from GitHub repo**
3. Pilih repo `smp-pgri-1-cidahu`
4. Railway otomatis detect Node.js dan build

**Set Environment Variables di Railway:**
```
SESSION_SECRET   = buat_string_acak_panjang_minimal_32_karakter
```

**Opsional (untuk login Google via Clerk):**
```
CLERK_PUBLISHABLE_KEY = pk_live_xxxxx
CLERK_SECRET_KEY      = sk_live_xxxxx
```

> Tanpa Clerk, app tetap berjalan normal. Login Google hanya dinonaktifkan.

---

## 🔑 Admin Default
```
URL      : /admin/login
Username : admin
Password : admin123
```
⚠️ **Segera ganti password setelah pertama login!**

---

## 📋 Cara Setup Clerk (Opsional)

1. Buka [clerk.com](https://clerk.com) → Create Account → Create Application
2. Nama app: `SMP PGRI 1 CIDAHU`
3. Aktifkan **Google** sebagai social login
4. Salin **Publishable Key** dan **Secret Key**
5. Tambahkan ke Railway sebagai env variable (lihat Langkah 3)
6. Di Clerk Dashboard → **Allowed redirect URLs**, tambahkan URL Railway kamu

