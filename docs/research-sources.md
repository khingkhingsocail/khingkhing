# แหล่งข้อมูลและสมมติฐานที่ตรวจสอบ

ตรวจแหล่งข้อมูล: 6 ตุลาคม 2026

## Authentication — Firebase

- เอกสารหลัก: https://firebase.google.com/docs/auth/
- Firebase Authentication ระบุรองรับ phone-number authentication และ federated providers รวม Google, Apple และ Facebook โดยต้องเปิด sign-in methods ใน Firebase Console และตั้งค่า OAuth redirect/provider credentials ตามผู้ให้บริการ
- สรุปที่ใช้ในการออกแบบ: Firebase เป็นตัวเลือกที่ครอบคลุมช่องทางล็อกอินที่ขอ แต่การเชื่อมต่อจริงยังต้องมี Firebase project และการตั้งค่า provider/secret; ยังไม่ได้ต่อเข้ากับแอปขิงขิง

## วิดีโออัปโหลด/ส่งสตรีม — Cloudflare Stream

- Direct creator uploads: https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/
- Cloudflare ระบุว่าสามารถออก one-time upload URL จาก backend โดยไม่เปิด API token ให้ client; TUS เป็นทางเลือก resumable เมื่อเครือข่ายไม่เสถียรและเป็นข้อบังคับสำหรับไฟล์เกิน 200 MB; การสร้าง URL ต้องระบุ maxDurationSeconds เพื่อสำรอง duration สำหรับการอัปโหลด
- Delete video API: https://developers.cloudflare.com/api/resources/stream/methods/delete/
- API ลบด้วย `DELETE /accounts/{account_id}/stream/{identifier}` และระบุว่าลบวิดีโอรวมถึงสำเนา; ต้องใช้ API token ที่มี permission `Stream Write`
- สรุปที่ใช้ในการออกแบบ: เหมาะเป็นปลายทาง V1/V2 สำหรับวิดีโอสามนาทีและ delivery/transcoding; ยังไม่ได้เชื่อม และไม่แทนที่ Managed Database BLOB ที่ใช้อยู่จนกว่าจะยืนยันการย้ายและให้ credentials

## Live streaming — LiveKit

- Rooms/participants/tracks: https://docs.livekit.io/intro/basics/
- Egress: https://docs.livekit.io/transport/media/ingress-egress/egress/
- Rooms เป็นพื้นที่ realtime ที่มี participants และ tracks; Egress บันทึกเป็น MP4/HLS หรือส่ง live output ไปยังบริการ RTMP เช่น YouTube/Twitch/Facebook; LiveKit Cloud ต้องใช้ project/account configuration ส่วน self-hosted ต้องดูแล Egress service แยก
- สรุปที่ใช้ในการออกแบบ: แนะนำเป็น V2; ยังไม่ได้เชื่อม LiveKit หรือเปิด live feature

## ภาพตัวอย่าง UI

- ภาพตัวอย่างจาก image search ของ Unsplash, หัวข้อ “Neon Night Pictures”: https://unsplash.com/s/photos/neon-night
- Unsplash License: https://unsplash.com/license
- ใช้เป็น visual sample/placeholder ใน onboarding เท่านั้น ไม่สื่อว่าเป็นงานของผู้ใช้หรือบัญชีจริง; มี attribution ลิงก์กลับไป Unsplash ใน UI

## ขิงขิง Arena — อ้างอิงรูปแบบ Leaderboard

อ่าน 8 ตุลาคม 2026: https://ui-patterns.com/patterns/leaderboard — แนะนำเปรียบเทียบผู้เข้าร่วมในบริบทหมวดหมู่/ช่วงเวลาที่เหมือนกัน และมีหลาย view ตาม category/time; จึงเลือก board ต่อ metric/platform/unit และเดือน ไม่รวมกีฬากับยอด social เป็นคะแนนเดียว และไม่อ้างอันดับชุมชนเป็นอันดับโลก UI ของขิงขิงออกแบบ CSS/nameplate เอง ไม่ใช้ภาพหรือ template จากแหล่งนี้
