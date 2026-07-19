'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  apiLogin, apiLogout, cancelBookingAsAdmin, createUser, updateUser,
  createRoom, patchRoom, createService, patchService,
  addPriceRule, deletePriceRule, createResource, patchResource, setResourceHours,
} from '@/lib/admin-api';
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

// ----------------------------------------------------------------- katalóg

export interface CatalogFormState { error?: string; ok?: string }

function policyOrNull(value: FormDataEntryValue | null): string | null {
  const v = String(value ?? '').trim();
  return v === '' ? null : v;
}

export async function createRoomAction(
  _prev: CatalogFormState, formData: FormData,
): Promise<CatalogFormState> {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: 'Zadajte názov izby' };

  try {
    await createRoom({
      name,
      room_type: String(formData.get('room_type') ?? '').trim() || 'izba',
      capacity: Number(formData.get('capacity') ?? 2),
      price_night: Number(formData.get('price_night') ?? 0),
      min_nights: Number(formData.get('min_nights') ?? 1),
      cancellation_policy_id: policyOrNull(formData.get('cancellation_policy_id')),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Izbu sa nepodarilo pridať' };
  }
  revalidatePath('/admin/catalog');
  revalidatePath('/');
  return { ok: `Izba ${name} pridaná` };
}

export async function createServiceAction(
  _prev: CatalogFormState, formData: FormData,
): Promise<CatalogFormState> {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: 'Zadajte názov služby' };

  try {
    await createService({
      name,
      duration_min: Number(formData.get('duration_min') ?? 60),
      buffer_min: Number(formData.get('buffer_min') ?? 0),
      price: Number(formData.get('price') ?? 0),
      cancellation_policy_id: policyOrNull(formData.get('cancellation_policy_id')),
      resource_ids: formData.getAll('resource_ids').map(String).filter(Boolean),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Službu sa nepodarilo pridať' };
  }
  revalidatePath('/admin/catalog');
  revalidatePath('/');
  return { ok: `Služba ${name} pridaná` };
}

/** Zapnutie/vypnutie položky katalógu – deaktivovaná zmizne zo zákazníckeho webu. */
export async function toggleCatalogItemAction(formData: FormData): Promise<void> {
  const id = String(formData.get('itemId') ?? '');
  const kind = String(formData.get('kind') ?? '');
  const active = formData.get('active') === 'true';
  if (!id) return;

  if (kind === 'room') await patchRoom(id, { active });
  else if (kind === 'service') await patchService(id, { active });

  revalidatePath('/admin/catalog');
  revalidatePath('/');
}

/** Aktivácia/deaktivácia účtu. Deaktivácia zároveň zruší jeho sessions. */
export async function toggleUserAction(formData: FormData): Promise<void> {
  const id = String(formData.get('userId') ?? '');
  const active = formData.get('active') === 'true';
  if (!id) return;
  await updateUser(id, { active });
  revalidatePath('/admin/users');
}

/** Úprava existujúcej izby. */
export async function updateRoomAction(
  _prev: CatalogFormState, formData: FormData,
): Promise<CatalogFormState> {
  const id = String(formData.get('roomId') ?? '');
  if (!id) return { error: 'Chýba izba' };

  try {
    await patchRoom(id, {
      name: String(formData.get('name') ?? '').trim(),
      room_type: String(formData.get('room_type') ?? '').trim(),
      capacity: Number(formData.get('capacity')),
      price_night: Number(formData.get('price_night')),
      min_nights: Number(formData.get('min_nights')),
      cancellation_policy_id: policyOrNull(formData.get('cancellation_policy_id')),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Zmenu sa nepodarilo uložiť' };
  }
  revalidatePath('/admin/catalog');
  revalidatePath('/');
  return { ok: 'Izba upravená' };
}

/** Úprava existujúcej služby vrátane priradených zdrojov. */
export async function updateServiceAction(
  _prev: CatalogFormState, formData: FormData,
): Promise<CatalogFormState> {
  const id = String(formData.get('serviceId') ?? '');
  if (!id) return { error: 'Chýba služba' };

  try {
    await patchService(id, {
      name: String(formData.get('name') ?? '').trim(),
      duration_min: Number(formData.get('duration_min')),
      buffer_min: Number(formData.get('buffer_min')),
      price: Number(formData.get('price')),
      cancellation_policy_id: policyOrNull(formData.get('cancellation_policy_id')),
      resource_ids: formData.getAll('resource_ids').map(String).filter(Boolean),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Zmenu sa nepodarilo uložiť' };
  }
  revalidatePath('/admin/catalog');
  revalidatePath('/');
  return { ok: 'Služba upravená' };
}

/** Sezónna cena izby. Prekryv sezón odmietne databáza. */
export async function addPriceRuleAction(
  _prev: CatalogFormState, formData: FormData,
): Promise<CatalogFormState> {
  const roomId = String(formData.get('roomId') ?? '');
  if (!roomId) return { error: 'Chýba izba' };

  try {
    await addPriceRule(roomId, {
      season_from: String(formData.get('season_from') ?? ''),
      season_to: String(formData.get('season_to') ?? ''),
      price_night: Number(formData.get('price_night')),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Sezónu sa nepodarilo pridať' };
  }
  revalidatePath('/admin/catalog');
  revalidatePath('/');
  return { ok: 'Sezónna cena pridaná' };
}

export async function deletePriceRuleAction(formData: FormData): Promise<void> {
  const ruleId = String(formData.get('ruleId') ?? '');
  if (!ruleId) return;
  await deletePriceRule(ruleId);
  revalidatePath('/admin/catalog');
  revalidatePath('/');
}

/** Nový zdroj – personál, miestnosť alebo zariadenie. */
export async function createResourceAction(
  _prev: CatalogFormState, formData: FormData,
): Promise<CatalogFormState> {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: 'Zadajte názov zdroja' };

  try {
    await createResource({
      name,
      resource_type: String(formData.get('resource_type') ?? 'staff'),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Zdroj sa nepodarilo pridať' };
  }
  revalidatePath('/admin/catalog');
  return { ok: `Zdroj ${name} pridaný` };
}

export async function toggleResourceAction(formData: FormData): Promise<void> {
  const id = String(formData.get('resourceId') ?? '');
  const active = formData.get('active') === 'true';
  if (!id) return;
  await patchResource(id, { active });
  revalidatePath('/admin/catalog');
}

/**
 * Týždenný rozvrh zdroja. Formulár posiela pre každý deň zaškrtnutie
 * a časy; nezaškrtnuté dni sa neposielajú a znamenajú voľno.
 */
export async function setResourceHoursAction(
  _prev: CatalogFormState, formData: FormData,
): Promise<CatalogFormState> {
  const id = String(formData.get('resourceId') ?? '');
  if (!id) return { error: 'Chýba zdroj' };

  const hours: { weekday: number; open: string; close: string }[] = [];
  for (let weekday = 0; weekday <= 6; weekday++) {
    if (formData.get(`day-${weekday}`) !== 'on') continue;
    const open = String(formData.get(`open-${weekday}`) ?? '');
    const close = String(formData.get(`close-${weekday}`) ?? '');
    if (!open || !close) continue;
    hours.push({ weekday, open, close });
  }

  try {
    await setResourceHours(id, hours);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Rozvrh sa nepodarilo uložiť' };
  }
  revalidatePath('/admin/catalog');
  return { ok: hours.length === 0 ? 'Rozvrh vymazaný – zdroj nemá voľné termíny' : 'Rozvrh uložený' };
}
