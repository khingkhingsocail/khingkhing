import { LoaderCircle, Save } from "lucide-react";
import "./profile-save.css";
export const LOCAL_PROFILE_FORM_ID = "local-profile-editor-form";
export default function ProfileSaveButton({
  saving,
  disabled,
}: {
  saving: boolean;
  disabled: boolean;
}) {
  return (
    <button
      type="submit"
      form={LOCAL_PROFILE_FORM_ID}
      className="profile-action-button profile-save-button"
      disabled={disabled || saving}
      aria-busy={saving}
    >
      {saving ? (
        <LoaderCircle
          size={15}
          className="profile-save-spinner"
          aria-hidden="true"
        />
      ) : (
        <Save size={15} aria-hidden="true" />
      )}
      {saving ? "กำลังบันทึก…" : "บันทึกโปรไฟล์"}
    </button>
  );
}
