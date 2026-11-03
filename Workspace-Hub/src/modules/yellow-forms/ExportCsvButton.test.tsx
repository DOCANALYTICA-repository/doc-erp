/**
 * The CSV button, and through it `api.download`: the file must be fetched with
 * the session's Bearer token (a plain link cannot carry it), survive an
 * expired access token the same way every other request does, and land as a
 * named file.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { clearSession, readSession, writeSession } from '../../services/session';
import { ExportCsvButton } from './ExportCsvButton';
import { renderWithClient } from './renderWithClient';
import { CLAIM_SHEET_FIXTURE } from './testFixtures';

const originalFetch = global.fetch;
let clicked: HTMLAnchorElement[] = [];

function csvResponse(): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'text/csv; charset=utf-8' }),
    blob: async () => new Blob(['﻿S.No,Register Number\n'], { type: 'text/csv' }),
    json: async () => {
      throw new Error('a CSV is not JSON');
    },
  } as unknown as Response;
}

function errorResponse(status: number, detail: string): Response {
  return {
    ok: false,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({ detail }),
  } as unknown as Response;
}

function headerOf(call: unknown[], name: string): string | undefined {
  const init = call[1] as RequestInit;
  return (init.headers as Record<string, string>)[name];
}

beforeEach(() => {
  clicked = [];
  // jsdom implements neither; left defined for the rest of this file so the
  // delayed revoke never lands on a missing function.
  URL.createObjectURL = vi.fn(() => 'blob:yf-2026-000801');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this);
  });
  writeSession({ user: null, token: 'access-1', refreshToken: 'refresh-1' });
});

afterEach(() => {
  global.fetch = originalFetch;
  clearSession();
  vi.restoreAllMocks();
});

describe('ExportCsvButton', () => {
  it('renders nothing for a viewer who may not export', () => {
    renderWithClient(<ExportCsvButton sheet={{ ...CLAIM_SHEET_FIXTURE, viewer_can_export: false }} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('downloads the sheet with the session token, named by its reference', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(csvResponse());
    global.fetch = fetchMock;

    renderWithClient(<ExportCsvButton sheet={CLAIM_SHEET_FIXTURE} />);
    await user.click(screen.getByRole('button', { name: 'Download CSV' }));

    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/v1\/yellow-forms\/claim-sheets\/ccs_da_7\/export\.csv$/);
    expect(headerOf(fetchMock.mock.calls[0], 'Authorization')).toBe('Bearer access-1');
    expect(clicked[0].download).toBe('YF-2026-000801.csv');
    expect(clicked[0].getAttribute('href')).toBe('blob:yf-2026-000801');
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    // The temporary link is not left in the page.
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('refreshes an expired access token once and retries, like any other request', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(errorResponse(401, 'Token expired'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ access_token: 'access-2', refresh_token: 'refresh-2' }),
      } as unknown as Response)
      .mockResolvedValueOnce(csvResponse());
    global.fetch = fetchMock;

    renderWithClient(<ExportCsvButton sheet={CLAIM_SHEET_FIXTURE} />);
    await user.click(screen.getByRole('button', { name: 'Download CSV' }));

    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/auth\/refresh$/);
    expect(headerOf(fetchMock.mock.calls[2], 'Authorization')).toBe('Bearer access-2');
    expect(readSession()?.refreshToken).toBe('refresh-2');
  });

  it('tells the user why a download was refused, and saves nothing', async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn().mockResolvedValue(
      errorResponse(403, 'You do not have access to export this claim sheet'),
    );

    renderWithClient(<ExportCsvButton sheet={CLAIM_SHEET_FIXTURE} />);
    await user.click(screen.getByRole('button', { name: 'Download CSV' }));

    expect(
      await screen.findByText(
        'Could not download the claim sheet: You do not have access to export this claim sheet',
      ),
    ).toBeTruthy();
    expect(clicked).toHaveLength(0);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
