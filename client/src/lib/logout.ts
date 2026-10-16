export function clearBrowserSession() {
  try {
    sessionStorage.removeItem("manus-cookie");
  } catch {
    /* Browser storage may be blocked. */
  }
  try {
    localStorage.removeItem("manus-runtime-user-info");
  } catch {
    /* Not an authentication source. */
  }
}

export async function completeAppLogout(actions: {
  endSession: () => Promise<unknown>;
  cancelQueries: () => Promise<unknown>;
  clearCache: () => void;
  markLoggedOut: () => void;
}) {
  // A failed request does not mean the HttpOnly cookie was removed.
  // Retain the account and offer retry instead of pretending logout succeeded.
  await actions.endSession();
  try {
    await actions.cancelQueries();
  } catch {
    /* Server logout already succeeded; cleanup must still finish. */
  }
  clearBrowserSession();
  actions.markLoggedOut();
  actions.clearCache();
}
