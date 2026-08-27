import { NextResponse } from 'next/server';
import { getVerifiedUserByCid, updateLastEmailEntryInUsersTable, updateLastSeenAtByEmail } from '@/lib/users';
import { updateLastEmailEntryByCid } from '@/lib/data-access';
import { recordEmailEntryEvent } from '@/lib/email-entries';
import { establishSession } from '@/lib/session';

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as { eid?: string; cid?: string };
    const cid = (body.cid || '').trim();
    const eid = (body.eid || '').trim();

    if (!cid) {
      return NextResponse.json({ success: false, error: 'Missing cid' }, { status: 400 });
    }

    const verifiedUser = await getVerifiedUserByCid(cid);
    if (!verifiedUser) {
      return NextResponse.json(
        { success: false, error: 'User not verified or not found' },
        { status: 403 },
      );
    }

    const entryPromises = [
      updateLastEmailEntryInUsersTable(cid),
      updateLastEmailEntryByCid(cid),
    ];
    if (eid) {
      entryPromises.push(recordEmailEntryEvent(eid, cid, verifiedUser.email));
    }
    await Promise.all(entryPromises);

    if (verifiedUser.email) {
      try {
        await updateLastSeenAtByEmail(verifiedUser.email);
      } catch (err) {
        console.error('[login-from-email] Failed to update LastSeenAt:', err);
      }
    }

    const response = NextResponse.json(
      {
        success: true,
        email: verifiedUser.email ?? '',
        firstName: verifiedUser.firstName ?? '',
      },
      { status: 200 },
    );

    // Every newsletter/campaign link carries eid+cid for click tracking, so
    // this endpoint fires far more often than just post-verification — it's
    // the normal path for any subscriber clicking into the site while
    // logged out. It used to only set the client-side isLoggedIn flag
    // (indirectly, via the JSON response) without ever issuing a real
    // session cookie, so anyone who arrived this way looked "logged in" in
    // the UI but had no actual server session — any cookie-gated route
    // (pattern save/load, etc.) would silently treat them as logged out.
    if (verifiedUser.email) {
      await establishSession(response, { userId: cid, email: verifiedUser.email });
    }

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
