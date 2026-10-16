import { useEffect, useState } from "react";
import {
  getAccountProfile,
  fetchAccountProfileImage,
} from "@/lib/accountProfile";
import { commentAuthorName } from "../../../shared/comments";
import "./posting-identity.css";

export default function PostingIdentity({
  user,
}: {
  user: { id: number; name?: string | null } | null;
}) {
  const [identity, setIdentity] = useState<{
    name: string;
    handle: string;
    avatar: string | null;
  } | null>(null);
  const [warning, setWarning] = useState("");
  useEffect(() => {
    setIdentity(null);
    setWarning("");
    if (!user) return;
    let active = true;
    let objectUrl: string | null = null;
    const controller = new AbortController();
    void getAccountProfile(controller.signal)
      .then(async profile => {
        if (!active) return;
        const next = {
          name: commentAuthorName(profile?.displayName ?? user.name),
          handle: profile?.handle ?? "",
          avatar: null as string | null,
        };
        if (profile?.avatar) {
          try {
            const blob = await fetchAccountProfileImage(
              "avatar",
              controller.signal
            );
            if (!active) return;
            objectUrl = URL.createObjectURL(blob);
            next.avatar = objectUrl;
          } catch {
            if (active)
              setWarning(
                "ตัวอย่างรูปโหลดไม่ได้ เซิร์ฟเวอร์จะใช้รูปที่บันทึกไว้ล่าสุด"
              );
          }
        }
        if (active) setIdentity(next);
      })
      .catch(() => {
        if (active) {
          setIdentity({
            name: commentAuthorName(user.name),
            handle: "",
            avatar: null,
          });
          setWarning(
            "โหลดตัวอย่างโปรไฟล์ไม่สำเร็จ เซิร์ฟเวอร์จะใช้ข้อมูลโปรไฟล์ที่บันทึกไว้ล่าสุด"
          );
        }
      });
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [user?.id]);
  if (!user)
    return (
      <p className="posting-identity" role="note">
        โพสต์ในฐานะผู้เข้าชม · ไม่ระบุตัวตน ผู้เยี่ยมชมยังโพสต์ได้ตามเดิม
      </p>
    );
  return (
    <div className="posting-identity manus-no-record" role="note">
      <span className="posting-identity__avatar">
        {identity?.avatar ? (
          <img src={identity.avatar} alt="รูปโปรไฟล์ที่จะใช้โพสต์" />
        ) : (
          (identity?.name ?? "ข").slice(0, 1)
        )}
      </span>
      <div>
        <strong>โพสต์ในชื่อ {identity?.name ?? "กำลังโหลดโปรไฟล์…"}</strong>
        {identity?.handle ? <span>@{identity.handle}</span> : null}
        <p>
          ผูกกับบัญชีที่เข้าสู่ระบบ · ทุกคนเห็นชื่อ ชื่อผู้ใช้
          และรูปโปรไฟล์บนโพสต์ ไม่เผยรูปปกหรือข้อมูลส่วนตัวอื่น
        </p>
        {warning ? <small>{warning}</small> : null}
      </div>
    </div>
  );
}
