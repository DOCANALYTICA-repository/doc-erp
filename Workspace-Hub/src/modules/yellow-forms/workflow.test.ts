import { describe, it, expect } from 'vitest';

import { computeSteps, stageLabelFor, statusLabelFor, yellowFormKindOf } from './workflow';
import { WORKFLOW_FIXTURE } from './testFixtures';

const PRE = WORKFLOW_FIXTURE.pre_approval;
const SHEET = WORKFLOW_FIXTURE.claim_sheet;

const states = (steps: ReturnType<typeof computeSteps>) => steps.map(step => step.state);

describe('computeSteps', () => {
  it('marks a pre-approval waiting on the Associate HOD', () => {
    const steps = computeSteps(PRE, 'associate_hod_review');
    expect(steps.map(s => s.label)).toEqual([
      'Draft', 'Club Faculty Coordinator', 'Associate HOD', 'Pre-approved',
    ]);
    expect(states(steps)).toEqual(['done', 'done', 'current', 'upcoming']);
  });

  it('shows a draft as the current step', () => {
    expect(states(computeSteps(PRE, 'draft'))).toEqual(['current', 'upcoming', 'upcoming', 'upcoming']);
  });

  it('completes every step once approved', () => {
    expect(states(computeSteps(PRE, 'approved'))).toEqual(['done', 'done', 'done', 'done']);
    expect(states(computeSteps(SHEET, 'approved'))).toEqual(['done', 'done', 'done']);
  });

  it('marks a returned form at the stage that sent it back', () => {
    const steps = computeSteps(PRE, 'returned', { lastReviewedStage: 'associate_hod_review' });
    expect(states(steps)).toEqual(['done', 'done', 'returned', 'upcoming']);
  });

  it('marks a rejection at the first review stage when the stage is unknown', () => {
    expect(states(computeSteps(PRE, 'rejected'))).toEqual(['done', 'rejected', 'upcoming', 'upcoming']);
    expect(states(computeSteps(SHEET, 'rejected', { lastReviewedStage: 'claims_coordinator_review' })))
      .toEqual(['done', 'rejected', 'upcoming']);
  });

  it('marks an expired form at the step it was stuck on', () => {
    const steps = computeSteps(PRE, 'faculty_coordinator_review', { isExpired: true });
    expect(states(steps)).toEqual(['done', 'expired', 'upcoming', 'upcoming']);
  });

  it('leaves every step upcoming for a status it does not know', () => {
    expect(states(computeSteps(SHEET, 'mystery'))).toEqual(['upcoming', 'upcoming', 'upcoming']);
  });
});

describe('labels and ids', () => {
  it('reads labels from the served table', () => {
    expect(statusLabelFor(SHEET, 'approved')).toBe('Approved — forwarded to attendance office');
    expect(stageLabelFor(PRE, 'associate_hod_review')).toBe('Associate HOD');
    expect(statusLabelFor(undefined, 'claims_coordinator_review')).toBe('claims coordinator review');
  });

  it('tells a deep link\'s kind from its id prefix', () => {
    expect(yellowFormKindOf('paf_da_2')).toBe('pre_approval');
    expect(yellowFormKindOf('ccs_da_7')).toBe('claim_sheet');
    expect(yellowFormKindOf('cl_123')).toBeNull();
    expect(yellowFormKindOf(null)).toBeNull();
  });
});
