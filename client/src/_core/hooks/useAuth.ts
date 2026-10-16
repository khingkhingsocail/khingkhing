import { openLoginPage } from "@/const";
import { trpc } from "@/lib/trpc";
import { completeAppLogout } from "@/lib/logout";
import { useQueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  // OAuth is started only by the explicit branded sign-in button.
  const { redirectOnUnauthenticated = false, redirectPath } = options ?? {};
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const logoutMutation = trpc.auth.logout.useMutation();
  const logoutInFlight = useRef<Promise<void> | null>(null);

  const logout = useCallback(() => {
    if (logoutInFlight.current) return logoutInFlight.current;
    const authQuery = queryClient
      .getQueryCache()
      .find({
        queryKey: getQueryKey(trpc.auth.me, undefined, "query"),
        exact: true,
      });
    const task = completeAppLogout({
      endSession: () => logoutMutation.mutateAsync(),
      cancelQueries: () => queryClient.cancelQueries(),
      clearCache: () => {
        // Keep the null auth query attached to its existing observers.
        // Removing it wholesale can leave mounted observers with old user data.
        queryClient.removeQueries({ predicate: query => query !== authQuery });
        queryClient.getMutationCache().clear();
      },
      markLoggedOut: () => utils.auth.me.setData(undefined, null),
    }).finally(() => {
      logoutInFlight.current = null;
    });
    logoutInFlight.current = task;
    return task;
  }, [logoutMutation, queryClient, utils]);

  const state = useMemo(
    () => ({
      user: meQuery.data ?? null,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
    }),
    [
      meQuery.data,
      meQuery.error,
      meQuery.isLoading,
      logoutMutation.error,
      logoutMutation.isPending,
    ]
  );

  useEffect(() => {
    try {
      if (state.user)
        localStorage.setItem(
          "manus-runtime-user-info",
          JSON.stringify(state.user)
        );
      else localStorage.removeItem("manus-runtime-user-info");
    } catch {
      /* Storage is optional, not the authentication source. */
    }
  }, [state.user]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (redirectPath && window.location.pathname === redirectPath) return;
    if (redirectPath) window.location.href = redirectPath;
    else openLoginPage();
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  return { ...state, refresh: () => meQuery.refetch(), logout };
}
