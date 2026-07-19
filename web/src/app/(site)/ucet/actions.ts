'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  accountLogin, accountRegister, accountLogout,
  setAccountCookie, clearAccountCookie,
} from '@/lib/account-api';

export interface AccountFormState { error?: string }

export async function loginAction(
  _prev: AccountFormState, formData: FormData,
): Promise<AccountFormState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { error: 'Vyplňte e-mail aj heslo' };

  let result;
  try {
    result = await accountLogin({ email, password });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Prihlásenie zlyhalo' };
  }

  setAccountCookie(result.token, result.expiresAt);
  revalidatePath('/', 'layout');
  redirect('/ucet');
}

export async function registerAction(
  _prev: AccountFormState, formData: FormData,
): Promise<AccountFormState> {
  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const phone = String(formData.get('phone') ?? '').trim();

  if (!name || !email || !password) return { error: 'Vyplňte meno, e-mail aj heslo' };

  let result;
  try {
    result = await accountRegister({ name, email, password, phone: phone || undefined });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Registrácia zlyhala' };
  }

  setAccountCookie(result.token, result.expiresAt);
  revalidatePath('/', 'layout');
  redirect('/ucet');
}

export async function logoutAction(): Promise<void> {
  await accountLogout();
  clearAccountCookie();
  revalidatePath('/', 'layout');
  redirect('/');
}
