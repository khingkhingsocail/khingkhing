# แผนผลิตภัณฑ์แอปวิดีโอสั้น “ขิงขิง”

## ปรับลำดับโพสต์ต่อจากของเดิม — 10 ต.ค. 2026

ฟีดใช้โหมด “ตามลำดับโพสต์” เป็นค่าเริ่มต้น: ตัวอย่างเดิม → ไฟล์ส่วนตัวเดิมเรียงเก่าไปใหม่ → โพสต์สาธารณะเก่าไปใหม่ โดยรูป/วิดีโอใช้เลขเดียวกันและกำหนดเลขก่อนกรองประเภท ไม่เริ่มเลขใหม่เมื่อโหลดหน้าถัดไป. เพิ่ม query order=oldest เฉพาะฟีดพร้อม cursor ทิศทางเดียวกัน คง API ค่าเริ่มต้น newest สำหรับคลัง/สถิติ/โปรไฟล์. มีปุ่มสลับ “แนะนำตามความชอบ” เพื่อใช้ระบบเดิมโดยไม่ลบ preferences หรือปิดการเรียนรู้; การเลือกโหมดไม่ใช่เลขทะเบียนโพสต์ถาวร เมื่อมีการลบรายการเลขตำแหน่งอาจเปลี่ยน ไม่มี schema migration/เขียนข้อมูลทดสอบลง DB ร่วม.

## ขอบเขตและสมมติฐาน

ออกแบบและเตรียมโค้ดแกนกลางสำหรับแอปวิดีโอสั้นภาษาไทยและอังกฤษ ชื่อ **ขิงขิง** สำหรับผู้ชมและครีเอเตอร์ทั่วไป โดยใช้กลุ่มอายุ 16–35 ปีเป็นสมมติฐานตั้งต้นตามตัวอย่างของผู้ใช้ ไม่ถือเป็นนโยบายอายุหรือข้อกำหนดด้านกฎหมายที่อนุมัติแล้ว

งานก่อนหน้าคงสถาปัตยกรรม, UX flow, social schema proposal, roadmap และ recommendation core พร้อม tests; เพิ่ม local profile editor, profile navigation และ comments panel รอบ Arena เพิ่มตารางโปรไฟล์/สถิติแข่งขันใน Managed Database แบบ additive แล้ว โดยไม่แตะไฟล์ private หรือแก้ข้อมูล public_media เดิม ไม่เปิดบริการภายนอกหรือเผยแพร่ build ใหม่

โปรเจกต์จริงที่มีอยู่ใช้ React/TypeScript/Vite, Node/Express, Drizzle และ Managed MySQL และเว็บไซต์มีฟีดสาธารณะกับ anonymous uploads สูงสุด 20 MB ต่อไฟล์อยู่แล้ว ผู้ใช้เคยอนุมัติให้ผู้เข้าชมทุกคนโพสต์สาธารณะได้ทันทีโดยไม่ต้องเข้าสู่ระบบ และให้ไฟล์ private เดิมคงอยู่ในเบราว์เซอร์ ดังนั้นแผนนี้ **คงพฤติกรรมเดิมไว้เป็นค่าเริ่มต้น**; การเปลี่ยนให้ต้อง login ก่อนโพสต์เป็นการตัดสินใจผลิตภัณฑ์ที่ยังเปิดอยู่ ส่วน like/comment/follow/save และโปรไฟล์ส่วนบุคคลควรผูกกับบัญชีเมื่อ auth พร้อม

## ตัวเลือกทางเทคนิค

| ชั้นระบบ | แนวทางที่เลือก | สถานะ/เงื่อนไข |
|---|---|---|
| Frontend | React + TypeScript + Vite แบบ responsive PWA บนเว็บ (ใช้โค้ดเดิม; ยังไม่สร้าง native iOS/Android) | ใช้งานในโปรเจกต์ปัจจุบัน |
| Backend | Node.js + Express REST API | Server เปิดอยู่แล้ว |
| Database | Managed MySQL ผ่าน Drizzle | metadata สื่อและตาราง Arena ใช้งานจริง; social graph proposal ยังไม่ได้ apply |
| Authentication | Firebase Authentication สำหรับ phone, Google, Apple, Facebook; Express ตรวจ ID token ผ่าน Firebase Admin | ต้องมี Firebase project และ provider credentials/redirect configuration; ยังไม่เชื่อม |
| Video storage/delivery | ระยะเริ่มต้นคง MySQL BLOB และ limit 20 MB ต่อไฟล์เพื่อไม่เปลี่ยนการตัดสินใจเดิม; เป้าหมาย V1 คือ Cloudflare Stream สำหรับ direct upload, encoding, HLS/DASH และ deletion API | ย้ายได้เมื่อผู้ใช้อนุมัติและมี Cloudflare credentials; video three-minute ที่ 20 MB ต้อง encode bitrate ต่ำ |
| Realtime | SSE สำหรับ notification/comment event ใน single-instance MVP; Socket.IO + shared pub/sub เมื่อขยายหลาย instance | ยังไม่ติดตั้ง event bus |
| Video processing | `MediaRecorder`/Canvas/WebCodecs ใน browser สำหรับ capture/preview; worker/FFmpeg หรือ video provider สำหรับ final multi-clip render | ยังไม่มี transcoding worker |
| Live | LiveKit rooms + ingress/egress ใน V2 | ยังไม่เชื่อม provider; เป็น feature optional ที่คำขอระบุ “ถ้าทำได้” |

## สถาปัตยกรรมและขอบเขตบริการ

- PWA ให้บริการ For You/Following feed, creator studio, comments, search, profiles และ inbox; API ตรวจ session/authorization ก่อนแก้ social state
- Firebase Auth เป็น identity provider เดียวที่ออก token สำหรับทั้งสี่วิธีล็อกอิน; account linking ใช้ `auth_identities` เพื่อไม่สร้างโปรไฟล์ซ้ำเมื่อผู้ใช้เชื่อม provider เพิ่ม
- MySQL เก็บ profile, follow graph, likes, comments, bookmarks, view aggregates, hashtags, notification records, reports และ state ของ live rooms ไม่เก็บข้อมูลบัตร/credential provider
- คงตาราง `public_media` ที่ใช้อยู่เป็น legacy path จนกว่าจะมี migration plan; proposal `social_videos` สามารถอ้าง `legacy_media_id` และค่อยย้าย metadata แบบ additive
- For You สร้าง candidate pool จากฟีดใหม่, ความสนใจ, creator ที่ติดตาม, trending และ discovery exploration; ตัดโพสต์จากผู้ใช้ที่ถูก block/เนื้อหาที่ถูกซ่อนออกก่อนจัดอันดับ
- Following เรียงคลิปจาก creator ที่ติดตามโดยใช้เวลาล่าสุดก่อน ไม่ใช้ For You score มาแทน chronology
- SSE ส่งเหตุการณ์ที่ผู้ใช้มีสิทธิ์เห็นเท่านั้น; หลาย server instance ต้องใช้ shared pub/sub เพื่อไม่ให้ event หายข้าม process
- direct upload ไป Cloudflare Stream (ระยะอนาคต) ต้องออก one-time upload URL ฝั่ง server, ไม่ส่ง API token ไป client, ตรวจ duration/ownership และเก็บ provider UID ใน DB

### API ที่เสนอ

| Route | การทำงาน | Authorization |
|---|---|---|
| `GET /api/feed?tab=for-you|following&cursor=...` | ดึงฟีดตาม cursor และสถานะ block/privacy | public read ตาม visibility; Following ต้องมี session |
| `POST /api/videos/upload-intent` | สร้าง draft/upload intent; คืน direct URL หรือรับ BLOB ใน MVP | ใช้บัญชีสำหรับ social post; คง anonymous legacy endpoint จนกว่าจะอนุมัติการเปลี่ยน policy |
| `POST /api/videos/:id/publish` | เปลี่ยนจาก draft/processing เป็น published หลังตรวจ media | เจ้าของโพสต์ |
| `GET/DELETE /api/videos/:id` | metadata และลบ/soft-delete ตามสิทธิ์ | public metadata; delete เฉพาะเจ้าของ/moderator |
| `PUT/DELETE /api/users/:id/follow` | follow/unfollow และ notification | session |
| `PUT/DELETE /api/videos/:id/like`, `PUT/DELETE /api/videos/:id/bookmark` | like/save แบบ idempotent | session |
| `GET/POST /api/videos/:id/comments` และ `DELETE /api/comments/:id` | อ่าน/สร้าง/reply/ซ่อนคอมเมนต์ | อ่านตาม visibility; เขียนใช้ session |
| `GET /api/search?q=&type=` | ค้น user/video/hashtag/sound | public results ที่เปิดเผยได้ |
| `GET /api/notifications` และ `GET /api/events` | notification inbox และ SSE event stream | session |
| `POST /api/reports`, `PUT/DELETE /api/users/:id/block` | report/block | session; moderator workflow สำหรับปิดเคส |
| `POST /api/live/rooms` และ `POST /api/live/:id/token` | สร้าง room/ออก LiveKit token | host/moderator ตาม policy; เปิดใน V2 |

## UX flows หลัก

1. **เริ่มใช้งาน:** เลือกภาษาไทย/English → For You feed → เลือกความสนใจเพื่อ cold start → สมัคร/ล็อกอินผ่าน phone/Google/Apple/Facebook เมื่อจะใช้ฟีเจอร์ที่ต้องมีตัวตน
2. **ดูคลิป:** For You/Following → คลิปเต็มจอแบบเลื่อนแนวตั้ง → auto-play/loop แบบเคารพ reduced motion และเริ่มปิดเสียง → like/comment/share/save → view/comments/likes/share count
3. **สร้างคลิป:** Create → ขอ camera/microphone permission → ตั้ง timer 0/3/10 วินาที → ถ่ายหลาย segment รวม 15 วินาที–3 นาที → editor ตัดช่วง/เรียง segment/ปรับ speed → เลือก licensed sound → filter/effect/sticker/text → preview → ตั้ง visibility และอนุญาต duet/stitch → publish
4. **Account/social:** sign-up → handle/profile/bio/avatar → follow/unfollow → creator profile ที่แสดง follower/following/likes → saved videos อยู่เฉพาะเจ้าของบัญชี
5. **Conversation/inbox:** เปิด comments drawer → reply thread → แจ้งเตือน mention/like/comment/follow → mark read; mute, block และ report เข้าถึงได้จากเมนูโพสต์/โปรไฟล์
6. **ค้นพบ:** search field → tabs Users/Videos/Hashtags/Sounds → ผลเรียงตาม relevance/recency; เลือก hashtag หรือ sound เพื่อเปิด feed ที่กรองแล้ว
7. **Live (V2):** กดเริ่ม live → ตรวจสิทธิ์/ชื่อเรื่อง → สร้าง LiveKit room → viewers เข้าชม/รายงาน → egress บันทึกเฉพาะเมื่อเจ้าของอนุญาต

### UI state และภาษา

- Mobile-first canvas เต็มจอ; desktop ใช้แถบนำทางด้านซ้ายและ metadata rail ด้านขวา; bottom navigation บนมือถือ: Feed, Discover, Create, Inbox, Profile
- Dark mode เป็นค่าเริ่มต้นตามบริบทวิดีโอ; มี Light/Dark/System toggle พร้อมบันทึก preference
- ใช้ `th`/`en` dictionary และ locale-aware date/count formatting; หลีกเลี่ยงข้อความที่ฝังใน component และบอกสถานะ loading/empty/error/permission ชัดเจน
- ปุ่ม like/comment/share/save และ view count ใช้ server-backed counters; ห้ามแสดงตัวเลขสาธิตเหมือนยอดจริงใน production
- Search/discovery, Following และ Comments แสดง empty state ที่พาไปทำขั้นตอนที่เหมาะสม

## โครงสร้างโปรเจกต์เป้าหมาย

```text
client/src/
  pages/                  app shell และ route screens
  components/feed/        feed card, action rail, comments drawer
  components/create/      camera, timeline editor, audio/effects panel
  components/profile/     profile, follow controls, saved videos
  components/inbox/       notification list
  i18n/                   th/en catalogs
  lib/                    API client, auth state, media helpers
server/
  auth/                   Firebase token verification และ app permissions
  routes/                 feed, video, social, comments, search, safety, inbox
  services/               recommendation, notification, upload, moderation
  workers/                transcode/webhook/background jobs (V1+)
drizzle/                  migrations และ MySQL schema
shared/                   request/response schemas และ enum types
docs/
  khingkhing-social-app.md product spec/architecture/flows/roadmap
  khingkhing-social-schema.sql schema proposal (not applied)
server/recommendation.ts   deterministic ranking core + tests
```

## แนวทางดีไซน์

- **Design Movement:** mobile-native short-video feed ผสาน editorial creator culture; ได้แรงบันดาลใจจาก pattern ทั่วไปของ social video แต่ไม่คัดลอก trademark, iconography หรือ UI asset ของ TikTok
- **Core Principles:** (1) สื่อมาก่อน chrome, (2) ควบคุม feed ได้, (3) interactions ตอบสนองทันทีแต่ sync ด้วย server, (4) privacy/safety state อ่านออกในหนึ่ง glance
- **Color Philosophy:** ดำอมหมึกทำให้วิดีโอเด่น, lime เป็นสีประจำขิงขิง, warm white สำหรับข้อความ, cyan ใช้บอกสถานะ/เสียง; สีเตือนมี contrast และไม่ใช้เป็น brand mimic
- **Layout Paradigm:** mobile full-bleed vertical canvas + bottom bar; desktop ใช้ left rail/content/right context; composer และ comments เปิดเป็น sheet แทน modal กลางจอ
- **Signature Elements:** vertical progress/slim edge marker, avatar action rail, lime/cyan focus ring
- **Interaction Philosophy:** swipe/scroll เปลี่ยนคลิป, tap ควบคุมเสียง/like; ทุก action ที่ต้องมีบัญชีแสดง state และเหตุผลเมื่อยังไม่ได้ login; guest upload ใหม่ยัง public ทันทีพร้อมคำเตือนตาม policy ที่ผู้ใช้อนุมัติไว้; account social ตั้ง visibility ได้ตามฟีเจอร์ใหม่ และ private legacy files ไม่ถูกย้ายหรือเผยแพร่
- **Animation:** scroll-snap และ crossfade สั้น; หยุดเล่นคลิปเมื่อหลุด viewport; ลด motion ตาม `prefers-reduced-motion`; ห้ามทำ autoplay แบบมีเสียง
- **Typography System:** IBM Plex Sans Thai สำหรับ UI ไทย + Inter/Space Grotesk สำหรับตัวเลข/ละติน; title หนา, caption รอง, counters tabular numerals
- **Brand Essence:** แอปคลิปสั้นสำหรับคนอยากค้นพบและแบ่งปันจังหวะสร้างสรรค์; บุคลิกสดใส ตรงไปตรงมา และปลอดภัย
- **Brand Voice:** CTA กระชับ เช่น “สร้างคลิปของคุณ” และ “ดูสิ่งที่คนที่คุณติดตามกำลังแบ่งปัน”; microcopy บอกผลและสิทธิ์ ไม่เร่งให้กด
- **Wordmark & Logo:** คำไทย “ขิงขิง” กับสัญลักษณ์กรอบวิดีโอ/ปุ่มเล่นแบบ custom ที่มี stroke lime
- **Signature Brand Color:** Lime `#d9ff55`

## ข้อจำกัดและ decision gates

- Firebase Auth, Cloudflare Stream และ LiveKit เป็นข้อเสนอจากเอกสารทางการ ไม่ได้เชื่อมกับโปรเจกต์และยังไม่มี credentials; ต้องตั้ง provider console/redirect domains และเก็บ secrets ผ่าน secure WebDev workflow
- ผู้ใช้เคยอนุมัติ public anonymous uploads; ต้องเลือกอย่างชัดเจนว่าจะคงไว้หรือเปลี่ยนเป็น login-required ก่อนเขียน authorization policy ใหม่
- limit 20 MB ต่อไฟล์เดิมยังคงอยู่; ถ้าใช้สามนาทีต้อง encode bitrate ประมาณ 0.8 Mbps หรือต่ำกว่าโดยเผื่อเสียง/metadata คุณภาพจะต่างตามขนาดเฟรม
- Cloudflare Stream เปลี่ยนรูปแบบ storage จาก DB BLOB; ทำ migration แบบ copy/verify/delete กับ rollback plan หลังยืนยัน provider เท่านั้น
- เพลง/เสียงต้องมาจากคลังที่มีสิทธิ์ใช้จริง; ห้ามนำเพลง TikTok หรือเพลงลิขสิทธิ์มา seed โดยไม่มี license
- Live streaming เป็น V2/optional; ไม่มี account, key หรือ infra live ในปัจจุบัน
- public uploads ปัจจุบันยังไม่มี moderation หรือ quota รวม จึงยังไม่ควรนำเสนอว่ามีระบบ safety เชิงปฏิบัติการครบถ้วน


## ขอบเขตฟีเจอร์โปรไฟล์ที่เพิ่มในรอบนี้

เพิ่ม editor สำหรับโปรไฟล์บน browser นี้โดยไม่อ้างว่าเป็นบัญชี social: แก้รูปโปรไฟล์, รูปปก, ชื่อที่แสดง, username, bio, หมวดหมู่, สถานที่ และเว็บไซต์ได้ รูป JPG/PNG/WebP สูงสุด 5 MB ถูกย่อใน client และเก็บเป็น Blob ใน IndexedDB แยกฐานจากคลังสื่อส่วนตัวเดิม ข้อมูลยังไม่ส่ง server, ไม่ public, ไม่ sync ข้ามอุปกรณ์; หน้า UI ต้องบอกข้อจำกัดนี้ชัดเจนจนกว่าจะเชื่อม authentication และ backend จริง

## Profile navigation — ขอบเขตของ prototype

- แตะ/คลิก avatar หรือชื่อผู้สร้างใน feed เพื่อเปิด profile view ภายในฟีด; ใช้ creator ID แยกจาก media ID เพื่อให้ภายหลังผูกกับ user ID ได้
- ปุ่มกลับคืนตำแหน่งฟีดและโฟกัสเดิม; กดภาพ/วิดีโอในหน้าโปรไฟล์เพื่อกลับไปยังโพสต์นั้นในฟีดได้ รวมถึงใช้คีย์บอร์ด และวิดีโอหยุดเมื่อออกจากหน้าฟีด
- ข้อมูลโพสต์ที่ส่งเข้า profile preview ต้องผ่านตัวกรอง creator/visibility และตัดข้อมูลอื่นที่ไม่จำเป็นออก; โปรไฟล์ local ไม่ถูกส่งเข้าหน้า preview สาธารณะ และ guest คนละโพสต์ไม่ถูกรวมเป็นคนเดียวกัน
- โปรไฟล์ตัวอย่างแสดงเฉพาะโพสต์ตัวอย่างของครีเอเตอร์นั้น; โพสต์ guest แสดงเฉพาะสื่อสาธารณะของโพสต์นั้นโดยไม่เปิดเผยตัวตน; avatar ของเจ้าของอุปกรณ์เปิด local profile editor แทนการเปิดเผยข้อมูล local-only
- ปัจจุบันยังไม่มี account owner IDs จริงในโพสต์สาธารณะ; public profiles ของเพื่อนและผู้ใช้อื่นต้องเชื่อม authentication และ social user records ก่อน ห้ามอ้างโปรไฟล์ตัวอย่างเป็นบัญชีจริงหรือแสดงข้อมูลโปรไฟล์ local-only ให้ผู้ชมอื่น

## ตารางสถิติรูป/วิดีโอ — แท็บขิงขิงบนฟีด

- ย้ายตารางจาก “ค้นพบผลงาน → สถิติสาธารณะ” มาไว้ในแท็บชื่อ “ขิงขิง” บนแถบฟีด ต่อจาก “สำหรับคุณ” ทั้งมือถือและเดสก์ท็อป หัวหน้าตารางใช้ชื่อ “ขิงขิง” พร้อมคำอธิบายสถิติรูป/วิดีโอ; หน้า “ค้นพบผลงาน” คงแกลเลอรีตัวอย่างเดิม ไม่รวมสื่อสาธิตหรือคลัง private ในยอดจริง
- เปิดแท็บขิงขิงแล้วหยุดวิดีโอและปิดความคิดเห็น; ฟีดเก็บ state และตำแหน่งเดิมไว้ เมื่อกลับสำหรับคุณคืนตำแหน่งเดิม และเปิดแถวจากตารางกลับไปยังโพสต์นั้นได้ แถบบนคงมองเห็นขณะเลื่อนตาราง พร้อม safe area และไม่ซ้อนเมนูล่างบนมือถือ
- ใช้ metadata จาก `/api/media` เดิมทีละ 100 รายการโดยไม่อ่าน BLOB เพื่อทำตาราง: ลำดับปัจจุบัน, ชื่อผลงาน, ประเภท, วันที่เผยแพร่, ขนาดไฟล์, ใจในเซสชันนี้, บันทึกในเซสชันนี้, วิว, ความคิดเห็น และแชร์ ตัวเลขปฏิสัมพันธ์ที่ server ยังไม่เก็บเป็น null แสดง “— / ยังไม่เก็บข้อมูล” ไม่แสดงศูนย์หรือคะแนนรวมปลอม
- กดหัวคอลัมน์ที่มีข้อมูลเพื่อสลับเรียงน้อย→มาก/มาก→น้อยหรือเก่า→ใหม่/ใหม่→เก่า ค่าเริ่มต้นใหม่ล่าสุด มีตัวเลือกคอลัมน์กับทิศทางสำหรับมือถือ; คอลัมน์ที่ยังไม่มีข้อมูลจริงไม่เปิดให้เรียง
- กรองทั้งหมด/ภาพ/วิดีโอ ค้นชื่อ/คำอธิบาย รีเฟรชและโหลดเพิ่มได้ การเรียง/ค้น/ยอดสรุปใช้เฉพาะรายการที่โหลดแล้วและผ่านตัวกรอง ต้องแจ้งขอบเขตนี้ชัด ไม่อ้างว่าเป็นอันดับหรือยอดรวมของฐานข้อมูลทั้งหมด
- คอลัมน์ใจ/บันทึกใช้ state เดิมของ Home ไม่ persist หรืออ้างว่าเป็นยอดคนอื่น; 1 แถว = 1 โพสต์ ไม่ใช่ transaction log ปฏิสัมพันธ์
- แถวเปิดโพสต์จริงในฟีดผ่าน hash deep link ได้ มี loading/error/empty state, aria-sort, คีย์บอร์ด และเลื่อนแนวนอนบนมือถือ; ไม่มี schema migration หรือเปิด tracking ใหม่ และไม่ publish ในรอบนี้
- `MediaStatsTable.tsx` รับข้อมูลจาก API และ state ปฏิสัมพันธ์; `lib/mediaStats.ts` ดูแล projection/filter/sort/summary แบบ pure function พร้อม unit tests

## ขิงขิง Arena — โปรไฟล์แข่งขันตามหมวดหมู่

แท็บขิงขิงด้านบนฟีดเปลี่ยนเป็นเวทีโชว์สถิติและจัดอันดับ **โปรไฟล์ผู้เข้าร่วมในแอป** ไม่ใช่อันดับโลกอย่างเป็นทางการ ตาราง metadata รูป/วิดีโอเดิมยังเปิดได้เป็นเครื่องมือรอง ภาพลักษณ์ใหม่เป็น esports editorial: nameplate ขอบตัด, แสง lime/cyan, กรอบและมงกุฎ Champion ทอง / Challenger เงิน / Elite ทองแดง / Contender สำหรับอันดับถัดไป ตัวอักษรและเลข rank ต้องอ่านง่าย เคารพ reduced-motion และไม่ใช้ตัวเลขตัวอย่างเป็นยอดจริง

ใช้ Managed MySQL เดิม เพิ่มตาราง arena_profiles และ arena_entries แบบ additive โดยไม่แก้ public_media/users หรือข้อมูลส่วนตัวเก่า โปรไฟล์ Arena เป็นข้อมูลสาธารณะแยกจาก local profile; ไม่มีการคัดลอกชื่อ รูป หรือไบโอส่วนตัวเดิมอัตโนมัติ ผู้ใช้กรอกชื่อ handle bio และเลือกรูปใหม่เองก่อนกดบันทึกสาธารณะ รูปเก็บเป็น data image ที่ย่อแล้ว ≤200 KiB ตรวจ signature ฝั่ง server แก้โปรไฟล์และสถิติด้วย bearer edit token เก็บ localStorage ต้นทางเดียวกันจนกว่าจะมีบัญชีจริง ไม่ส่ง token/hash ใน public response; ไม่มีบัญชี verified อัตโนมัติ และไม่อ้าง identity เป็นบุคคลจริง

หมวดกีฬาเลือกวิ่ง 100 เมตร (วินาที น้อยดีกว่า) หรือวิดพื้น (ครั้ง มากดีกว่า); การลงทุนหุ้นใช้ผลตอบแทนที่ผู้ใช้รายงานเอง (%) ต่อเดือน ไม่คำนวณจาก feed ไม่ส่งคำสั่งซื้อขาย; ผู้ติดตาม/ยอดไลค์เลือก platform เพื่อไม่ผสม TikTok/YouTube/Instagram/Facebook; สถิติอื่น/สถิติโลกกำหนดชื่อการแข่งขัน หน่วย และทิศทาง โดยชื่อ หน่วย ทิศทาง และเดือนต้องตรงกันจึงเปรียบเทียบกันได้ ไม่รวมยอดคนละ metric เป็นคะแนนรวม

แต่ละรายการมี profile ID, metric/board key, ค่า finite, หน่วย, เดือน YYYY-MM, วันสถิติจริง, ลิงก์หลักฐาน (ไม่บังคับ), และสถานะ self-reported ที่ server กำหนดเอง หนึ่งโปรไฟล์มีค่าปัจจุบันต่อ board/month; อัปเดตได้ภายหลัง คะแนนเท่ากันได้อันดับเดียวกันแบบ competition ranking 1,1,3 ไม่ใช้ความใหม่ตัดสินผู้ชนะ เลือกเดือน metric และ sort สูง→ต่ำ/ต่ำ→สูงแยกจาก rank ตามกติกา ค้นหาชื่อแล้วอันดับไม่คำนวณใหม่ในผลค้นหา มี public profile detail แสดงสถิติทั้งหมดและหลักฐาน

API `/api/arena/profiles` สร้าง/อ่าน; `/api/arena/profiles/:id` อ่าน/แก้ด้วย token; `/api/arena/entries` ลงสถิติ/อัปเดต; `/api/arena/leaderboard` จัดอันดับทุกแถวของ board/month จาก server ไม่ใช้ partial client pagination เป็นอันดับรวม มี validation, body limit, rate-limit แบบ single-instance MVP, DB unique keys และ sanitized errors สถานะ verified สงวนสำหรับ provider/moderation ในอนาคต ปัจจุบัน UI แสดง “ผู้ใช้รายงานเอง” และอันดับยืนยันแล้วเป็น empty state; จะไม่มีการดึงหรือ seed สถิติโลก/ยอดผู้ติดตามปลอม

`shared/arena.ts` เป็น catalog + validation + board key + ranking pure functions; `server/arena.ts` ดูแล persistence/ownership/API; `components/arena/` ดูแล leaderboard, profile/nameplate/frame, form และ detail; `client/src/lib/arena.ts` API client และ edit-capability storage Tests ครอบคลุม compare direction/ties/custom units/period, auth tampering, validation, public projection และ rendering; ไม่โพสต์ข้อมูลทดสอบลง DB สาธารณะหรือ publish build ในรอบนี้

## Arena Evidence Review — AI + แหล่งข้อมูลสาธารณะ

เพิ่มหลักฐานรูป JPG/PNG/WebP หรือวิดีโอ MP4/WebM สูงสุด 20 MiB ต่อไฟล์ ไม่เกิน 3 ไฟล์และ 50 MiB ต่อสถิติ/เวอร์ชัน หลักฐานแยกจาก public_media และเก็บ BLOB ใน Managed MySQL; ไม่เผยแพร่ไฟล์บนฟีด อนุญาตเฉพาะผู้ถือ edit token ของเจ้าของหรือผู้ดูแลที่ยืนยัน session จริง เปิดดู ดาวน์โหลด ลบ และส่ง AI ได้โดยกดยืนยันการส่งข้อมูลแก่ AI ผู้ส่งต้องปิดข้อมูลบัตร เลขบัญชี ที่อยู่ และข้อมูลส่วนบุคคลไม่จำเป็นก่อนส่ง

Server ตรวจ MIME/signature และ decode ภาพ/วิดีโอด้วย FFmpeg แบบ argument array timeout ไม่ใช้ shell/user filenames จำกัด duration วิดีโอ 180s dimensions 4096px, 2 งานพร้อมกัน และสุ่มเฟรมสูงสุด 24 ภาพ/วิดีโอรวมไม่เกิน 48 ภาพ; เก็บต้นฉบับครบ ไม่ใช้ภาพ sample รับรองการนับทุกวิดพื้นหรือเวลาวิ่งอย่างแม่นยำ การอ่านข้อมูลจากภาพคือการสังเกต ไม่พิสูจน์ภาพแท้ ตัวตน เจ้าของบัญชี/พอร์ต หรือการตัดต่อ

AI vision เลือกโมเดลที่มีจริงใน catalog และให้ผล JSON schema ที่ validate ซ้ำ รับ claim/หน่วย/วัน/เดือน/name/handle เป็นข้อมูล untrusted ไม่ใช่คำสั่ง ตรวจ numeric match, date/unit/identity coverage, signs of ambiguity และข้อจำกัด ไม่สร้างเปอร์เซ็นต์ความแม่นยำปลอมหรือเปลี่ยนคะแนนตัวจริงจากค่าที่ AI เดา ใช้ built-in web_search ที่ทดสอบจริงด้วย gpt-5-mini หา URL ตามชื่อ/รายการ; follow up อ่าน URL จริงด้วย safe HTTP client ที่ pin public IP กัน SSRF, redirects/private ranges, มี time/size limit ไม่ใช้เพียง snippet จากผลค้น และบันทึก URL/ข้อความ excerpt/เวลาเข้าถึง/sha256/domain tier แหล่ง first-party หรือสถาบัน/public recognition แยกจากบทความ/ข้อความที่ผู้ใช้โพสต์เอง อันดับข้อมูลสาธารณะไม่ใช่ตรารับรองตัวตน

AI review status supported/contradicted/insufficient/needs-human แยกจาก verification=verified ของผู้ดูแล; ใส่ badge “AI พบหลักฐานสนับสนุน” พร้อมเหตุผล ไม่อ้างว่าแท้ 100% ข้อมูลโลก/กีฬา/พอร์ตที่ต้องพิสูจน์วิธีวัดครบต้องคนทบทวนก่อนรับรอง มีปุ่มดูผล AI และภาพ/วิดีโอสำหรับเจ้าของ ผู้ดูแล session role admin อ่านคิวและผล เปิดหลักฐาน เลือกรับรอง/ปฏิเสธพร้อมเหตุผลเป็น audit record ห้ามผู้ส่งรับรองตนเอง

เพิ่ม claim revision UUID ใน arena_entries, evidence metadata และ verification audit tables แบบ additive; ตรวจสอบผูกกับ hash snapshot ของ claim revision และ profile identity hash ทุกผล AI/ผู้ดูแล ก่อนแสดง badge/verified leaderboard ต้อง match snapshot ปัจจุบัน เปลี่ยนค่า/วัน/เดือน/หลักฐานหรือชื่อ/handle ต้องผลเดิม stale ไม่ยึดผลเก่ารับรองค่าใหม่ DB unique entry/snapshot ช่วย idempotency, running status durable ตรวจ AI แบบ request finite พร้อม timeouts/retry failed bounded ไม่ใช้ service monitor หรือ scheduled task มีโควต้า AI 5 ครั้งต่อ profile ต่อวัน และพร้อมกันไม่เกิน 2 งาน ภาพหลักฐานไม่ถูกส่งผ่าน public URL/log คิว admin ไม่เปิด raw report ให้ visitor

โครงสร้าง: shared/verification.ts contract/status/schema/snapshot, server/verification/{routes,media,sources,ai}.ts API/AI/SSRF/FFmpeg, components/arena/EvidencePanel.tsx และ ReviewDesk.tsx, Drizzle evidence/review tables Tests ใช้ mocks และ fixture media ชั่วคราวไม่ seed สถิติลง public DB รวม real AI vision/web search smoke test แบบไม่รับรองผลงานจริง

ผลตรวจเพิ่มเติม: metadata/evidence delete ไม่โหลด BLOB และ file bytes โหลดหลังตรวจสิทธิ์เท่านั้น หลักฐานเวอร์ชันเก่าไม่ถูกซ่อน แสดง stale และลบได้ จำกัด storage ทุกเวอร์ชันรวม ≤200 MiB/100 ไฟล์ต่อโปรไฟล์ lock order profile→entry→review เพื่อรักษา quota และ snapshot ผลจริง vision smoke กับภาพที่ไม่สัมพันธ์กับสถิติให้ insufficient และ extractedValue=null; safe fetch อ่าน Guinness official ได้จริง พร้อม SHA-256 ไม่มีการ seed ผู้แข่งขัน/รับรองสถิติจริงใน tests โควต้า AI รวม retry 5 ครั้งต่อวัน retry ต่อเวอร์ชันสูงสุด3 การรับรองอิสระของคนจริงยังต้อง auth/owner mapping; token self-review guard ไม่พิสูจน์บุคคลเดียวกันเมื่อไม่มี token ใน request

## กล่องแนบรูป/วิดีโอเพื่อเป็นหลักฐาน

เพิ่ม EvidenceFilePicker reusable ในฟอร์มลงสถิติและแผงตรวจ AI กรอบเส้นประสี cyan มีปุ่มเลือกไฟล์และลากวาง ตัวอย่างภาพ/คลิป ชื่อ ขนาด ลบรายการที่ยังไม่ส่งได้ รองรับ JPG/PNG/WebP MP4/WebM ≤20 MiB/ไฟล์ ≤3 ไฟล์รวม 50 MiB เช็ก client แล้วตรวจ server เดิมซ้ำ ไม่ย้ายไฟล์ไป public feed ใช้ consent หลักฐานแยกจาก consent โปรไฟล์สาธารณะ ในฟอร์มเลือกก่อนบันทึกได้; API save คืน entryId/revision หลังบันทึกเพื่อ upload ให้ตรง claim หากไฟล์ใดไม่สำเร็จเก็บสถิติเดิม/ไฟล์ที่เหลือและ retry upload เท่านั้น ไม่บันทึกสถิติซ้ำจนทำให้ revision เปลี่ยน ปิดฟอร์มหลัง upload ครบหรือผู้ใช้เลือกทำต่อภายหลัง ห้ามส่ง AI อัตโนมัติ กล่องอยู่ใน manus-no-record ไม่เก็บชื่อ/ข้อมูลหลักฐานใน debug log ไม่มี dependency เพิ่ม

รายละเอียดกล่องหลักฐานที่เก็บงานแล้ว: การเปลี่ยนรายการไฟล์ในฟอร์ม/แผง AI ยกเลิก consent เดิมและให้ยืนยันใหม่ retry มี checkbox แสดงชัด นับจำนวน/bytes ที่อัปโหลดตอบรับแล้วแยกจากไฟล์ที่เหลือ คืน blob object URL เมื่อปิดหรือเปลี่ยนตัวอย่างและ invalidate fetch ที่ค้าง tests 96 กรณีและ full build ผ่าน Backend ไม่คืน id เมื่อ revision ถูกแก้จากอีกหน้าต่าง เพื่อไม่ผูกไฟล์ผิด claim ไม่มี migration หรือ public data ใหม่ในงานนี้

## ระบบข้อความ ขิงขิง Chat

ใช้ Manus OAuth ที่มีอยู่สำหรับแชทเท่านั้น ไม่เปลี่ยนอัปโหลดสาธารณะหรือโปรไฟล์ Arena เดิมให้ต้องล็อกอิน เพิ่ม chat_accounts (nickname+ผูก Arena ด้วยหลักฐาน edit token และ session จริงแบบ unique), chat_rooms (direct/group/channel), chat_members (invited/active/left), chat_messages (sequence, sender, text, client UUID, payload hash), chat_files (private BLOB) API /api/chat แยกจากฟีดและหลักฐานสถิติ เลือกคนจาก directory ที่สมัครใช้แชทแล้ว ไม่เปิด email/openId หรือtoken แชท DM จำกัดคู่เดียวด้วย sorted pair key ปฏิเสธคู่ที่อีกฝ่ายออก/ปฏิเสธ กลุ่มสมาชิกสูงสุด50 ต้องตอบรับคำเชิญก่อนอ่าน history เจ้าของกลุ่มเชิญสมาชิกเพิ่มได้; สมาชิกออกได้ เจ้าของกลุ่มต้องคงอยู่ใน MVP ห้องแข่งขันสร้าง on-demand แยก category+month และ board+month ผู้มี Arena profile ที่ผูกบัญชีจริงและลงสถิติหมวด/เดือนที่ตรงกดเข้าร่วมก่อนอ่าน; ไฟล์หลักฐานส่วนตัวไม่ถูกคัดลอกเข้าห้องอัตโนมัติ

ส่ง text≤2000chars พร้อม JPG/PNG/WebP MP4/WebM ≤20MiB/ไฟล์ ≤3ไฟล์/ข้อความ รวม50MiB คลิป≤3นาที; ตรวจdecode serverเดิม ไม่ส่งAIเอง ใช้ transaction lock room→membership รวมการส่ง/ออก/เชิญ/ตอบรับ ตรวจสิทธิ์ทุก metadata/file read ไม่มี admin bypass ไม่มี public CDN URL ข้อความมี stable client UUID ป้องกัน retryซ้ำ ตรวจ payload hash กันใช้ UUIDเดิมส่งcontentใหม่ โควต้าstorageรวม200MiB/ผู้ส่ง ตรวจcount/bytesในDB แชทไม่มี E2EE ผู้ดำเนินการServer/DBอาจเข้าถึงข้อมูล สมาชิกที่ได้รับไฟล์อาจบันทึกสำเนาได้ ไม่ใช้ bearer Arena token เพื่ออ่านข้อความ เมื่อย้ายอุปกรณ์ login บัญชีเดิมใช้งานห้องเดิมได้

UI เพิ่มเมนูข้อความที่มือถือ+sidebar inbox/conversation responsive สร้างDM/กลุ่ม directory+คำเชิญ+ตอบรับ/ปฏิเสธ composer แนบสื่อพรีวิว และห้องแข่งขันตามเดือน ปุ่มส่งข้อความในโปรไฟล์ Arena เปิดchatของprofileนั้น; ปุ่มห้องพูดคุยในArenaส่งcategory/board/month ไม่สร้าง user/messageปลอม frontend pollทุก4วินาทีเฉพาะ visible page และไม่ทับdraft/pagination fetchย้อนอ่านเก่า50ข้อความ metadataไม่ดึงBLOB มี empty/error/loading/keyboardและmanus-no-record ป้องกัน debug logging /api/chat ทั้งfetch/XHR ไม่มีWebSocket/presence/read receipts/E2EEในMVP ไม่อ้างpollเป็น realtime WebSocket โครงสร้างโค้ด shared/chat.ts, server/chat/{core,routes}.ts, client/src/lib/chat.ts, client/src/components/chat/{ChatPage,ChatComposer,ChatMedia}.tsx และchat.css

ผลเก็บงาน Chat: migration0005เพิ่มตาราง5ตารางแล้ว ไม่seedผู้ใช้/ข้อความจริง ตรวจsignedsessionผ่านSDKเดิมที่validateHS256/project/expiry และใช้OAuth identity ไม่ใช้sessionจำลองในแอป tests146กรณีผ่าน (testsใช้SDK/DBmockแยกจากlive) production buildและstaticbuildผ่าน real loggedoutme/rooms/filesตอบ401 สื่อสาธารณะเดิม+Preview+manifest200 แก้reviewer: retrytransaction3ครั้งสำหรับconcurrentDM/channel unique/deadlock, boardKeyว่างถูกปฏิเสธ, inboxcursor+โหลดห้องเก่า, copyDMออก/ปฏิเสธแล้วไม่เปิดใหม่ในMVP, filenameรวมในpayloadhash, guardผลประวัติห้องเก่าไม่ปนห้องใหม่, disablechannelเดือนเก่าระหว่างrefresh, revokeobjectURL, consentไม่ต้องส่งหลักฐานArenaมาแชท ไม่มีmanual end-to-endส่งแทนสองบัญชีจริง ไม่อ้างว่าPreview200คือloginสองบัญชีสำเร็จ

## หน้าเข้าสู่ระบบขิงขิง
เพิ่ม branded entry/login ที่ / และ /login เมื่อยังไม่ authenticated ใช้ข้อความผู้ใช้ KHING KHING ARENA, YOUR STATS. YOUR STAGE., ขิงให้สุด, ขึ้นที่หนึ่งในทางของคุณ ภาพลักษณ์ esports editorial เดิม สีดำ/lime/cyan wordmark/iconเดิม ไม่สร้างตัวเลขสาธิตหรือproviderปุ่มที่ไม่เชื่อม ต่อOAuthผ่านstartLoginเดิมเฉพาะevent กำหนดnoncecookie/signedsessionเหมือนเดิม ผู้ authenticated หน้า / เข้าHomeทันที; ผู้เยี่ยมชมกด /feed ได้โดยไม่login เพื่อคงpublic uploadsเดิม callbackยังfixed / ไม่รับreturnURLใหม่ ปุ่มเริ่มauthในแชท/ผู้ดูแล/protectedredirectพามา /login ก่อน ข้อความชื่อเว็บเป็นขิงขิง ไม่เปลี่ยนชื่อฐานIndexedDB/storagekeys/assetเดิมจนไฟล์หาย ชื่อแอปที่หน้าOAuthภายนอกดึงจากplatform project metadata ไม่ใช่HTML title เครื่องมือWebDevปัจจุบันไม่มีrename operation จึงไม่อ้างว่าเปลี่ยนชื่อผู้ให้บริการสำเร็จด้วยclientbranding

Entryรักษาลิงก์เดิม /#feed-public-{32hex} ให้เปิดpublicfeedได้ตรงโดยไม่loginด้วยuseSyncExternalStore/hashchange ไม่มีการตีความhashเป็นสิทธิ์บัญชี หน้า /feed ยังpublic การตรวจsession/errorยังfailclosedและOAuthcallbackfixed / ตามเดิม; tests156กรณีและbuildผ่าน /login /feed manifestตอบ200 ชื่อPlayfolioบนOAuthภายนอกยังเป็นงานเปิดตามขอบเขตเครื่องมือ

แก้Preview credential transportให้ใช้parserเดียวกันสำหรับauth.me/chat/admin ทั้งJWTrawและcookiepair ไม่เพิ่มprivileges/no fake sessions และstorageblockedไม่ทำหน้าentryพัง Signature/project/expiry/roleยังตรวจserverเดิม

## ออกจากระบบขิงขิง
ใช้ auth.logout เดิมล้าง webdev_app_session ด้วย path=/ SameSite=None Secure HttpOnly; เพิ่ม LogoutButton reusable และ AccountControls ใน sidebar/profileมือถือและหน้า /login ผู้มี session จริงเห็นปุ่ม logout guest เห็น login การกดเป็นคำขอจริงครั้งเดียว มี pending/error/retry ก่อนสำเร็จไม่เคลม logout เมื่อสำเร็จ cancel in-flight queries ล้าง cache อื่นและ mutation โดยคง auth.me=null ที่ผูก observer และลบเฉพาะ Preview token manus-cookie กับ runtime-user-info จากนั้น router replace /login ไม่ reload iframeหรือเริ่ม OAuth ไม่ลบ local media/profile IndexedDB, arena ownership, delete tokens, ข้อความ/หลักฐาน และไม่ logout Google/Manus ภายนอก ไม่อ้าง revoke token ทุกอุปกรณ์

Logout เก็บรายละเอียด: ลำดับserverสำเร็จ→cancelqueries→storageclear→auth.me=null→removequeriesอื่น/clear mutation cache คง observerauthเพื่อไม่ให้UIถือuserเก่า ถ้าAPIล้มเหลวคงsessionและerrorretry หากquerycancelผิดพลาดหลังserverสำเร็จยังcleanupจบ ไม่logoutภายนอก Tests164และfullbuildผ่าน

## ความคิดเห็นสาธารณะจากผู้ใช้จริง
แยก CommentsPanel reusable ออกจากฟีด ใช้ /api/comments/:mediaId อ่าน public_media ที่มีจริง ทุกคนอ่านได้ ผู้เขียนใช้ Manus signed session เดิมและ X-Khing-Comments custom header ไม่เปลี่ยน guest uploads; ข้อความ public plain text 1–1000 Unicode characters ชื่อผู้เขียนจาก chat nickname หรือชื่อบัญชีที่ไม่ใช่อีเมล ไม่ส่ง email/openId/session อัปโหลด private/demo ไม่มี API/write ใช้สถานะตัวอย่างไม่มีความคิดเห็นจริง เพิ่ม public_comments FK media on delete cascade FK user plus client UUID unique ต่อบัญชี+media ใช้ transaction media→userlock idempotency/โควต้า20ครั้งต่อนาทีต่อบัญชี ไม่มี notifications/replies ในรอบนี้ ปุ่มส่ง/รีเฟรช/โหลดเก่าทีละ30/ลบข้อความตัวเอง softdelete textว่าง พร้อมcountเฉพาะactive กด retry draftเดิมUUIDเดิม ไม่seedข้อความผู้ใช้จริง รูปแบบกล่องเดิมปรับfocus trapให้Tabไปcomposer/listได้ สถานะloading/error/guest/login/publicconsent ไม่logเนื้อหาที่ส่ง ไม่อ้างว่ามี realtime WebSocket

ผลความคิดเห็น: เพิ่มmigration0006เรียบร้อย พร้อมDB public_comments และดัชนีmedia_sequence/author_time/retryunique ตรวจSHOW INDEXยืนยันauthor_timeมีจริง ไม่seedข้อความหรือบัญชี; APIสาธารณะreal200 count0 loggedoutPOST401 ใช้isMineตามvalidatedsessionแทนauthorIdในpublicresponse ไม่ส่งรหัสผู้ใช้ภายใน อีเมลหรือopenId แก้ผล401ให้authrefreshสำเร็จกลับcomposerได้ และdisabledelete/olderระหว่างloadกันผลเก่าแทรกข้อความที่ลบ Countsฟีดอัปเดตหลังpanelread/send/delete กล่องcommentsดูเฉพาะโพสต์สาธารณะ thumbnaildemoยังมีข้อความอธิบายไม่สร้างcommentsจริง independentreviewแก้confirmedissuesแล้ว ไม่มีmanualส่งข้อความจริงแทนสองบัญชี

## ตอบกลับความคิดเห็น
เพิ่ม parent_id (root) และ reply_to_id (ข้อความที่ตอบจริง) แบบ nullable เพื่อคงcommentsเดิมเป็นroot พร้อมreply_to_name snapshot และดัชนีmedia+parent+sequence ไม่มีFKselfเพื่อให้mediaFKcascadeลบโพสต์พร้อมcommentsได้ parent consistencyบังคับserverภายใต้medialock โดยsoftdeleteไม่ตัดลูก APIอ่านrootทีละ30 รวมrootที่ถูกลบแต่ยังมีคำตอบผ่านtombstoneไม่แสดงชื่อ/ข้อความเก่า คำตอบอ่านแยกทีละ30จากล่าสุด cursorbefore UIเรียงเก่า→ใหม่ภายในที่โหลดแล้ว ป้องกันเธรดใหญ่โหลดทั้งหมด POSTรับreplyToId ตรวจtargetมีจริงในmediaเดียว targetยังactive และrootถูกต้อง underlockmedia ก่อนบันทึก ตั้งparentIdจากserverตอบคำตอบได้แต่UIซ้อนแค่ชั้นเดียวพร้อมป้ายตอบกลับชื่อ; retryรวมtargetUUIDไม่ซ้ำ ไม่แจ้งเตือนในงานนี้ UIปุ่มตอบกลับ ใส่ชื่อ/quoteข้อความที่จะตอบและยกเลิกได้ focustextarea เปลี่ยนtargetresetUUIDแต่ไม่ล้างdraft ส่งreplyแล้วเปิดเธรดเดิมไม่ทำrootเก่าที่โหลดหาย มีดู/ซ่อนคำตอบ โหลดเพิ่ม ลบคำตอบตนเอง เคารพguestlogin/publicprivateเดิม debugredactionเดิมใช้ได้ ไม่สร้างข้อความจริงแทนผู้ใช้

ผลเก็บงานตอบกลับ: migration0007เพิ่ม3คอลัมน์และดัชนีthreadแล้ว nullableไม่แก้rootเดิม ไม่มีselfFKที่ขัดขวางmediaFKcascade ตรวจSHOWCOLUMNS/INDEXจริง readroot200/missingthread404 ไม่seedคำตอบจริง ReplyAPIเริ่มหน้าล่าสุด30แล้วโหลดเก่า UIเรียงascendingในหน้าที่โหลด บันทึกคำตอบแล้วrefreshrootเก่าด้วยendpointแยก เพื่อไม่ทิ้งrootที่โหลดไว้/ไม่ซ่อนคำตอบใหม่ในเธรดเกิน30 เมื่อrootdeletedและลบคำตอบสุดท้าย mergeตัดtombstoneว่างออก regressiontestครอบคลุม แก้confirmedreviewissueแล้ว Tests203ผ่าน typecheck+fullbuild/staticbuildผ่าน ไม่มีmanualสองบัญชีจริงหรืออ้างmockพิสูจน์transactionจริง ไม่มีnotificationsในงานนี้

## ปุ่มบันทึกในหน้าแก้ไขโปรไฟล์
หน้าโปรไฟล์ส่วนตัวเดิมมีปุ่มบันทึกท้ายฟอร์มแต่หาได้ยาก เพิ่มปุ่ม “บันทึกโปรไฟล์” ที่หัวหน้าข้างยกเลิกและเปลี่ยนชื่อปุ่มท้ายฟอร์มให้ตรงกัน ใช้form idกับsubmitเดิมทั้งสองตำแหน่ง ไม่เปลี่ยนlocal-onlyเป็นpublic ปุ่มpending/disabledระหว่างอ่านหรือย่อรูป/บันทึก ป้องกันsubmitซ้ำด้วยref ให้validationและIndexedDBสำเร็จก่อนปิดeditorและแจ้งsuccess; ล้มเหลวเก็บdraftและeditorให้retry ปิดinputsและcancelระหว่างsaveเพื่อกันdraftถูกเปลี่ยนหลังsnapshot โปรไฟล์Arenaยังใช้ปุ่มบันทึกเฉพาะโปรไฟล์เดิมและconsentเดิม

## โปรไฟล์บัญชีซิงค์และแจ้งเตือนความคิดเห็น
เพิ่ม user_profiles ผูกกับบัญชี session จริง พร้อมรูป avatar/cover ใน MySQL และ revision ป้องกันแก้ชนกัน ผู้เยี่ยมชมใช้ local profile เดิม ผู้ล็อกอินบันทึกและโหลด server ผ่านบัญชีเดียวกันทุกอุปกรณ์ ไม่ย้ายข้อมูล/รูปเก่าอัตโนมัติ มีปุ่มนำเข้าจากเครื่องที่ผู้ใช้เลือกเอง และไม่ fallback local แล้วอ้างว่าซิงค์สำเร็จ ข้อมูลโปรไฟล์บัญชีเป็นส่วนตัวในรอบนี้
public_media เพิ่ม ownerUserId nullable: โพสต์ใหม่ผูกเจ้าของเมื่อมี session โพสต์เก่าใช้ token เจ้าของเพื่อผูกบัญชี ไม่เดาเจ้าของ user_notifications สร้าง transaction เดียวกับ comment/reply ไม่แจ้งตนเองและไม่ซ้ำ UUID ส่งเจ้าของโพสต์และผู้ถูกตอบ รวมหนึ่งเหตุการณ์เมื่อเป็นคนเดียวกัน API ตรวจ session ผู้รับเท่านั้น กระดิ่งยอดยังไม่อ่าน รายการโหลดเพิ่ม mark-read และเปิด Comments/เธรดต้นทาง Polling ขณะเปิดแอป ไม่ใช่ push/email ขณะปิดเว็บ ไม่ส่ง userId/email/token สู่ผลสาธารณะ ซ่อนรายการเมื่อข้อความ/โพสต์ถูกลบ

ผลรอบซิงค์บัญชีและแจ้งเตือน: APIโปรไฟล์คืนcanonicalmetadata/revisionภายใต้transactionที่ล็อกบัญชี ไม่อ่านหลังcommitอีกครั้ง; คอมเมนต์คงชื่อสาธารณะเดิม ไม่ดึงdisplayNameจากprivateuser_profiles อัปเดตกระดิ่งทุก15วินาทีเฉพาะvisiblepageพร้อมguardread/pagination/accountchange. ตรวจread-onlyอิสระและแก้ข้อมูลส่วนตัวรั่วแล้ว tests250ผ่านพร้อมtsc/build. browserปุ่มบันทึกค่าเดิมlocalผ่าน; positive writesและแจ้งเตือนใช้DBmocks ไม่แสร้งว่าทดสอบบัญชีจริงสองอุปกรณ์แล้ว. ข้อมูลบัญชีคงส่วนตัวและlocalfilesไม่ย้ายอัตโนมัติ.

## ตัวตนเจ้าของโพสต์สาธารณะจากบัญชีที่ล็อกอิน
โพสต์ใหม่ใช้ session ที่ server ตรวจแล้วเป็นเจ้าของเสมอ ไม่รับ owner/name/avatar จาก metadata client; ถ้า client แจ้งว่าใช้บัญชีแต่ session หมดอายุให้401ไม่ลดเป็นguest เฉพาะ guest จริงยังโพสต์ได้ตามนโยบายเดิม เพิ่ม public_media_creators แบบ additive ใช้ public ID สุ่มแยก user ID เก็บเฉพาะชื่อที่แสดง handle และรูป avatar ที่บันทึกในบัญชี ณ การโพสต์/ผูกโพสต์ครั้งแรก ห้ามเปิด private profile, bio, location, website, cover, email หรือ openId ทั้งชุด เมื่อแก้โปรไฟล์บัญชีอัปเดตเฉพาะ public identity ที่เคยสร้างแล้ว ไม่ทำบัญชีที่ยังไม่โพสต์เป็นสาธารณะ รูปส่วนตัวเดิมIndexedDBไม่ถูกย้ายอัตโนมัติ กรณียังไม่มีโปรไฟล์ใช้ชื่อบัญชีที่ไม่ใช่อีเมล/ชื่อกลางและavatarอักษรแทน
แสดงตัวตนผู้โพสต์และคำเตือนก่อนส่งใน PublicMediaLibrary; ฟีดแสดงรูป/ชื่อจริงจากpublic identity รวมโพสต์ของบัญชีเดียวกันและกดชื่อ/รูปดูโปรไฟล์publicพร้อมpagination เฉพาะโพสต์ที่ผูกไว้ anonymousคนละโพสต์ยังแยกและdemoคงตัวอย่าง API metadataไม่ส่งuserId/token/BLOB และรูปpublicผ่านเส้นทางจำกัดเฉพาะavatarของpublic identity คงสิทธิ์ลบและแจ้งเตือนเดิม จัดการโพสต์บัญชีได้ข้ามอุปกรณ์ รักษาthemelime/cyanและkeyboard ไม่publishเวอร์ชันนี้

ผลตัวตนเจ้าของโพสต์: ตารางpublic_media_creatorsและindexowner_created_idapplyแล้ว; metadataฟีดและprofileใช้joinเฉพาะpublicidentity รูปpublicเรียกendpointเฉพาะavatar ข้อมูลprivateprofileยังตรวจsession. เมื่อแก้ชื่อhandleavatar updateexistingpubliccreatorในtransactionเดียวกับบันทึกprivateprofile อัปโหลดใหม่ล็อกบัญชีก่อนสร้างidentity/โพสต์ Claimเก่าล็อกaccount→mediaและตรวจtokenก่อนpublishidentity อัปโหลดexpectedaccountแต่sessionหมดอายุ401 ไม่รับownerจากmetadata. Tests267ผ่านและread-onlyreviewไม่พบconfirmedissue การทดสอบpostจริงด้วยบัญชีผู้ใช้ยังไม่ได้ทำและไม่เผยแพร่buildใหม่.

## สถิติคนดังอ้างอิงในขิงขิง
เริ่มชุดข้อมูลบุคคลสาธารณะ 6 คนจากกีฬา100เมตรและTikTok แหล่งทางการ/ข้อมูลสาธารณะที่เข้าถึงได้เท่านั้น ไม่แต่งผลตอบแทนลงทุนหรือยอดไลค์ ข้อมูลเก็บในตารางarena_public_referencesแยกจากusers/arena_profiles/entries ไม่สร้างบัญชีหรือสิทธิ์แชทปลอม ไม่ติดป้ายผู้ดูแลรับรอง/AIverifiedให้คนดัง ใช้ชื่อและavatarอักษรในกรอบอันดับพร้อมป้ายข้อมูลอ้างอิงและsourceURL/date/excerpt ทุกrecord
career-bestกีฬาจัดอันดับเฉพาะชุดบุคคลที่นำเข้าหน่วยเดียวกันและscopeเดียวกัน ไม่ใช่รายเดือน ส่วนsocialsnapshotแยกวันที่สถิติให้เลือก ไม่รวมข้อมูลคนละวันที่เป็นrankingปัจจุบัน ตัวเลขแหล่งปัดเศษแสดง≈และdisplayValueเดิม เก็บeventDate/observedAt/retrievedAtแยกกัน UIอยู่ในแท็บขิงขิงหมวดที่เกี่ยวข้องก่อนอันดับชุมชน ใช้endpointGET /api/arena-referencesและscriptimportที่validate,idempotentโดยไม่มีpublicwriteAPI คงกรอบlime/cyanและทองเงินทองแดง ใช้ไฟล์JSONแหล่งข้อมูลตรวจแล้วเป็นauditและนำเข้าฐานข้อมูลจริง ไม่เผยแพร่buildใหม่หรือสร้างscheduleอัปเดตอัตโนมัติโดยไม่ได้ร้องขอ

ผลสถิติคนดัง: migration0011/0012applyจริงก่อนimport9รายการ6คนจากJSONที่ตรวจแหล่งแล้ว รอบนำเข้าซ้ำเพิ่ม0และคงข้อมูล9 ไม่สร้างบัญชีผู้ใช้หรือส่งข้อความแทนใคร APIอ่านกีฬา3/ผู้ติดตาม3/ไลค์3 พร้อมsource/data dates ผู้ตรวจเทียบต้นทางWAและTikTokแล้ว แก้UIกรองหมวดก่อนrenderและunique(personId,groupKey)ระดับDB และvalidateunknownboard/countintegerไม่ทำparserล้ม Tests276ผ่านพร้อมproductionbuild หน้าปัจจุบันเฉพาะPreview APIอ่านมีlimit1000/category; ไม่มีbackgroundrefreshหรือpublish.

## ขยายสถิติคนดังหลายด้าน
ขยายรายการบุคคลอ้างอิงอีก14คนที่มีแหล่งองค์กรกีฬาแพลตฟอร์มหรือผู้จัดรางวัล โดยไม่สัญญาครบทุกคน/ทุกข้อมูลและไม่ดึงข้อมูลส่วนตัว หมวดอ้างอิงใหม่ใช้registryแยกshared/referenceBoards.tsจากarenaBoardsของผู้แข่งขันเดิม รองรับกีฬาแยกชายหญิง/ประเภท,เหรียญโอลิมปิก,GrandSlamเดี่ยว,ประตูทีมชาติ,รางวัลGRAMMY,YouTubeviewsและplatformfollowers พร้อมcareer-totalแยกas-ofdate ไม่เปรียบเทียบรายงานยอดสะสมต่างวันในกลุ่มเดียวกัน PBคงcareerbestและวันที่ทำผลงาน แยกผลบริษัท/มูลค่าทรัพย์สินประมาณการจากผลตอบแทนส่วนตัวไม่เติมการลงทุนที่ไร้หลักฐาน
UIแผงเดิมเพิ่มเลือกดูหมวดปัจจุบันหรือทุกหมวดอ้างอิง มีจำนวนคน/รายการจากข้อมูลจริงและรายละเอียดคนดังที่แสดงทุกสถิติที่โหลดพร้อมแหล่งและวันที่ ไม่สร้างบัญชีหรือคะแนนรวม跨หน่วย ไม่เปลี่ยนกติกาบอร์ดชุมชน APIอ่านชุดข้อมูลแบบมีขอบเขต1000ไม่มีpublicwrite เก็บชุดJSONรอบใหม่แยกจากเดิมและนำเข้าinsert-onlyที่ไม่ทับข้อมูล ผู้ใช้ถามขยายจึงทำในscopeปัจจุบัน ไม่มีschedule/dataAPIที่ต้องเพิ่มauthหรือpublishใหม่

ผลขยายคนดัง: ใช้workflow14บุคคลพร้อมตรวจแหล่งรายบุคคล ผล25สถิติใหม่validateและนำเข้าDBแล้วรวม34สถิติ20คน scope7PB/14cumulatives/13snapshots มีsourceURLexcerptobserveddateeventdate ปรับnormalizeเฉพาะboardkeysสองตัวที่ผลวิจัยส่งคลาด ไม่แก้ค่าตัวเลข อิสระตรวจโค้ดread-onlyผ่าน284tests/productionbuild แผงดูทุกหมวดและเลือกบุคคลทุกสถิติที่โหลด คง9recordsเดิม scriptรอบสองเพิ่ม0ไม่มีทับข้อมูล ไม่รวมเพศประเภทหน่วยหรือasofต่างกันเป็นrankเดียว ไม่มีข้อมูลลงทุนส่วนตัวที่แหล่งไม่รองรับ ไม่publishใหม่

## หัวข้อการลงทุน — นักลงทุน กองทุน และบริษัท
เพิ่ม InvestmentReferences ในแท็บขิงขิง/หมวดการลงทุนแยกจากผลตอบแทนรายเดือนผู้ใช้เดิม ใช้ directory อ้างอิงทางการเริ่มต้น6รายชื่อ Warren Buffett, Ray Dalio, VOO, SPY, Berkshire Hathaway, Apple ไม่สร้างบัญชี/สิทธิ์ของบุคคลหรือบริษัทเหล่านี้ บริษัทแสดงทั้งผู้ลงทุนและบริษัทปลายทางที่ถือหุ้นผ่านrole/holdingsรายงาน การถือหุ้นไม่เท่ากับโอนเงินใหม่ให้บริษัท และไม่เป็นรายการซื้อขายเรียลไทม์
shared/investmentReferences.ts กำหนด validation facts/metrics/holdingsพร้อมแหล่งและวันที่ ใช้ตารางinvestment_public_references payloadต่อentityแบบadditive APIอ่านเท่านั้นserver/investments/routes.ts สคริปต์scripts/import-investment-references.ts insert-onlyไม่ทับรายการเดิม UIcomponents/arena/InvestmentReferences.tsxเลือกนักลงทุน/กองทุน/บริษัท ค้นชื่อและเรียงชื่อ ดูรายละเอียด/บริษัทที่ถือหุ้นพร้อมลิงก์แหล่ง metricมีเฉพาะที่ตรวจได้ หน่วยและbasisวันasofต้องตรงก่อนrank ไม่ใช้ชื่อเสียงwealth/AUMเป็นผลตอบแทนส่วนตัว ไม่คำนวณผลตอบแทนหรือคำแนะนำซื้อขาย ถ้าข้อมูลวันที่ไม่ระบุไม่เติมค่าเป็นศูนย์ ไม่มีautomationหรือpublicationใหม่

ผลหัวข้อการลงทุน:6รายชื่อในDBจริง พร้อมข้อมูลทางการผ่านworkflowรายentityและsource/date มีค่าธรรมเนียม3metricกับหุ้นที่รายงานถือ9รายการ(ค่าตัวเลขหายเป็นnull) นำเข้าซ้ำเพิ่ม0 APIพร้อมแยกข้อมูลผู้ใช้ ปรับชื่อหมวดเป็นการลงทุนคงstocks key/รายเดือนเดิม นักลงทุน2กองทุน2บริษัท2 มีสัมพันธ์VOO/SPY/Berkshire→Appleและแหล่งรายงานพร้อมวัน ตรวจ294tests/tsc/buildผ่าน ไม่มีเปลี่ยนหุ้น/การลงทุนของผู้ใช้หรือเผยแพร่ใหม่

## HedgeFollow — แหล่งอ้างอิงเพิ่มเติม
คำขอให้ใช้ https://hedgefollow.com/ อ้างอิง: เพิ่มกล่องแหล่งอ้างอิงในหัวข้อการลงทุนและลิงก์ตรงของ Berkshire Hathaway (รวมชื่อ Warren Buffett โดยระบุว่าเป็นพอร์ตองค์กรไม่ใช่พอร์ตส่วนตัว) และ Apple; หุ้นในรายการถือครองมีลิงก์ดูผู้ถือหุ้นตามสัญลักษณ์ที่ตรวจรูปแบบแล้ว ไม่เปลี่ยนตัวเลขจาก SEC/issuer เดิม ไม่สร้างข้อมูลกองทุนหรือถือหุ้นใหม่ ไม่เปิดการดึงเว็บใน browser/server ไม่มี cron หรือ scraping เนื่องจากข้อกำหนด HedgeFollow 2.2/2.5/2.6 ระบุให้ขอ written permission สำหรับ commercial use/copy/automated access. แสดงป้ายแหล่งรวบรวมเพิ่มเติม ไม่ใช่การรับรองทางการ ไม่ใช่ข้อมูลเรียลไทม์ ผล performance ของเว็บไม่ใช้แทนผลตอบแทนจริงของบุคคล และพอร์ต 13F ไม่ครอบคลุมสินทรัพย์ทั้งหมด แยก entity mapping ใน client/src/lib/hedgeFollow.ts กับ UIcomponents/arena/HedgeFollowReference.tsx โดยไม่เพิ่ม schema หรือ DB writes.

ผล HedgeFollow: เพิ่มลิงก์อ้างอิงในหมวดลงทุน/รายละเอียดบุคคลและบริษัท พร้อมลิงก์หุ้นที่ตรวจ ticker ไม่คัดลอกตัวเลขหรือเปลี่ยนDB/อันดับเดิม ผ่าน TypeScript, 299 tests และ production build ไม่ทำ scraping และไม่เผยแพร่ใหม่

## แดชบอร์ดนักลงทุนและกองทุน — เบื้องต้น
เพิ่มหน้า /investments ในแอปขิงขิง เปิดได้จากแผงการลงทุนและแชร์ลิงก์ตรงได้ เป็นหน้าดูข้อมูลสาธารณะ ไม่ต้อง login ไม่ทำธุรกรรม ใช้ UI financial terminal/editorial สีดำอมเขียว lime/cyan ตามแบรนด์เดิม แถบซ้ายแบบ fixed rail บน desktop/แถบเลื่อนบนมือถือ ส่วนหัวมีชื่อ HedgeFollow reference dashboard กับสถานะ “รอคู่มือเชื่อมต่อ” ไม่อ้างว่าตัวเลขมาจาก HedgeFollow เมื่อยังไม่เชื่อม รายชื่อเด่น curated 4 องค์กร/บุคคลพร้อมลิงก์เดิมที่อ่านแล้ว (Berkshire/Warren Buffett, Bridgewater/Ray Dalio, Pershing Square/Bill Ackman, Duquesne/Stanley Druckenmiller); ป้ายชื่อบุคคลเป็นผู้เกี่ยวข้องที่เว็บใช้แสดง ไม่อ้างว่าเป็นผู้จัดการปัจจุบันหรือลูกค้าขิงขิง AUM13F/Performance/holdingsจากHedgeFollowยังไม่ใส่ตัวเลข แสดง—และเหตุผล ไม่มี scraping/APIที่เดา/credentialใหม่ ผู้ใช้ระบุว่ามีสิทธิ์แต่เอกสารและวิธีเชื่อมยังรอ
นำข้อมูลอ้างอิงทางการ 6 entities ที่มีแล้วผ่าน /api/investment-references โดย validate contract แสดงแยกจากรายชื่อ HedgeFollow ชัด มี summary จำนวนรายชื่อ/กองทุน/ตัวอย่างถือหุ้นเฉพาะชุดโหลดสำเร็จ ค้น/กรองชนิด/เรียงชื่อได้ กดรายการดู facts, metrics/source/asof/basis และ holdings ตัวอย่าง; แผนภาพแท่งน้ำหนักหุ้นของกองทุนที่เลือกใช้สเกล 0–100% ไม่รวมคนละวัน ไม่คำนวณรวมAUM/ผลตอบแทนคนละฐาน ไม่มีกราฟราคา/เส้นแนวโน้มสมมติ ค่าไม่ทราบไม่แทนศูนย์ ไม่มีอันดับความเก่งหรือคำแนะนำซื้อขาย ปุ่มโหลดใหม่ refreshDB ไม่อ้างว่าซิงค์HedgeFollow สถานะerror/loading/empty แสดงจริงพร้อมretry
โครงสร้าง: lib/investmentDashboard.ts curated link metadata/filters/counts, hooks/useInvestmentReferences.ts validatedAPI, components/investments/InvestmentDataExplorer.tsx รายการ/รายละเอียด/น้ำหนัก, pages/InvestmentDashboard.tsx shell/featured/source-state, components/investments/investment-dashboard.css responsive/keyboard/reduced-motion ไม่เพิ่มDBหรือแตะข้อมูลส่วนตัว/โพสต์เดิม คงhybrid routing /api/* server กับ /* static SPA เพิ่มmanifest /investments; บันทึกmainโดยไม่publishใหม่

ผลแดชบอร์ดเบื้องต้น: route /investments พร้อมทางเข้าจากหมวดการลงทุน รายชื่อเด่น4องค์กรเป็นลิงก์อ้างอิง ไม่ใส่ตัวเลขHedgeFollowที่ยังไม่เชื่อม ข้อมูลทางการ6entities/2ETF/9holdingexamplesแสดงจากDBแยกแหล่ง ตรวจTypeScriptและ307testsผ่าน production/staticbuildผ่าน Preview200 manifestครบ reviewerไม่พบfunctional/provenanceissue แก้contrastfooterที่พบแล้ว ไม่เปลี่ยนDBหรือpublishใหม่

## จำนวนครั้งเปิดดูอันดับ
เพิ่มป้ายไอคอนตา “เปิดดู N ครั้ง” ที่แต่ละรายการ/เดือนอันดับชุมชน ชุดเทียบคนดัง ตัวชี้วัดกองทุน และการ์ดสถิติ/รายชื่อลงทุน นับการเปิดหน้ารายการหลังโหลดสำเร็จและคลิกเปิดรายละเอียดเท่านั้น ไม่ใช่คนไม่ซ้ำ ไม่ใช่ยอดจากHedgeFollow ไม่เปลี่ยนrankตามผลงาน เริ่มจากศูนย์เมื่อเปิดระบบ ไม่สร้างยอดย้อนหลัง; กรองชื่อ/เรียง/รีเฟรชข้อมูลในหน้าเดิมไม่เพิ่มยอด กลุ่มเปลี่ยนkeyนับการเปิดใหม่ เมื่อคลิกชื่อ/avatarของอันดับชุมชนบันทึกการเปิดสถิติentryนั้น (ไม่รวบรวมprivateprofile); investmententityใช้ยอดเดียวกันหน้าArena/dashboard ไม่มีการนับลิงก์ภายนอกที่ยังไม่เปิดหน้าในขิงขิง
ใช้shared/rankingViews.ts contract, server/ranking-views/{core,routes}.ts ตรวจtargetจริงและatomictransaction MySQL, client/lib/rankingViews.ts API, hook useRankingViews สำหรับbatchอ่านรายการและการเพิ่มจากclick, RankingViewBadgeสำหรับป้ายและนับเปิดกลุ่ม มีโควต้าและbodylimit/headerไม่รับยอดจากclient เก็บaggregateกับUUIDeventเพื่อกันretryซ้ำในหน้าต่าง24ชั่วโมง ล้างeventเก่าจำนวนจำกัดแบบbest-effortเมื่อมีคำขอ ไม่รับประกันลบแถวทันทีครบ24ชั่วโมง ไม่เก็บIP/ชื่อ/email/devicefingerprintในDB (rate-limitใช้IPชั่วคราวในRAMเท่านั้น) ไม่มีAPIรีเซ็ต/แก้ยอด publicGETไม่เพิ่มยอด POSTตรวจว่ารายการมีจริง; abuseguardเบื้องต้นไม่ใช่ระบบantibotสมบูรณ์ UIแสดง—หากโหลดผิดไม่อ้างศูนย์ มีretry และsyncเมื่อกลับหน้า/tabvisible ไม่pollเบื้องหลัง privacylogปิดpayloadของendpointนี้ Additive migration สองตารางแยกจากข้อมูลเดิม routingAPIเดิมและmanifestไม่เปลี่ยน บันทึกmainโดยไม่publish

ผลตัวนับอันดับ: migration0014เพิ่มสองตารางสำเร็จจริง DBเริ่มtotal0 ไม่มีseedยอด; GETตัวนับตอบ200และไม่เพิ่มยอด TypeScript323tests production/staticbuildผ่าน ตรวจread-onlyพบdistinctclickqueueและhiddenreopeningแก้พร้อมregressiontestsแล้ว ป้องกันคำขอเก่าทับยอดใหม่ มีtimeout12sและbatchURLจำกัด อ่านยอดจริงไม่poll เก็บIPชั่วคราวในRAMเพื่อrate-limitไม่ลงDB UUIDcleanupbest-effortหลังPOSTไม่ใช่guaranteedretention ไม่เพิ่มระบบmonitor/scheduleและไม่publishเวอร์ชันใหม่

## ผลตอบแทนนักลงทุนที่ผู้ใช้ส่งมา 6 ราย
เพิ่มส่วน “ผลงานระยะยาวของนักลงทุน” ในขิงขิง→การลงทุนและแดชบอร์ด/investments ใช้ตารางนักลงทุน บริษัท/กองทุน ช่วงเวลา ผลตอบแทนเฉลี่ยต่อปี พร้อมฐานค่าธรรมเนียมและสถานะหลักฐาน ไม่เอาCAGRบริษัท/กองทุนไปแทนผลส่วนตัว ไม่รวมกับrankผลตอบแทนรายเดือนของชุมชนและไม่จัดอันดับความเก่งต่างช่วงเวลา แยกตัวเลขที่ผู้ใช้ส่งจากค่าที่อ่านต้นทางได้จริง; หากช่วงเวลา/feeไม่ยืนยันชัดให้ป้ายpartial/unverified เก็บลิงก์เดิมและข้อสังเกต แหล่งที่ตรวจได้เป็นshortexcerptและretrievaldate รายการMedallionให้แยกnet39/gross66 ข้อเท็จจริงรายปีต้องมีsourceของตน
shared/investorReturns.tsเป็นschemaรายการผลตอบแทนเฉพาะ เก็บJSONpayloadในinvestor_return_referencesแบบadditive มีimport script idempotentไม่ทับrecordเดิม และpublicreadonlyAPI /api/investor-returns. client/components/investments/InvestorReturns.tsx ตารางค้น/เรียงชื่อหรือผลตอบแทน (ลำดับตัวเลขไม่ใช่rankนักลงทุน) คลิกชื่อเปิดdialogรายละเอียด แหล่งหลักฐาน statsเสริมและข้อจำกัด ปุ่มปิด/กลับเมนูเดิมและEscapeคืนfocus+ตำแหน่งเลื่อนเดิมโดยไม่เปลี่ยนroute/filter/menu dialogportalจำกัดfocus/backdrop ไม่publishใหม่และคงข้อมูลHedgeFollowสถานะรอคู่มือ บันทึกmainเมื่อchecksผ่าน

ผลลัพธ์ส่วนผลตอบแทน: ข้อมูล6รายการเข้าDBจริง migration0015เพิ่มตารางเท่านั้น นำเข้าซ้ำ0รายการไม่ทับของเดิม APItotal6 หน้าArenaและDashboardใช้ข้อมูลเดียวกัน Buffett/Ackmanconfirmed อีก4partialพร้อมวิธีคำนวณ/fees/แหล่งขัดแย้ง ยืนยัน339tests+types+server/staticbuildผ่านก่อนเก็บโค้ดท้าย ผู้ตรวจread-onlyไม่พบบั๊กอื่นนอกdateformatและblockquoteซึ่งถูกแก้แล้วในระหว่างตรวจ วันเปิดตรวจแสดงAsia/Bangkok และสรุปหลักฐานไม่ใช้blockquote มีregressiontestsเพิ่ม ไม่เปิดbrowserทดสอบdialogในรอบนี้: ยืนยันโค้ดRadix/focusreturnและunitrestore scroll ไม่อ้างE2Ebrowserผ่าน

## หน้าล็อกอินใหม่ — ปุ่มเข้าสู่ระบบชัดเจน
ปรับหน้า / และ /login โดยรักษาแบรนด์ขิงขิงและ OAuth Manus ที่มีอยู่ ไม่สร้างฟอร์มรหัสผ่านหรือปุ่มผู้ให้บริการที่ไม่เชื่อมจริง ใช้ login card เป็นจุดสำคัญ: ปุ่ม “เข้าสู่ระบบ” พร้อม LOGIN อยู่ก่อนรายละเอียดฟีเจอร์ และแสดง card ก่อนข้อความแนะนำบนมือถือ มีปุ่มเข้าสู่ระบบเพิ่มเติมในแถบบน desktop เมื่อยังไม่มี session ยังคง guest feed และสถานะ authenticated เดิม ปุ่มทั้งสองเรียก startLogin ผ่าน handler เดียวกัน ล็อกกดซ้ำระหว่างนำทาง และแสดง loading/error/retry แบบเข้าถึงได้ ไม่เริ่ม OAuth ระหว่าง render ไม่เปลี่ยน callback/cookie/role หรือข้อมูลผู้ใช้ โทน esports editorial สีหมึก/lime/cyan ใช้โลโก้และ typography เดิม ไม่เพิ่มภาพตกแต่งใหม่

ผลหน้าล็อกอินใหม่: ปุ่มหลัก LOGIN อยู่เหนือฟีเจอร์ และมีปุ่มแถบบน ใช้ handler เดียวกันพร้อม ref กันกดซ้ำ มือถือ login card อยู่ก่อน story บัญชีจริงยังเข้าแอป/ออกจากระบบได้ guest เข้าฟีดได้ TypeScript/343 tests/serverbuildผ่าน browserกดปุ่มหลักแล้วนำทางไป Manus /app-auth พร้อม appId/callback/state จริง ไม่กรอก credentials/ไม่อ้างว่าล็อกอินบัญชีสำเร็จ ชื่อPlayfolioบนหน้าผู้ให้บริการภายนอกยังไม่แก้ผ่าน code นี้

## ยอดวิวรูปและวิดีโอสาธารณะ
เพิ่มยอดดูร่วมใน Managed MySQL แยกตาราง public_media_view_totals/events ผูก FK กับ public_media แบบ cascade ไม่แก้ BLOB หรือแต่งยอดย้อนหลัง เริ่ม0เมื่อเปิดระบบ metadataส่ง viewCount และ API /api/media-views/:id ตรวจโพสต์จริงก่อนนับ ใช้ UUID ป้องกัน retryซ้ำใน24ชั่วโมงและ transactionล็อกโพสต์กันlostupdate ไม่เก็บIP/account/deviceในDB rate-limitIPชั่วคราวในRAMไม่ใช่antibotสมบูรณ์
Frontendนับเมื่อรูปโหลดสำเร็จและเห็น≥60%ต่อเนื่อง2วินาที หรือวิดีโอเล่นจริงในพื้นที่เดียวกัน2วินาที หยุดนับเมื่อแท็บซ่อน/เปิดComments/โปรไฟล์/Arena ไม่เพิ่มจากpreload/rangeAPI/metadata/การวนซ้ำ นับหนึ่งครั้งต่อโพสต์ในการเปิดหน้าฟีดครั้งนี้ รวมguest/login ไม่ใช่ผู้ชมไม่ซ้ำข้ามอุปกรณ์ ยอดใช้ฐานข้อมูลไม่ใช่localStorage มีป้ายตายอดเต็มบนฟีด/คลังสาธารณะ/โปรไฟล์public และคอลัมน์วิวที่เรียงได้ในตารางสถิติ ข้อมูลผิดหรือคำขอล้มเหลวแสดง—/retryไม่อ้างศูนย์ ไม่รวมdemo/private ไม่มีpushหรือscheduleใหม่ โครงสร้าง shared/mediaViews.ts, server/media-views/{core,routes}.ts และ clientโมดูลการดู แบรนด์และroutingเดิมคงอยู่ บันทึกmainตามสถานะauto-publishของผู้ใช้

ผลเก็บงานยอดวิว: migration0016 เพิ่ม tables/FK cascade แล้ว metadata+GETอ่านยอดตรงกัน เริ่ม0ไม่สร้างยอดทดสอบในDBจริง 361testsผ่าน typecheck/fullbuild/staticbuildผ่าน independentreviewไม่พบconfirmeddefect. Timerตรวจด้วยeffectharness ไม่ใช่browserintegrationของobserver/mediaevents; เบราว์เซอร์ไม่มีIntersectionObserverไม่เก็บวิวแทนการเดาการมองเห็น. ป้ายmobileเลื่อนใต้toplineและretryหลังกลับดูใช้UUIDเดิม. ตรวจ config ล่าสุด auto_publish=true จึงบันทึกmainตามการอนุญาตต่อเนื่อง ไม่ส่งpublishซ้ำและไม่อ้างเวอร์ชันใหม่liveจนมีผลยืนยัน.

## อัปโหลดโพสต์ใหญ่และความเข้ากันได้ 10 ต.ค. 2026
เพิ่มเพดานโพสต์สาธารณะเป็น 1,000 MiB/ไฟล์ (UI เรียก 1,000 MB และระบุฐาน 1024) คงแชท/หลักฐานที่ 20 MiB เดิม ใช้ shared/publicUpload.ts สำหรับ constants/ชนิดไฟล์, server/public-upload สำหรับ session capability+chunks 4MiB เก็บ Managed DB ไม่ต้องเปลี่ยนบริการ storage. เพิ่มตาราง upload sessions/staging chunks/final chunks และ storage_mode default legacy; public_media.data เดิมไม่เปลี่ยน เก็บ empty BLOB สำหรับโพสต์ใหม่แบบ chunks. เสร็จตรวจ/แปลงก่อนเผยแพร่ transaction พร้อม creator จาก session จริง; คำขอ complete ซ้ำใช้ ID/token เดิมไม่สร้างโพสต์ซ้ำ. อ่าน asset แบบ stream chunk/range ไม่ดึง >64MiB packet. รับ JPEG PNG WebP GIF BMP TIFF AVIF HEIC/HEIF และ MP4 MOV WebM MKV AVI M4V; sniff จาก bytes ไม่เชื่อ filename/MIME ตรวจ decoderและจำกัด resolution/duration/resources แปลงภาพเพิ่มเติมเป็น JPEG/PNG, วิดีโอเป็น MP4 H264/AAC เพื่อ compatibility (สูงสุด1080p 10นาที); ไม่รับ SVG/document/arbitrary file หรืออ้างซ่อมไฟล์เสีย/encrypted ได้ทุกไฟล์. เพิ่ม libheif tools ในDocker. UI แยก fileValidationError จาก networkErrorเพื่อ retry ไม่ต้องเลือกไฟล์ใหม่ มีprogressและแจ้งprocessing. ไฟล์ในเครื่องไม่แก้ต้นฉบับ ข้อมูล private เดิมไม่เผยแพร่.

ผลระบบโพสต์ไฟล์ใหญ่: รับต้นฉบับสูงสุด 1,000 MiB และวิดีโอไม่เกิน 600 วินาที; chunk 4 MiB ผ่าน session token และ session ผู้ส่งคงเดิมจน complete. เพิ่ม migration0017/0018 แบบ additive สำหรับ chunks/session/allocator: quota staging 100 sessions/2 GiB จองภายใต้แถวล็อกเดียว ตรวจก่อน INSERT, จำกัด 8 HTTP requests และ 2 conversion ต่อ instance ก่อน raw parser, เปิด session ≤20 ครั้ง/10 นาที/IP ใน RAM (ไม่เก็บ IP ลง DB). Staging หมดอายุ 24 ชม. ล้างแบบ lazy เมื่อเริ่มอัปโหลดใหม่ ไม่ใช่ scheduled cleanup; quota ไม่ใช่ total published storage. Complete lease ป้องกันงานซ้ำและไฟล์เผยแพร่ครั้งเดียว; token guest สำรองในหน่วยความจำเมื่อ storage ล้มเหลวหลังเผยแพร่. Asset streaming/range รองรับ chunk และ BLOB เดิม ไม่เขียน packet >4 MiB.

ตัวแปลงใช้ byte sniff + FFprobe/FFmpeg local-file allowlist, bounded threads/time/dimensions, วิดีโอ H264/AAC yuv420p faststart สูงสุด 1080p ไม่ upscale แหล่งเล็ก และตรวจความยาวหลังแปลงเพื่อไม่ตัดเงียบ. GIF/BMP/TIFF/AVIF ใช้ภาพแรกเป็น PNG; HEIC/HEIF ใช้ heif-info preflight และ heif-convert เป็น JPEG; JPEG/PNG/WebP ที่ decode ได้เก็บ bytes เดิม. ไม่รับประกันซ่อมไฟล์เสีย/encrypted/unsupported codecs. ทดสอบ real fixtures รูป JPEG/PNG/WebP/GIF/BMP/TIFF/AVIF และคลิป MOV/HEVC-MKV/WebM/AVI; HEIC successful decode ยังไม่ได้ทดสอบเนื่องจาก heif-enc ไม่มี HEIC encoder ใน environment. ชุด HTTP/database/client tests ใช้ isolated mocks ไม่อัปโหลดโพสต์ทดสอบในฐานข้อมูลร่วม. ไม่มีการเปลี่ยนเพดาน 20 MiB ของหลักฐาน AI/แชทหรือเผยแพร่ไฟล์ private เดิม. Main checkpoint เป็น auto-publish ตามค่าที่ผู้ใช้เปิดไว้ ไม่สรุปเผยแพร่สำเร็จจาก push อย่างเดียว.

## ขิงขิงในค้นพบผลงาน — 10 ต.ค. 2026
เพิ่มแถบเลือกสองคอลัมน์ “ผลงาน” และ “ขิงขิง” ในเมนูค้นพบผลงาน โดยเริ่มที่แกลเลอรีตัวอย่างเดิม และแท็บขิงขิงแสดง KhingArena ตัวเดียวกับฟีด ใช้ API/หมวด/กรอบแรงค์/รายละเอียด/ตารางไฟล์/แชทเดิม ไม่คัดลอกหรือสร้างสถิติใหม่ คงแท็บขิงขิงถัดจากสำหรับคุณบนฟีด. Home เก็บตัวเลือกค้นพบเพื่อกลับเมนูเดิมได้; unmount เนื้อหาที่ไม่ได้เลือกเพื่อไม่เล่นวิดีโอ/เก็บยอดดูของส่วนที่ซ่อน. ส่ง likedIds/savedIds ชุดเดิมไป Arena; เปิดโพสต์จากตารางใช้ hash feed-public-ID และกลับฟีดสำหรับคุณ ส่วนปุ่มแชทเรียก ChatTarget เดิม. แยก DiscoverWorks component/styles/tests, ไม่เพิ่ม route หรือ migration; ปุ่มเลือก accessible pressed state และ focus ring สี lime/cyan ตามดีไซน์เดิม.

## สำหรับคุณ — สไลด์และความชอบรายบุคคล 10 ต.ค. 2026
คง feed ภาพ/วิดีโอ fullscreen scroll-snap แต่ปรับ gesture ปัดขึ้น/ลงให้เปลี่ยนทีละโพสต์บนมือถือ พร้อมปุ่มถัดไป/ก่อนหน้าและ ArrowUp/Down สำหรับ desktop; native wheel scroll-snap ยังคงใช้ได้ ไม่ดัก gesture ใน input/ปุ่ม/แผง Comments/Arena. เล่นเฉพาะโพสต์ active/visible และหยุดเมื่อ document hidden. โหลดหน้าถัดไปอัตโนมัติใกล้ท้ายฟีด มี manual retry. จัดอันดับ public candidates ที่โหลดแล้วโดยใช้ความชอบรูป/วิดีโอ หมวดจาก hashtag/คำสำคัญใน title/description ตัวตน creator สาธารณะ และสัญญาณไลค์/บันทึก/ดูนาน/ข้ามเร็ว/ไม่สนใจ; ไม่มีการเดาข้อมูล demographic/sensitive หรือเรียก LLM. คงลำดับระหว่างดู ไม่กระโดดเมื่อสัญญาณเข้า จัดใหม่เมื่อรีเฟรชและหน้าถัดไป มี exploration/diversity ไม่ให้ creator เดียวครองทุกอันดับ. แสดงสาเหตุแนะนำ/ขอบเขตเฉพาะ candidate ที่โหลด ไม่อ้างระบบ global TikTok algorithm.
บัญชีล็อกอินใช้ Managed MySQL+session เป็นเจ้าของสัญญาณ private และอ่านข้ามอุปกรณ์; visitor เก็บ local-only ข้าม reload ได้ถ้า storage พร้อม ไม่มี fingerprint/IP identity/ย้าย guest preference ขึ้นบัญชีอัตโนมัติ. API กำหนด topics/creator จาก metadata server ไม่รับ userId จาก client มี validation/idempotent UUID/retry/limits และ response no-store; UI แสดงสถานะ sync/guest/failure และไม่อ้างว่า sync หากล้มเหลว มี “ไม่สนใจ” และปิดการปรับตามความชอบได้. Like/save preferences เป็นความชอบส่วนตัวไม่ใช่ยอด likes สาธารณะ เป้าหมาย private/demo ไม่ส่ง server หรือใช้จัดอันดับผู้ใช้คนอื่น. เพิ่ม feed-personalization modules/shared pure core/tests และ migration additive ก่อน apply ไม่แตะโพสต์เก่า.
ผลดำเนินการ: migration 0019 เพิ่ม preferences/events และ apply แล้ว ยืนยัน tables/index/hash history ด้วย read-only SQL. ล็อก user→preferences→public media ก่อน update ภายใน transaction ป้องกันสัญญาณบัญชีเดียวกันชน; UUID เดิม payload ต่างกัน 409, daily limit 3000 และ request limit 120/minute ต่อ user ต่อ instance. Event log ไม่ล้างตามอายุ ไม่มี scheduler; คิวที่ยังส่งไม่สำเร็จอยู่ใน memory และ toggle ปิดเป็น browser setting ไม่ลบข้อมูลเดิม. Key ฟีดตามบัญชีและ neutral selector ป้องกันลำดับ/reason เดิมระหว่าง identity เปลี่ยน; append อ่านเฉพาะ preferences ที่ ready ไม่ส่ง ref เดิมออกจาก hook. useFeedVisibility fail closed เมื่อไม่มี IntersectionObserver แทน autoplay ทุกคลิป. ตรวจ 438tests/82files, TypeScript/full/static build และ Preview/manifest200; tests ใช้ mocks/SSR/pure/effect harness ไม่อ้างทดสอบ gesture/login ข้ามอุปกรณ์จริง. บันทึก main ตาม auto_publish=true แต่ต้องมี Dashboard ยืนยันก่อนอ้างว่าเวอร์ชันนี้เผยแพร่เสร็จ.
