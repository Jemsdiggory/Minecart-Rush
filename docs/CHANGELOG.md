# Changelog Minecart Rush

## Perbaiki Game Loop dan State

Branch: `fix/game-loop-state` | Tanggal: 2026-11-17

- Masalah/tujuan: Mencegah loop permainan menumpuk setelah mengulang level atau naik level, dan menyatukan pengelolaan state.
- Perubahan: Mengganti string state dengan konstanta `STATE` dan transisi melalui `setState()`. Game loop dimulai sekali di akhir file dan terus menjadwalkan frame tanpa bergantung pada state.
- Cara uji: Main Level 1, sengaja kalah, lalu ulang level tiga kali. Pastikan kecepatan rel dan rintangan tetap sama. Naik ke Level 2 dan pastikan kecepatannya sesuai konfigurasi serta tidak berlipat.
