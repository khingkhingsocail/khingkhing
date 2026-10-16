import { useEffect, useState } from "react";
import { Camera, Check, Save, ShieldAlert, X } from "lucide-react";
import {
  arenaBoards,
  entryInputSchema,
  profileInputSchema,
  type ArenaBoard,
  type ArenaProfile,
} from "../../../../shared/arena";
import {
  arenaCapabilities,
  createArenaProfile,
  fetchArenaProfile,
  prepareArenaAvatar,
  saveArenaEntry,
  updateArenaProfile,
} from "@/lib/arena";
import EvidenceFilePicker from "./EvidenceFilePicker";
import { uploadEvidence } from "@/lib/verification";
import { evidenceFileKey, uploadEvidenceQueue } from "@/lib/evidenceFiles";

type SavedEvidenceTarget = {
  entryId: string;
  revision: string;
  profileId: string;
  boardKey: string;
  period: string;
};

const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok" }).format(
    new Date()
  );
export default function ArenaEntryForm({
  boards,
  defaultBoard,
  defaultPeriod,
  initialProfileId,
  onSaved,
  onClose,
}: {
  boards: ArenaBoard[];
  defaultBoard: string;
  defaultPeriod: string;
  initialProfileId?: string;
  onSaved: (boardKey: string, period: string, evidenceCount?: number) => void;
  onClose: () => void;
}) {
  const [ids] = useState(() => Object.keys(arenaCapabilities()));
  const [id, setId] = useState(initialProfileId ?? ids[0] ?? "");
  const [profile, setProfile] = useState<ArenaProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [boardKey, setBoardKey] = useState(defaultBoard || arenaBoards[0].key);
  const [period, setPeriod] = useState(defaultPeriod);
  const [observedAt, setObservedAt] = useState(
    defaultPeriod === today().slice(0, 7) ? today() : `${defaultPeriod}-01`
  );
  const [value, setValue] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [customUnit, setCustomUnit] = useState("");
  const [customDirection, setCustomDirection] = useState<"higher" | "lower">(
    "higher"
  );
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [profileLoading, setProfileLoading] = useState(Boolean(id));
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [evidenceConsent, setEvidenceConsent] = useState(false);
  const [savedTarget, setSavedTarget] = useState<SavedEvidenceTarget | null>(
    null
  );
  const [uploadedEvidenceCount, setUploadedEvidenceCount] = useState(0);
  const [uploadedEvidenceBytes, setUploadedEvidenceBytes] = useState(0);
  const selectedBoard = boards.find(b => b.key === boardKey);

  useEffect(() => {
    let active = true;
    setProfile(null);
    setDisplayName("");
    setHandle("");
    setBio("");
    setAvatar(null);
    setConsent(false);
    setEvidenceFiles([]);
    setEvidenceConsent(false);
    if (!id) {
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    setError("");
    fetchArenaProfile(id)
      .then(result => {
        if (!active) return;
        setProfile(result.profile);
        setDisplayName(result.profile.displayName);
        setHandle(result.profile.handle);
        setBio(result.profile.bio);
        setAvatar(result.profile.avatar);
      })
      .catch(cause => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "โหลดโปรไฟล์ไม่สำเร็จ"
          );
      })
      .finally(() => {
        if (active) setProfileLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  function changePeriod(next: string) {
    setPeriod(next);
    setObservedAt(next === today().slice(0, 7) ? today() : `${next}-01`);
  }

  async function selectAvatar(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      setAvatar(await prepareArenaAvatar(file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "เตรียมรูปไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function persistProfile(): Promise<ArenaProfile> {
    if (!consent)
      throw new Error("ยืนยันให้ข้อมูลโปรไฟล์นี้เป็นสาธารณะก่อนบันทึก");
    const parsed = profileInputSchema.safeParse({
      displayName,
      handle,
      bio,
      avatar,
    });
    if (!parsed.success)
      throw new Error(
        parsed.error.issues[0]?.message ?? "ข้อมูลโปรไฟล์ไม่ถูกต้อง"
      );
    if (id && !profile) throw new Error("โหลดโปรไฟล์เดิมให้สำเร็จก่อนแก้ไข");
    const result = profile
      ? await updateArenaProfile(profile.id, parsed.data)
      : await createArenaProfile(parsed.data);
    setProfile(result);
    return result;
  }

  async function saveProfileOnly() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await persistProfile();
      setMessage("บันทึกโปรไฟล์สาธารณะแล้ว สามารถลงสถิติต่อได้");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || savedTarget) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (evidenceFiles.length && !evidenceConsent)
        throw new Error("ยืนยันจัดเก็บไฟล์หลักฐานแบบไม่แสดงในฟีดก่อนบันทึก");
      // Validate statistics before creating public profile to avoid partial publication on input errors.
      const fields = {
        profileId: profile?.id ?? "0".repeat(32),
        boardKey,
        value: value.trim() ? Number(value) : NaN,
        period,
        observedAt,
        evidenceUrl,
        ...(boardKey === "custom"
          ? {
              custom: {
                title: customTitle,
                unit: customUnit,
                direction: customDirection,
              },
            }
          : {}),
      };
      const validated = entryInputSchema.safeParse(fields);
      if (!validated.success)
        throw new Error(
          validated.error.issues[0]?.message ?? "ข้อมูลสถิติไม่ถูกต้อง"
        );
      const savedProfile = await persistProfile();
      const result = await saveArenaEntry({
        ...validated.data,
        profileId: savedProfile.id,
      });
      if (evidenceFiles.length) {
        const target = {
          entryId: result.entryId,
          revision: result.revision,
          profileId: savedProfile.id,
          boardKey: result.board.key,
          period,
        };
        setSavedTarget(target);
        await attachFiles(target);
      } else onSaved(result.board.key, period);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function attachFiles(target: SavedEvidenceTarget) {
    setMessage("บันทึกสถิติแล้ว กำลังอัปโหลดหลักฐาน… กรุณาอย่าปิดหน้านี้");
    try {
      await uploadEvidenceQueue(
        evidenceFiles,
        file =>
          uploadEvidence(
            target.entryId,
            target.profileId,
            file,
            target.revision
          ),
        file => {
          setEvidenceFiles(current =>
            current.filter(
              item => evidenceFileKey(item) !== evidenceFileKey(file)
            )
          );
          setUploadedEvidenceCount(count => count + 1);
          setUploadedEvidenceBytes(bytes => bytes + file.size);
        }
      );
    } catch (cause) {
      setMessage(
        "สถิติบันทึกแล้ว ไฟล์ที่ส่งสำเร็จยังอยู่ ลองใหม่จะส่งเฉพาะไฟล์ที่เหลือ"
      );
      throw cause;
    }
    onSaved(
      target.boardKey,
      target.period,
      uploadedEvidenceCount + evidenceFiles.length
    );
  }

  async function retryEvidence() {
    if (!savedTarget || busy) return;
    if (!evidenceConsent) {
      setError("ยืนยันการจัดเก็บหลักฐานที่เลือกก่อนลองอัปโหลดอีกครั้ง");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await attachFiles(savedTarget);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "อัปโหลดหลักฐานไม่สำเร็จ"
      );
      setMessage(
        "สถิติบันทึกแล้ว ไฟล์ที่ส่งสำเร็จยังอยู่ ลองใหม่จะส่งเฉพาะไฟล์ที่เหลือ"
      );
    } finally {
      setBusy(false);
    }
  }

  function closeForm() {
    if (busy) return;
    if (
      savedTarget &&
      evidenceFiles.length &&
      !window.confirm(
        "สถิติบันทึกแล้ว แต่ยังมีหลักฐานที่ไม่ได้ส่ง ต้องการปิดและแนบต่อจากหน้าโปรไฟล์ภายหลังหรือไม่?"
      )
    )
      return;
    onClose();
  }

  function changeEvidenceFiles(next: File[]) {
    setEvidenceFiles(next);
    setEvidenceConsent(false);
  }

  return (
    <section className="arena-form" aria-labelledby="arena-form-title">
      <header className="arena-section-heading">
        <div>
          <p>JOIN THE ARENA</p>
          <h3 id="arena-form-title">สร้างโปรไฟล์ · โชว์สถิติของคุณ</h3>
        </div>
        <button
          type="button"
          className="arena-icon-button"
          aria-label="ปิดฟอร์ม"
          disabled={busy}
          onClick={closeForm}
        >
          <X size={18} />
        </button>
      </header>
      <p className="arena-note">
        <ShieldAlert size={15} /> ข้อมูลนี้เป็นสาธารณะและผู้ใช้รายงานเอง
        ไม่ใช่บัญชีที่ยืนยันตัวตน · ไม่คัดลอกโปรไฟล์หรือรูปส่วนตัวเดิม
      </p>
      {ids.length ? (
        <label className="arena-field">
          โปรไฟล์ที่มีสิทธิ์แก้ในเบราว์เซอร์นี้
          <select
            value={id}
            disabled={busy || Boolean(savedTarget)}
            onChange={event => setId(event.target.value)}
          >
            <option value="">สร้างโปรไฟล์ใหม่</option>
            {ids.map(key => (
              <option key={key} value={key}>
                โปรไฟล์ {key.slice(0, 8)}…
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {profileLoading ? <p role="status">กำลังโหลดโปรไฟล์…</p> : null}
      <form onSubmit={event => void submit(event)}>
        <fieldset disabled={busy || profileLoading || Boolean(savedTarget)}>
          <div className="arena-form__profile">
            <label
              className="arena-avatar-picker"
              aria-label="เลือกรูปโปรไฟล์สาธารณะ รูปจะถูกครอปเป็นสี่เหลี่ยมจัตุรัส"
            >
              <span>
                {avatar ? (
                  <img src={avatar} alt="รูปโปรไฟล์ที่เลือก" />
                ) : (
                  <Camera size={25} />
                )}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={event => void selectAvatar(event.target.files?.[0])}
              />
              <small>เลือกรูปใหม่ · ครอป 1:1</small>
            </label>
            <div className="arena-fields-grid">
              <label className="arena-field">
                ชื่อที่แสดง
                <input
                  required
                  maxLength={60}
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="ชื่อที่อยากให้ทุกคนเห็น"
                />
              </label>
              <label className="arena-field">
                ชื่อผู้ใช้ @
                <input
                  required
                  minLength={3}
                  maxLength={24}
                  pattern="[a-z0-9_]{3,24}"
                  value={handle}
                  onChange={e => setHandle(e.target.value.toLowerCase())}
                  placeholder="a-z, 0-9, _"
                />
              </label>
              <label className="arena-field arena-field--wide">
                แนะนำตัว
                <textarea
                  maxLength={160}
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  placeholder="สิ่งที่คุณถนัด หรือเป้าหมายที่อยากไปถึง"
                />
              </label>
            </div>
          </div>
          <label className="arena-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={e => setConsent(e.target.checked)}
            />
            ยืนยันให้ชื่อ รูป ไบโอ และสถิติที่กรอกนี้แสดงต่อผู้เข้าชมทุกคน
          </label>
          <button
            type="button"
            className="arena-secondary"
            disabled={!consent}
            onClick={() => void saveProfileOnly()}
          >
            <Save size={14} />
            บันทึกเฉพาะโปรไฟล์
          </button>
          <div className="arena-fields-grid arena-form__stats">
            <label className="arena-field arena-field--wide">
              รายการแข่งขัน
              <select
                value={boardKey}
                onChange={e => setBoardKey(e.target.value)}
              >
                {boards.map(board => (
                  <option value={board.key} key={board.key}>
                    {board.title} · {board.unit}
                  </option>
                ))}
                <option value="custom">+ สร้างสถิติอื่น / สถิติโลก</option>
              </select>
            </label>
            {boardKey === "custom" ? (
              <>
                <label className="arena-field">
                  ชื่อสถิติ / รายการแข่งขัน
                  <input
                    required
                    maxLength={60}
                    value={customTitle}
                    onChange={e => setCustomTitle(e.target.value)}
                    placeholder="เช่น ระยะปั่นจักรยานต่อเดือน"
                  />
                </label>
                <label className="arena-field">
                  หน่วย
                  <input
                    required
                    maxLength={20}
                    value={customUnit}
                    onChange={e => setCustomUnit(e.target.value)}
                    placeholder="เช่น km"
                  />
                </label>
                <label className="arena-field arena-field--wide">
                  กติกาจัดอันดับ
                  <select
                    value={customDirection}
                    onChange={e =>
                      setCustomDirection(e.target.value as "higher" | "lower")
                    }
                  >
                    <option value="higher">ค่ามากดีกว่า</option>
                    <option value="lower">ค่าน้อยดีกว่า</option>
                  </select>
                </label>
              </>
            ) : null}
            <label className="arena-field">
              ค่าสถิติ {selectedBoard?.unit ? `(${selectedBoard.unit})` : ""}
              <input
                required
                type="number"
                step={
                  selectedBoard &&
                  (["followers", "likes"].includes(selectedBoard.category) ||
                    selectedBoard.metric === "pushups")
                    ? "1"
                    : "any"
                }
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder="กรอกค่าที่วัดได้จริง"
              />
            </label>
            <label className="arena-field">
              เดือนแข่งขัน
              <input
                required
                type="month"
                min="2000-01"
                max={today().slice(0, 7)}
                value={period}
                onChange={e => changePeriod(e.target.value)}
              />
            </label>
            <label className="arena-field">
              วันที่สถิติ
              <input
                required
                type="date"
                max={today()}
                value={observedAt}
                onChange={e => setObservedAt(e.target.value)}
              />
            </label>
            <label className="arena-field">
              ลิงก์หลักฐาน (ไม่บังคับ)
              <input
                type="url"
                maxLength={500}
                value={evidenceUrl}
                onChange={e => setEvidenceUrl(e.target.value)}
                placeholder="https://…"
              />
            </label>
          </div>
          {!savedTarget ? (
            <>
              <EvidenceFilePicker
                files={evidenceFiles}
                onChange={changeEvidenceFiles}
                disabled={busy || profileLoading}
              />
              <label className="arena-consent manus-no-record">
                <input
                  type="checkbox"
                  checked={evidenceConsent}
                  onChange={e => setEvidenceConsent(e.target.checked)}
                />
                ยินยอมจัดเก็บไฟล์เหล่านี้เป็นหลักฐานส่วนตัวสำหรับผู้ถือรหัสเจ้าของและผู้ดูแล
                ไม่แสดงในฟีดและยังไม่ส่ง AI อัตโนมัติ
              </label>
            </>
          ) : null}
          <p className="arena-fine-print">
            ใช้ค่าสุดท้ายของแต่ละโปรไฟล์ต่อรายการและเดือน ·
            คะแนนเท่ากันได้อันดับเดียวกัน ·
            ลิงก์หลักฐานไม่ทำให้ผ่านการยืนยันโดยอัตโนมัติ ·
            การลงทุนเป็นสถิติรายงานเอง ไม่ใช่คำแนะนำลงทุน
          </p>
          {error ? (
            <p className="arena-error" role="alert">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="arena-success" role="status">
              <Check size={15} />
              {message}
            </p>
          ) : null}
          <button type="submit" className="arena-primary" disabled={!consent}>
            {busy
              ? "กำลังบันทึก…"
              : evidenceFiles.length
                ? "บันทึกสถิติและแนบหลักฐาน"
                : "บันทึกโปรไฟล์และสถิติสาธารณะ"}
            <Save size={15} />
          </button>
        </fieldset>
        {savedTarget ? (
          <div className="evidence-retry manus-no-record">
            <p role="status">
              สถิติบันทึกแล้ว · ไฟล์ที่ส่งสำเร็จจะไม่ถูกส่งซ้ำ
            </p>
            <EvidenceFilePicker
              files={evidenceFiles}
              onChange={changeEvidenceFiles}
              disabled={busy}
              existingCount={uploadedEvidenceCount}
              existingBytes={uploadedEvidenceBytes}
            />
            <label className="arena-consent">
              <input
                type="checkbox"
                checked={evidenceConsent}
                disabled={busy}
                onChange={e => setEvidenceConsent(e.target.checked)}
              />
              ยินยอมจัดเก็บไฟล์หลักฐานที่เลือกในกล่องนี้ ไม่แสดงในฟีดและไม่ส่ง
              AI อัตโนมัติ
            </label>
            <button
              type="button"
              className="arena-primary"
              disabled={busy || !evidenceFiles.length || !evidenceConsent}
              onClick={() => void retryEvidence()}
            >
              ลองอัปโหลดหลักฐานที่เหลืออีกครั้ง
            </button>
            <button
              type="button"
              className="arena-secondary"
              disabled={busy}
              onClick={() => {
                if (
                  evidenceFiles.length &&
                  !window.confirm(
                    "ยังมีหลักฐานไม่ถูกส่ง ต้องการแนบภายหลังจากหน้าโปรไฟล์หรือไม่?"
                  )
                )
                  return;
                onSaved(
                  savedTarget.boardKey,
                  savedTarget.period,
                  uploadedEvidenceCount
                );
              }}
            >
              เสร็จสิ้น / แนบต่อภายหลัง
            </button>
          </div>
        ) : null}
      </form>
    </section>
  );
}
