import { useState, useEffect, useCallback } from 'react';
import { checkAuth, login as apiLogin, logout as apiLogout } from '../lib/api';

interface AuthState {
  checked: boolean;
  authenticated: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ checked: false, authenticated: false });

  useEffect(() => {
    checkAuth().then((ok) => setState({ checked: true, authenticated: ok }));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    await apiLogin(username, password);
    setState({ checked: true, authenticated: true });
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setState({ checked: true, authenticated: false });
  }, []);

  return { ...state, login, logout };
}
