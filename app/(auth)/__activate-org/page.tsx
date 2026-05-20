'use client';
// SMOKE-TEST UTILITY — Phase 3 live-smoke recovery, 2026-05-19.
// Activates the user's first organization membership (so session JWT has
// orgId claim) then redirects to /dashboard. Not part of the production
// flow — used once to break the chicken-and-egg of "no active org" on a
// session that has lastActiveOrganizationId set but never called setActive.
//
// DELETE after smoke succeeds.
import { useEffect, useState } from 'react';
import { useOrganizationList, useUser } from '@clerk/nextjs';

export default function ActivateOrgPage() {
  const { user } = useUser();
  const list = useOrganizationList({ userMemberships: true });
  const [status, setStatus] = useState<string>('loading…');

  useEffect(() => {
    if (!list.isLoaded || !user) return;
    const first = list.userMemberships?.data?.[0];
    if (!first) {
      setStatus('no memberships found');
      return;
    }
    setStatus(`activating ${first.organization.name}…`);
    list
      .setActive({ organization: first.organization.id })
      .then(() => {
        setStatus('activated; redirecting to /dashboard');
        window.location.href = '/dashboard';
      })
      .catch((err: unknown) => {
        setStatus(`error: ${err instanceof Error ? err.message : String(err)}`);
      });
  }, [list, user]);

  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace' }}>
      <h1>Org Activation Helper</h1>
      <p>Status: {status}</p>
      <p style={{ color: '#666', fontSize: '0.9rem' }}>
        This page is a one-time smoke-test utility. Delete after success.
      </p>
    </div>
  );
}
