import { useEffect, useMemo, useState } from "react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { queryClient, meQuery } from "@/shared/api/queries";
import { AppShell, LoadError } from "./AppShell";
import { AuthContext, useAuth, type GateMode } from "@/features/auth/AuthContext";
import { Gate } from "@/features/auth/Gate";
import { onUnauthorized } from "@/shared/api/http";

export default function App() {
  const [gate, setGate] = useState<GateMode>(null);
  // 세션이 끊기면(401) 어느 요청에서든 로그인 화면으로 돌아갑니다.
  useEffect(() => onUnauthorized(() => setGate("login")), []);
  const auth = useMemo(() => ({
    gate,
    showLogin: () => setGate("login"),
    showPassword: (forced: boolean) => setGate(forced ? "password-forced" : "password"),
    hideGate: () => setGate(null),
  }), [gate]);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <Root />
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

function Root() {
  const auth = useAuth();
  const me = useQuery(meQuery());
  // 첫 로그인 · 비밀번호 초기화 뒤에는 비밀번호부터 바꾸고, 그 전에는 다른 API 가 403 이라 껍데기를 띄우지 않습니다.
  const mode = auth.gate ?? (me.data?.must_change_password ? "password-forced" : null);
  const shell = me.data && mode !== "login" && mode !== "password-forced" ? <AppShell me={me.data} /> : null;
  return (
    <>
      {shell}
      {me.isError && !auth.gate && <LoadError message={me.error.message} />}
      {mode && <Gate mode={mode} />}
    </>
  );
}
