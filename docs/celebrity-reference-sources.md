# สถิติคนดังอ้างอิงในขิงขิง

ชุดเริ่มต้น 6 บุคคล / 9 รายการ ดึงและตรวจหน้าแหล่งสาธารณะเมื่อ 9 ตุลาคม 2026 ตัวเลข TikTok เป็นค่าปัดเศษที่หน้าโปรไฟล์แสดงเมื่ออ่าน ไม่ใช่ยอดเรียลไทม์หรือจำนวนเต็มที่ยืนยันละเอียดกว่านั้น ข้อมูลนี้ไม่ใช่บัญชีคนดังที่สมัครขิงขิง ไม่ได้สื่อว่าบุคคลรับรองแอป และไม่ใช่ผลตรวจ AI/การรับรองโดยผู้ดูแล

| บุคคล | รายการ | ค่าแสดง | วันที่ทำผลงาน / อ่านยอด | แหล่ง |
| --- | --- | --- | --- | --- |
| Usain Bolt | วิ่ง 100 เมตร PB ถูกกติกา | 9.58 วินาที | ทำผลงาน 2009-08-16 | [World Athletics](https://worldathletics.org/athletes/jamaica/usain-bolt-14201847) |
| Yohan Blake | วิ่ง 100 เมตร PB ถูกกติกา | 9.69 วินาที | ทำผลงาน 2012-08-23 | [World Athletics](https://worldathletics.org/athletes/jamaica/yohan-blake-14201842) |
| Tyson Gay | วิ่ง 100 เมตร PB ถูกกติกา | 9.69 วินาที | ทำผลงาน 2009-09-20 | [World Athletics](https://worldathletics.org/records/all-time-toplists/sprints/100-metres/outdoor/men/senior) |
| Khaby Lame | ผู้ติดตาม / ไลค์รวม TikTok | ≈163M / ≈2.7B | อ่านยอด 2026-10-09 | [TikTok](https://www.tiktok.com/@khaby.lame?lang=en) |
| Charli D’Amelio | ผู้ติดตาม / ไลค์รวม TikTok | ≈160.3M / ≈12.4B | อ่านยอด 2026-10-09 | [TikTok](https://www.tiktok.com/@charlidamelio?lang=en) |
| Bella Poarch | ผู้ติดตาม / ไลค์รวม TikTok | ≈91.6M / ≈2.4B | อ่านยอด 2026-10-09 | [TikTok](https://www.tiktok.com/@bellapoarch?lang=en) |

## วิธีจัดอันดับและข้อจำกัด

อันดับกีฬาเปรียบเทียบ PB 100 เมตรของบุคคลที่นำเข้าเท่านั้น โดยเวลาน้อยดีกว่า คะแนนเท่ากันได้อันดับเดียวกัน จึงมี 1,2,2 ในชุดนี้ ไม่ใช่อันดับนักวิ่งทั้งหมดในโลก และไม่ใช่การแข่งขันเดือนปัจจุบัน ลม Bolt +0.9, Blake −0.1, Gay +2.0 m/s อยู่ในเกณฑ์กติกา ไม่ใช้เวลาที่แหล่งระบุว่าไม่ถูกกติกา

อันดับโซเชียลแยกยอดผู้ติดตามกับไลค์รวมและแยกวัน snapshot ตัวเลขย่อคง displayValue และป้าย ≈ ไม่เปลี่ยนยอดไลค์รายวิดีโอเป็นไลค์รวม การเปิดหน้า TikTok ยืนยันได้เพียงข้อมูลและ handle ที่หน้าสาธารณะแสดง ไม่ได้ตรวจตรายืนยันหรือตัวตนจริงของเจ้าของ

ข้อมูลจัดเก็บในตาราง `arena_public_references` แยกจาก `users`, `arena_profiles` และ `arena_entries` มี source URL, excerpt, notes, observedAt, eventDate, retrievedAt ในแต่ละรายการ ไม่มี login/edit token หรือสิทธิ์แชทคนดัง API `GET /api/arena-references?category=sports` เปิดอ่านเท่านั้น ส่วนการนำเข้าใช้ `pnpm exec tsx scripts/import-arena-references.ts data/celebrity-references.json` ซึ่งเป็น insert-only แบบไม่ทับข้อมูลเดิม มี unique person/group กันนำเข้าซ้ำ

หน้าแอปอยู่แท็บขิงขิง เลือกหมวดกีฬา ผู้ติดตาม หรือยอดไลค์ แล้วดูส่วน Public Benchmarks เหนืออันดับชุมชน กดชื่อเพื่อเปิดรายละเอียดหรือกดลิงก์แหล่งต้นฉบับ ไม่มีการเติมข้อมูลลงทุนหรือหมวดอื่นที่ยังตรวจไม่ได้ ไม่มีงานอัปเดตตามเวลาหรือ push อัตโนมัติ
