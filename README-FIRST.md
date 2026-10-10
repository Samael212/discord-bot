# SHADOW BASILISK — FINAL ALL-IN-ONE

ระบบนี้รวม:

- Discord OAuth2 Login
- แสดงชื่อเล่น (Server Nickname) ในหน้า Login
- ระบบยืนยันตัวตนใน Popup
- Auto Verify Role
- Auto Nickname จากชื่อ IC
- Verify Lock: ยืนยันแล้วจะยืนยันซ้ำไม่ได้
- ADMIN RESET: ADMIN ใส่ Discord ID เพื่อปลดล็อกสมาชิก
- ออกจาก Discord Server แล้วกลับเข้าใหม่ สามารถยืนยันใหม่ได้
- Discord LOG สำหรับ Login / Verify / Reset / Error
- ตารางเรียนแบบปฏิทิน
- เลือกเดือน / วันนี้ / ก่อนหน้า / ถัดไป
- ตัวกรอง ทั้งหมด / ตารางเรียน / กิจกรรม
- ตัวกรองชั้นปี
- หนังสือประจำวิชาแบบ URL หรือไฟล์ PDF ใน `public/assets/books`
- SETUP-DISCORD สำหรับกรอกค่า `.env`
- START.bat สำหรับเปิดเว็บ
- รองรับการเปิด `127.0.0.1:3000` แล้ว redirect ไป `localhost:3000` เพื่อป้องกัน OAuth state/cookie mismatch

## 1. สำคัญมาก: อย่าเปิดเว็บด้วย Live Server 5500

ห้ามใช้:

`http://127.0.0.1:5500/aethel-house/index.html`

เพราะ Discord OAuth และ Session อยู่บน Node server

ให้เปิดด้วย:

`START.bat`

แล้วเข้า:

`http://localhost:3000`

ถ้าเผลอเปิด `127.0.0.1:3000` ระบบจะ redirect ไป `localhost:3000` ให้อัตโนมัติ

## 2. SETUP-DISCORD

ดับเบิลคลิก:

`SETUP-DISCORD.bat`

กรอกตามลำดับ:

1. ID ไคลเอ็นต์
2. รหัสลับไคลเอนต์
3. Redirect URI
4. Bot Token
5. Server ID / Guild ID
6. Verify Role ID
7. Log Channel ID
8. Admin Role ID (ถ้ามี)
9. Admin Discord IDs (ถ้ามีหลาย ID ให้คั่นด้วย comma)

ค่า Redirect เริ่มต้น:

`http://localhost:3000/auth/discord/callback`

ใน Windows Terminal สามารถวางค่าด้วย Ctrl+V ได้ หาก Terminal ของเครื่องตั้งปุ่ม Paste เป็น Ctrl+Shift+V ให้ใช้ Ctrl+Shift+V แทน

Ctrl+C = ยกเลิก/หยุดคำสั่ง

## 3. Discord Developer Portal

ไปที่:

OAuth2 > Redirects

เพิ่ม:

`http://localhost:3000/auth/discord/callback`

Client Secret ใช้สำหรับ OAuth เท่านั้น และห้ามใส่ใน JavaScript ฝั่ง `public`

## 4. Bot Permission

Bot ต้องมีอย่างน้อย:

- View Channel
- Send Messages
- Embed Links
- Manage Roles
- Manage Nicknames

และต้องวาง Role ของ Bot ให้อยู่สูงกว่า Verify Role

## 5. Verify Flow

ผู้ใช้กด `ยืนยันตัวตน`:

1. Login ด้วย Discord
2. ระบบตรวจว่าอยู่ใน Server หรือไม่
3. ตรวจ Verify Role
4. ถ้ามี Role แล้ว แสดง `ยืนยันเสร็จสิ้น` และล็อกการยืนยันซ้ำ
5. ถ้ายังไม่มี Role ให้กรอกชื่อ IC
6. เพิ่ม Verify Role
7. เปลี่ยน Server Nickname เป็นชื่อ IC
8. ส่ง LOG เข้า Discord

## 6. ADMIN RESET

ADMIN สามารถเปิด Popup `ยืนยันตัวตน` แล้วจะเห็น `ADMIN CONTROL`

ใส่ Discord ID ของสมาชิก เช่น:

`123456789012345678`

จากนั้นกด:

`RESET VERIFY`

ระบบจะนำ Verify Role ออก และสมาชิกเป้าหมายจะสามารถยืนยันใหม่ได้

ADMIN กำหนดได้ 2 วิธี:

```env
DISCORD_ADMIN_ROLE_ID=ROLE_ID
```

หรือ:

```env
ADMIN_DISCORD_IDS=123456789012345678,987654321098765432
```

ใช้พร้อมกันได้

## 7. กรณีสมาชิกออก Server

ระบบใช้ Verify Role เป็นตัวล็อก

เมื่อสมาชิกออก Server Discord จะไม่มีสมาชิก/Role เดิมอยู่แล้ว

เมื่อกลับเข้า Server ใหม่ จะไม่มี Verify Role และสามารถยืนยันใหม่ได้

## 8. Discord LOG แยก 3 ห้อง

ระบบรองรับห้อง LOG แยกกัน 3 ห้อง:

```env
DISCORD_LOGIN_LOG_CHANNEL_ID=CHANNEL_ID
DISCORD_VERIFY_LOG_CHANNEL_ID=CHANNEL_ID
DISCORD_RESET_LOG_CHANNEL_ID=CHANNEL_ID
```

### ห้องที่ 1 — Discord Login
รับ LOG การเข้าสู่ระบบ Discord เช่น:
- Discord Login

### ห้องที่ 2 — ยืนยันตัวตน
รับ LOG การยืนยันตัวตน เช่น:
- Verify Success
- Duplicate Verify Blocked
- Verify Role Failed

### ห้องที่ 3 — ปลดล็อกการยืนยันใหม่
รับ LOG เกี่ยวกับ ADMIN Reset เช่น:
- ADMIN Verify Reset
- Unauthorized Reset Attempt

รัน `SETUP-DISCORD.bat` แล้วกรอก Channel ID ทั้ง 3 ห้องแยกกันได้เลย

## 9. ตารางเรียน

แก้ที่:

`public/js/config.js`

ตัวอย่าง:

```js
{
  id: "history-01",
  date: "2026-10-07",
  start: "20:00",
  end: "21:00",
  title: "ประวัติศาสตร์และอักษรรูน",
  type: "class",
  year: "all",
  teacher: "Prof. Darin Crowne Cross",
  location: "Rune Classroom",
  text: "รายละเอียดวิชา",
  bookTitle: "หนังสือประจำวิชา : ประวัติศาสตร์และอักษรรูน",
  bookUrl: "https://example.com/book.pdf"
}
```

type:

- `class` = ตารางเรียน
- `event` = กิจกรรม

year:

- `all` = ทุกชั้นปี
- `1` = ชั้นปี 1
- `2` = ชั้นปี 2
- `3` = ชั้นปี 3

## 10. หนังสือประจำวิชา

ถ้าเป็นลิงก์ภายนอก:

```js
bookUrl: "https://example.com/book.pdf"
```

ถ้าเป็นไฟล์ PDF ในเว็บ:

วางไฟล์ไว้ที่:

`public/assets/books/ชื่อไฟล์.pdf`

แล้วใช้:

```js
bookUrl: "assets/books/ชื่อไฟล์.pdf"
```

ลิงก์ Canva ที่มีอยู่ในชุดนี้ถูกเก็บไว้ในวิชา `ประวัติศาสตร์และอักษรรูน`

## 11. เปิดระบบ

วิธีง่ายที่สุด:

`START.bat`

หรือ:

```bash
npm install
npm start
```

เว็บ:

`http://localhost:3000`

Health:

`http://localhost:3000/health`

## 12. ความปลอดภัย — ทำก่อนใช้งานจริง

ไฟล์ `.env` ไม่ควรนำไปแจกหรืออัปโหลด GitHub

ห้ามเผยแพร่:

- Bot Token
- Client Secret
- SESSION_SECRET

ถ้าค่าพวกนี้เคยถูกส่งให้คนอื่นเห็นแล้ว ให้สร้าง Bot Token และ Client Secret ใหม่ใน Discord Developer Portal ก่อนใช้งานจริง


## 🌐 ให้คนที่อยู่นอก Wi‑Fi เข้าเว็บ

เว็บไซต์รุ่นนี้ตั้งค่าเป็น **Local Only** เพื่อให้เข้าจากเครื่องที่รันเซิร์ฟเวอร์เท่านั้น

เปิดเว็บด้วย:

```text
http://localhost:3000
```

ไม่มีระบบ LAN / Firewall / Cloudflare / Public Internet รวมอยู่ในชุดนี้


## 11. ระบบประกาศจากหน้าเว็บ

ADMIN ที่ผ่านการตรวจสิทธิ์ Discord สามารถเปิด `ประกาศ` แล้วเขียนประกาศจากหน้าเว็บได้ทันที ไม่ต้องแก้ `config.js`

ข้อมูลประกาศจะถูกเก็บใน `data/announcements.json` และ ADMIN สามารถลบประกาศได้จากหน้าเว็บ

## 12. คำร้อง / ติดต่ออาจารย์

กด `คำร้อง / ติดต่ออาจารย์` แล้วจะแสดงอาจารย์ 3 คน:

- Prof. Darin Crowne Cross
- Prof. Jonatan
- Prof. Witcher

สมาชิก Login Discord แล้วเลือกอาจารย์ จากนั้นกรอกหัวข้อและรายละเอียดคำร้องได้ คำร้องจะถูกเก็บใน `data/requests.json`

ADMIN สามารถเปิดประกาศ > `ดูคำร้องจากสมาชิก` เพื่อดูคำร้องทั้งหมด

## 13. ทดลองอัปค่าสถานะ

ระบบ `ทดลองอัปค่าสถานะ` อ้างอิงตารางที่ส่งมา:

- STR: 1 แต้ม = +1.5 Damage
- AGI: 1 แต้ม = -0.3% Cooldown
- VIT: 1 แต้ม = +20 HP
- LUCK: 1 แต้ม = +0.025% Crit Chance
- MIND: 1 แต้ม = +1.5 Armor

มีแต้มทดลองทั้งหมด 50 แต้ม สามารถกด `+ / -` และรีเซ็ตได้ ระบบนี้เป็นการจำลองในหน้าเว็บ ยังไม่เปลี่ยนค่าสเตตัสจริงใน Discord/FiveM

## 14. ภาพพื้นหลัง

ใช้ภาพ `public/assets/shadow-background.png` เป็นพื้นหลังหลักของ Hero และปิดภาพ Hero เดิมแล้ว

## Port 3000 fix

`START.bat` now checks port 3000 before starting. If an old `node server.js` is already listening there, it stops that old Node server automatically and starts the current one. It does not automatically kill unrelated programs using port 3000.
