'use server';

import { redirect } from 'next/navigation';
import { apiLogin, apiLogout } from '@/lib/admin-api';
import { setSessionCookie, clearSessionCookie } from '@/lib/admin-session';

export interface LoginState { error?: string }

/**
 * Prihlásenie. Heslo sa spracuje na serveri, token skončí v httpOnly cookie
 * a do prehliadača sa nikdy nedostane.
 */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) return { error: 'Vyplňte e-mail aj heslo' };

  let result;
  try {
    result = await apiLogin(email, password);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Prihlásenie zlyhalo' };
  }

  setSessionCookie(result.token, result.expiresAt);
  redirect('/admin');
}

export async function logoutAction(): Promise<void> {
  await apiLogout();
  clearSessionCookie();
  redirect('/admin/login');
}
