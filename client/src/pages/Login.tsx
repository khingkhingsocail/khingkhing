import { useSyncExternalStore } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import BrandedLogin from "@/components/BrandedLogin";
import { isPublicFeedDeepLink } from "@/lib/loginEntry";
import Home from "./Home";

export default function Login({ entry = false }: { entry?: boolean }) {
  const auth = useAuth();
  if (entry && auth.isAuthenticated) return <Home />;
  return (
    <BrandedLogin
      checking={auth.loading}
      authenticated={auth.isAuthenticated}
      accountName={auth.user?.name ?? null}
      authError={Boolean(auth.error)}
      onRetry={() => void auth.refresh()}
      onLogout={auth.logout}
    />
  );
}
function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}
function guestLinkSnapshot() {
  return isPublicFeedDeepLink(window.location.hash);
}
export function Entry() {
  const sharedPost = useSyncExternalStore(
    subscribeHash,
    guestLinkSnapshot,
    () => false
  );
  return sharedPost ? <Home /> : <Login entry />;
}
