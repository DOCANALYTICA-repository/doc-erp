/**
 * The form plumbing, tested at the seam rather than per-form.
 *
 * `extractFieldErrors` is where a 422 stops being an opaque sentence and
 * becomes a field. If it silently returns `[]` for a shape the server actually
 * sends, every form falls back to a toast and nobody notices the inline errors
 * are gone — so the shapes are pinned here explicitly.
 */
import { describe, it, expect } from 'vitest';
import { ApiError } from '../services/api';
import { extractFieldErrors, describeError } from '../services/errors';

function unprocessable(detail: unknown): ApiError {
  return new ApiError(422, { detail });
}

describe('extractFieldErrors', () => {
  it('maps a FastAPI body error to an rhf path', () => {
    const errors = extractFieldErrors(
      unprocessable([
        { loc: ['body', 'amount'], msg: 'Input should be greater than 0', type: 'greater_than' },
      ])
    );
    expect(errors).toEqual([{ path: 'amount', message: 'Input should be greater than 0' }]);
  });

  it('maps a nested path to dotted rhf notation', () => {
    // rhf addresses `items[0].name` as `items.0.name`.
    const errors = extractFieldErrors(
      unprocessable([{ loc: ['body', 'items', 0, 'name'], msg: 'Field required' }])
    );
    expect(errors).toEqual([{ path: 'items.0.name', message: 'Field required' }]);
  });

  it('strips the source segment for query and path params too', () => {
    expect(
      extractFieldErrors(unprocessable([{ loc: ['query', 'page'], msg: 'nope' }]))
    ).toEqual([{ path: 'page', message: 'nope' }]);
    expect(
      extractFieldErrors(unprocessable([{ loc: ['path', 'club_id'], msg: 'nope' }]))
    ).toEqual([{ path: 'club_id', message: 'nope' }]);
  });

  it('reports every field, not just the first', () => {
    const errors = extractFieldErrors(
      unprocessable([
        { loc: ['body', 'title'], msg: 'Field required' },
        { loc: ['body', 'venue'], msg: 'Field required' },
      ])
    );
    expect(errors.map(e => e.path)).toEqual(['title', 'venue']);
  });

  it('ignores an error about the request as a whole', () => {
    // `loc: ['body']` refers to the payload, not to any one field, so there is
    // no control to attach it to. The caller must fall back to a toast.
    expect(extractFieldErrors(unprocessable([{ loc: ['body'], msg: 'Invalid payload' }]))).toEqual(
      []
    );
  });

  it('ignores a non-422', () => {
    // A 403 is a real refusal with a real message, but it is not about a field.
    expect(extractFieldErrors(new ApiError(403, { detail: 'Not the coordinator' }))).toEqual([]);
    expect(extractFieldErrors(new ApiError(500, {}))).toEqual([]);
  });

  it("ignores FastAPI's own HTTPException shape", () => {
    // `raise HTTPException(422, detail="...")` produces a STRING detail, not a
    // list. Treating that as field errors would crash on `.loc`.
    expect(extractFieldErrors(unprocessable('Something was wrong'))).toEqual([]);
  });

  it('survives malformed entries without throwing', () => {
    expect(
      extractFieldErrors(unprocessable([null, {}, { loc: 'body' }, { loc: [] }]))
    ).toEqual([]);
  });

  it('falls back to a generic message when msg is missing', () => {
    expect(extractFieldErrors(unprocessable([{ loc: ['body', 'x'] }]))).toEqual([
      { path: 'x', message: 'Invalid value' },
    ]);
  });

  it('ignores a plain Error', () => {
    expect(extractFieldErrors(new Error('boom'))).toEqual([]);
    expect(extractFieldErrors(undefined)).toEqual([]);
  });
});

describe('describeError still handles what extractFieldErrors declines', () => {
  // The two are complements: anything extractFieldErrors returns `[]` for has
  // to remain visible through describeError, or the failure disappears.
  it('describes a 403', () => {
    expect(describeError(new ApiError(403, { detail: 'Not the coordinator' }))).toContain(
      'Not the coordinator'
    );
  });

  it('describes a network failure', () => {
    expect(describeError(new ApiError(0, {}))).toMatch(/cannot reach the server/i);
  });

  it('describes a request-level 422', () => {
    expect(describeError(unprocessable([{ loc: ['body'], msg: 'Invalid payload' }]))).toBeTruthy();
  });
});
