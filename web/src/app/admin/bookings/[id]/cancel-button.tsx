'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { cancelBookingAction } from '../../actions';

function Confirm({ onBack }: { onBack: () => void }) {
  const { pending } = useFormStatus();
  return (
    <>
      <span className="sub">Naozaj zrušiť? Termín sa uvoľní.</span>
      <button className="btn danger" type="submit" disabled={pending}>
        {pending ? 'Ruším…' : 'Áno, zrušiť'}
      </button>
      <button className="btn" type="button" onClick={onBack} disabled={pending}>
        Späť
      </button>
    </>
  );
}

/**
 * Storno je nevratné, preto dvojkrokové potvrdenie – jeden preklik
 * na detaile rezervácie nemá zrušiť hosťovi pobyt.
 */
export default function CancelButton({ bookingId }: { bookingId: string }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button className="btn danger" type="button" onClick={() => setConfirming(true)}>
        Zrušiť rezerváciu
      </button>
    );
  }

  return (
    <form action={cancelBookingAction} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input type="hidden" name="bookingId" value={bookingId} />
      <Confirm onBack={() => setConfirming(false)} />
    </form>
  );
}
