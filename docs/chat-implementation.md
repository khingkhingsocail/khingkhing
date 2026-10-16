# ขิงขิง Chat — การใช้งานและขอบเขต

เมนู **ข้อความ** ใช้บัญชี Manus OAuth จริง พร้อม nickname แชท ไม่ใช้โปรไฟล์ local IndexedDB เป็นตัวตน ไม่ใช้ Arena token อ่านข้อความ ผู้รับต้องเปิดเมนูแชทและตั้งชื่อก่อนค้นหาได้ บัญชีที่สมัครแชทจะถูกค้นด้วย nickname หรือ handle ของ Arena ที่เลือกผูก โดยไม่เผยแพร่ email/openId

## ห้อง

| ประเภท | การเข้าร่วม | สิทธิ์อ่านและส่ง |
| --- | --- | --- |
| DM | เลือกผู้รับใน directory ผู้รับตอบรับคำเชิญ | สมาชิก active ของคู่นั้นเท่านั้น; ปฏิเสธ/ออกแล้วไม่รับคำเชิญเดิมซ้ำ |
| กลุ่ม | ตั้งชื่อและเลือกผู้รับสูงสุด49คน รวมผู้สร้าง50 เจ้าของเชิญเพิ่มได้ | ผู้รับต้องตอบรับก่อนอ่านประวัติทั้งหมด; สมาชิกออกได้ เจ้าของกลุ่มคงอยู่ใน MVP |
| หมวดแข่งขัน | กีฬา หุ้น ผู้ติดตาม ไลค์ และสถิติอื่น/โลก แยกเดือน | ผูกโปรไฟล์ Arena ด้วย session จริง+edit token และลงสถิติตรงหมวด/เดือน ก่อนกดเข้าร่วม |
| รายการแข่งขัน | แยก boardKey และเดือน | เช่นวิ่ง100เมตร/เดือน ไม่รวมกับบอร์ดอื่น; เกณฑ์เข้าร่วมเช่นเดียวกับหมวด |

ปุ่มจากโปรไฟล์ Arena เลือกผู้รับผ่านการผูก chat account ที่เจ้าของสร้างไว้ ไม่สามารถส่ง DM ไป anonymous/demo feed profiles เพราะไม่มีตัวตนผู้รับจริง ปุ่มห้องใน Arena เปิดรายชื่อห้องและเดือนที่เกี่ยวข้อง การส่งหลักฐานไป AI ไม่ได้ส่งเข้าห้องแชทอัตโนมัติ

## การส่งและไฟล์

ข้อความสูงสุด2000อักษร แนบJPG/PNG/WebP/MP4/WebM สูงสุด3ไฟล์/ข้อความ ไม่เกิน20MiBต่อไฟล์ รวม50MiB คลิปไม่เกิน3นาที/4096px ใช้FFprobe/FFmpegตรวจserverเดิม เก็บBLOBส่วนตัวในMySQLร่วมกับmetadata จำกัดพื้นที่ไฟล์แชท200MiBต่อผู้ส่ง ไม่มีpublic CDN URL Frontendเปิดไฟล์ผ่านsession-authenticated fetch และสร้างblob URLชั่วคราว ยกเลิก/revokeเมื่อปิดตัวอย่างหรือเปลี่ยนห้อง

ข้อความและไฟล์ commit ภายใน transactionเดียว ใช้client UUIDกับpayload hashสำหรับretry ผลตอบรับสูญหายแต่commitแล้วสามารถใช้UUIDเดิมรับผลเก่าได้ ไม่บันทึกซ้ำในroom/sender/clientUUIDเดียวกัน ส่งใหม่ด้วยเนื้อหาต่างกันแต่UUIDเดิมถูกปฏิเสธ (รวมชื่อไฟล์ที่normalizeแล้ว) ผู้ส่งเป็นsessionผู้ใช้serverกำหนด ไม่รับsenderIdจากclient ล็อกบัญชีโควต้าพื้นที่→room→membership ตรวจสมาชิกซ้ำก่อนcommit GETmetadata/ไฟล์ไม่ดึงBLOBก่อนตรวจสิทธิ์

ใช้custom X-Khing-Chat headerสำหรับคำขอเขียนเพื่อไม่รับ cross-origin simple HTML form; ไม่มีCORSอนุญาตoriginอื่น จำกัดอ่าน120และเขียน30คำขอ/นาที/บัญชี และdecodeรับสื่อพร้อมกันสูงสุด2คำขอ/process ไม่ใช่distributed rate limit ไม่มีadministrator bypass เพื่ออ่านบทสนทนาจากAPI

## ความเป็นส่วนตัวและข้อจำกัด

HTTPS+session+membership access control **ไม่ใช่E2EE** ผู้ดำเนินการServer/Databaseอาจเข้าถึงข้อมูล สมาชิกที่รับไฟล์อาจบันทึกสำเนานอกแอปได้ การออกห้องปิดสิทธิ์ดึงข้อมูลใหม่ แต่เรียกคืนสำเนาที่ดาวน์โหลดแล้วไม่ได้ ไม่มีmessage deletion/retention policy, read receipts, presence, push notifications, moderation/reporting, owner-transfer, encryption-at-restเฉพาะแอป หรือWebSocketในรอบนี้ ควรพัฒนาเพิ่มเติมก่อนเปิดใช้วงกว้างกับข้อมูลละเอียดอ่อน

UI inboxและmessage incremental pollingทุก4วินาทีเมื่อdocumentvisible หน้าmessagesใช้sequencecursorครั้งละ50รายการพร้อมโหลดเก่า inboxมีcursorเวลา/idและโหลดห้องก่อนหน้าได้ ไม่ตัดห้องเก่าที่เกิน100ห้อง รายชื่อสมาชิกห้องใหญ่แสดงสูงสุด50ชื่อ ไม่อ้างว่าเป็นยอดรวมทั้งหมด ข้อความescapeโดยReact ไม่renderHTML ดูสถานะpollingโดยไม่อ้างว่าเป็นWebSocket realtime ปุ่มส่งมีdraftคงเมื่อAPIล้มเหลวที่ยังอยู่ห้องเดิม ไม่รับรองการกู้draftหลังเปลี่ยนห้อง/ปิดbrowser ไม่มีประวัติข้อความส่วนตัวถูกเก็บในlocalStorage; XHR/fetch /api/chatถูกแยกออกจากdebug collectorและUIใช้manus-no-record

## โครงสร้างและการส่งมอบ

`shared/chat.ts` contract/validation; `server/chat/core.ts` สิทธิ์/eligibility/hash; `server/chat/routes.ts` HTTP+transaction; `client/src/lib/chat.ts` session transport; `client/src/components/chat/` UI; `drizzle/0005_fantastic_sharon_ventura.sql` เพิ่มตาราง5ตารางโดยไม่แก้หรือลบข้อมูลเดิม การสร้างDM/channelใช้bounded transaction retryสูงสุด3ครั้งสำหรับunique-key/deadlockเพื่อให้ห้องcanonicalเดียวกัน และปฏิเสธboardKeyว่าง ใช้ManagedDBเดียวกับpublicapp ไม่มีseedข้อความ/ผู้ใช้ปลอมในDBจริง

Checks: typecheckและproduction buildผ่าน testsแชทAPI/permissions/invites/file delivery/retryใช้SDKและDBmockเพื่อไม่ส่งข้อความแทนบัญชีจริง real logged-out /api/chat/meได้401 public mediaเดิมและPreviewได้200 migrationตารางใหม่applyแล้ว การส่งข้อความข้ามสองบัญชีจริงต้องทำหลังทั้งสองบัญชีเข้าสู่ระบบและเปิดใช้แชท ข้อมูลที่โหลดของคนอื่น/ห้องอื่นต้องไม่รวมกับการโหลดประวัติที่กลับช้า
