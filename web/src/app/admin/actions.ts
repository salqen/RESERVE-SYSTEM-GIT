'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { apiLogin, apiLogout, cancelBookingAsAdmin, createUser, updateUser } from '@/lib/admin-api';
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

/** Ručné storno správcom. Do audit logu ide e-mail prihláseného správcu. */
export async function cancelBookingAction(formData: FormData): Promise<void> {
  const bookingId = String(formData.get('bookingId') ?? '');
  if (!bookingId) return;
  await cancelBookingAsAdmin(bookingId);
  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath('/admin/bookings');
  revalidatePath('/admin');
}

export interface UserFormState { error?: string; ok?: string }

export async function createUserAction(
  _prev: UserFormState, formData: FormData,
): Promise<UserFormState> {
  const email = String(formData.get('email') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const role = String(formData.get('role') ?? 'staff');

  if (!email || !name || !password) return { error: 'Vyplňte e-mail, meno aj heslo' };

  try {
    await createUser({ email, name, password, role });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Účet sa nepodarilo vytvoriť' };
  }
  revalidatePath('/admin/users');
  return { ok: `Účet ${email} vytvorený` };
}

/** Aktivácia/deaktivácia účtu. Deaktivácia zároveň zruší jeho sessions. */
export async function toggleUserAction(formData: FormData): Promise<void> {
  const id = String(formData.get('userId') ?? '');
  const active = formData.get('active') === 'true';
  if (!id) return;
  await updateUser(id, { active });
  revalidatePath('/admin/users');
}
