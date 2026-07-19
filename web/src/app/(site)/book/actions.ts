'use server';

/**
 * Server actions booking flow. Bežia na serveri – API_URL a volania na backend
 * sa nedostanú do prehliadača. Idempotency key generuje server pri odoslaní.
 */
import { redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { createHold, confirmBooking, cancelBooking, ApiError, type CreateHoldInput } from '@/lib/api';

export async function createHoldAction(formData: FormData) {
  const type = String(formData.get('type'));
  const input: CreateHoldInput = {
    idempotencyKey: randomUUID(),
    customer: {
      name: String(formData.get('name') ?? '').trim(),
      email: String(formData.get('email') ?? '').trim(),
      phone: String(formData.get('phone') ?? '').trim() || undefined,
    },
    rooms: [],
    services: [],
    note: String(formData.get('note') ?? '').trim() || undefined,
  };
  if (type === 'room') {
    input.rooms = [{
      roomId: String(formData.get('roomId')),
      checkIn: String(formData.get('from')),
      checkOut: String(formData.get('to')),
    }];
  } else {
    input.services = [{
      serviceId: String(formData.get('serviceId')),
      resourceId: String(formData.get('resourceId')),
      startsAt: String(formData.get('startsAt')),
    }];
  }

  let bookingId: string;
  try {
    const hold = await createHold(input);
    bookingId = hold.bookingId;
  } catch (e) {
    const msg = e instanceof ApiError && e.status === 409
      ? 'Termín medzitým niekto obsadil. Vyberte prosím iný.'
      : 'Rezerváciu sa nepodarilo vytvoriť. Skúste to znova.';
    const back = new URLSearchParams();
    for (const [k, v] of formData.entries()) if (typeof v === 'string' && k !== 'name' && k !== 'email' && k !== 'phone' && k !== 'note') back.set(k, v);
    back.set('error', msg);
    redirect(`/book?${back.toString()}`);
  }
  redirect(`/checkout/${bookingId!}`);
}

export async function payAndConfirmAction(formData: FormData) {
  const bookingId = String(formData.get('bookingId'));
  try {
    await confirmBooking(bookingId);
  } catch (e) {
    const msg = e instanceof ApiError && e.status === 409
      ? 'Rezervácia expirovala – termín bol uvoľnený. Vytvorte ju prosím znova.'
      : 'Platbu sa nepodarilo dokončiť. Skúste to znova.';
    redirect(`/checkout/${bookingId}?error=${encodeURIComponent(msg)}`);
  }
  redirect(`/bookings/${bookingId}?paid=1`);
}

export async function cancelBookingAction(formData: FormData) {
  const bookingId = String(formData.get('bookingId'));
  try {
    const r = await cancelBooking(bookingId);
    redirect(`/bookings/${bookingId}?cancelled=1&refund=${r.refundTotal}&fee=${r.feeTotal}`);
  } catch (e) {
    // redirect() vnútri try hádže NEXT_REDIRECT – prepustíme ho ďalej
    if ((e as any)?.digest?.startsWith?.('NEXT_REDIRECT')) throw e;
    redirect(`/bookings/${bookingId}?error=${encodeURIComponent('Storno sa nepodarilo. Skúste to znova.')}`);
  }
}
