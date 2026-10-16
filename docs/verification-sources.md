# แหล่งอ้างอิงระบบตรวจหลักฐาน Arena

ตรวจ 8 ตุลาคม 2026

## การรับรองสถิติโลกและกีฬา

https://www.guinnessworldrecords.com/records/how-to-collect-and-submit-evidence — หน้า official ระบุให้ปฏิบัติตาม record guidelines พร้อมหลักฐานที่กำหนด ต้องมี cover letter ทุก record, พยานอย่างน้อย 2 คน และ timekeeper สำหรับสถิติที่อิงเวลา มีคู่มือวิดีโอ/ภาพเฉพาะ ดังนั้น AI อ่านภาพ/เฟรมอย่างเดียวไม่ใช่การรับรอง Guinness หรือหลักฐานว่าเป็นสถิติโลกอย่างเป็นทางการ

https://worldathletics.org/records/send-competition-results — ตั้งแต่ 1 มกราคม 2023 องค์กรรับผลจากการแข่งขันใน Global Calendar เท่านั้น; road races ต้องสนามรับรองและรายงาน gun times ให้ข้อมูล venue/ชื่อการแข่งขัน/date/ลิงก์หรือผลฉบับเต็ม ระบบ Arena จึงแยกแหล่ง official ออกจาก self-reported และต้องตรวจวิธีวัด/บริบท

## Runtime ที่ทดสอบจริง

Project `/v1/models` วันที่ตรวจพบ gemini-3.1-pro-preview และ gpt-5-mini พร้อม capabilities.builtin_tools.web_search.enabled=true ทดสอบ POST chat completions ด้วย tools=[{type:web_search}] กับ gpt-5-mini ได้ผล HTTP 200 มี message.metadata.annotations[].url_citation URL official Guinness ระบบใช้ URL citations ตาม contract นี้ แล้ว server อ่านหน้าจริงซ้ำ ไม่ถือเนื้อหาความจำหรือ snippet เป็นหลักฐาน

Vision ส่ง JPEG ที่ server decode แล้วเป็น image_url data URL และ response_format json_schema strict=true สำหรับ gemini-3.1-pro-preview ใช้ max_tokens ไม่ใช้ max_completion_tokens; ต้อง validate JSON อีกครั้ง Metadata ขอบเขตบอกเฟรมที่สุ่ม/ไม่อ่านเสียงและไม่อ้าง full continuity AI ไม่ใช่เครื่องมือยืนยันตัวตน การรับรองชุมชนเกิดจากผู้ดูแล session role admin ทบทวนต้นฉบับและแหล่งข้อมูล ไม่ใช่ AI จัดอันดับเอง
