# Changelog Minecart Rush

## Skor Ulang Level dan Statistik Emas

Branch: `fix/score-retry` | Tanggal: 2026-11-18

- Masalah/tujuan: Skor dari percobaan gagal kebawa saat ulang level dan bikin catatan skor jadi keliru.
- Perubahan: Retry mengembalikan skor dan jumlah emas ke awal level, mulai baru mereset semuanya, dan hasil akhir menampilkan jarak serta emas yang terkumpul.
- Cara uji: Selesaikan Level 1 dengan 150 poin, kumpulkan sampai 240 di Level 2 lalu kalah. Retry harus balik ke 150. Menang lalu mulai lagi; skor dan emas harus mulai dari nol.


## Hitbox Sesuai Posisi Gambar

Branch: `fix/collision-hitbox` | Tanggal: 2026-11-18

- Masalah/tujuan: Hitbox item tadinya bergeser dari gambar, jadi tabrakan terasa telat.
- Perubahan: Hitbox sekarang mengikuti posisi gambar, player dan rintangan diberi padding 6 px, emas tetap full size, dan tombol H menampilkan kotak debug.
- Cara uji: Tekan H saat main untuk cek kotaknya, tabrak batu, lalu coba ambil emas dengan sentuhan tipis.


## Rapikan Kontrol Keyboard

Branch: `fix/input-keyboard` | Tanggal: 2026-11-17

- Masalah/tujuan: Bikin kontrol keyboard tetap konsisten saat Caps Lock aktif, tidak menggeser halaman, dan tidak mengulang pindah jalur saat tombol ditahan.
- Perubahan: A/D/M menerima huruf besar-kecil, tombol panah dan Space menahan scroll, event repeat diabaikan untuk gerak jalur, dan input keyboard/sentuhan memakai fungsi moveLane yang sama.
- Cara uji: Nyalakan Caps Lock lalu tekan A/D; perkecil jendela dan tekan panah; tahan panah kanan; lalu coba sentuh sisi kiri/kanan layar di HP.


## Kecepatan Game Stabil di Semua Refresh Rate

Branch: `feat/fixed-timestep` | Tanggal: 2026-11-17

- Masalah/tujuan: Kecepatan game mengikuti refresh rate layar, jadi gameplay lebih cepat di monitor 120Hz atau 144Hz.
- Perubahan: Update game berjalan tetap 60 tick per detik, delta waktu dibatasi 250 ms, dan timer direset saat mulai level.
- Cara uji: Ukur waktu Level 1 sampai 500 m (sekitar 36 detik), ulangi di layar 120Hz/144Hz bila ada, lalu pindah tab 10 detik dan pastikan game tidak melompat jauh.


## Perbaiki Game Loop dan State

Branch: `fix/game-loop-state` | Tanggal: 2026-11-17

- Masalah/tujuan: Mencegah loop permainan menumpuk setelah mengulang level atau naik level, dan menyatukan pengelolaan state.
- Perubahan: Mengganti string state dengan konstanta `STATE` dan transisi melalui `setState()`. Game loop dimulai sekali di akhir file dan terus menjadwalkan frame tanpa bergantung pada state.
- Cara uji: Main Level 1, sengaja kalah, lalu ulang level tiga kali. Pastikan kecepatan rel dan rintangan tetap sama. Naik ke Level 2 dan pastikan kecepatannya sesuai konfigurasi serta tidak berlipat.
