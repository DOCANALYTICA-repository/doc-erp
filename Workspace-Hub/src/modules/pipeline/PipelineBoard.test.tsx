import { describe, it, expect, afterEach } from 'vitest';
import { screen } from '@testing-library/react';

import type { Pipeline, PipelineItem, PipelineStage } from '../../api/types';
import { PEOPLE, renderScreen, resetScreen } from '../claims/yellow-forms/testHarness';
import { PipelineBoard } from './PipelineBoard';

afterEach(resetScreen);

function stage(id: string, label: string, items: PipelineItem[] = []): PipelineStage {
  return { id, label, count: items.length, breaching: 0, oldest_days: items[0]?.days_waiting ?? 0, items };
}

const WAITING_SHEET: PipelineItem = {
  id: 'ccs_da_7',
  kind: 'claim_sheet',
  reference: 'YF-2026-000801',
  title: 'DOC Analytica — Excel Masterclass',
  stage: 'claim_sheet_claims_coordinator_review',
  stage_label: 'With Claims Coordinator',
  waiting_on: 'Claims Coordinator',
  days_waiting: 2,
  is_breaching_sla: false,
  sla_days: 3,
  href: '/app/claims/yellow_forms?open=ccs_da_7',
  owner: 'DOC Analytica',
};

const PIPELINE: Pipeline = {
  total: 1,
  total_breaching: 0,
  escalations: [],
  stages: [
    stage('initial_review', 'Initial review'),
    stage('subject_faculty', 'Subject faculty'),
    stage('course_coordinator', 'Course Coordinator'),
    stage('faculty_coordinator_review', 'Faculty Coordinator review'),
    stage('hod_review', 'HOD review'),
    stage('pre_approval_faculty_coordinator_review', 'Pre-approval — Club Faculty Coordinator'),
    stage('pre_approval_associate_hod_review', 'Pre-approval — Associate HOD'),
    stage('claim_sheet_claims_coordinator_review', 'Claim sheet — Claims Coordinator', [WAITING_SHEET]),
  ],
};

describe('yellow forms on the pipeline', () => {
  it('gives yellow-form stages their own section, apart from annual plans', async () => {
    renderScreen(<PipelineBoard />, {
      path: '/app/pipeline',
      user: PEOPLE.claimsCoordinator,
      respond: endpoint => (endpoint === '/me/pipeline' ? PIPELINE : undefined),
    });

    const headings = (await screen.findAllByRole('heading', { level: 2 })).map(h => h.textContent?.trim());
    expect(headings).toEqual(['Attendance claims', 'Yellow forms', 'Annual plans']);

    const stageTitles = screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent);
    expect(stageTitles.indexOf('Claim sheet — Claims Coordinator')).toBeLessThan(stageTitles.indexOf('HOD review'));
    expect(stageTitles.indexOf('Pre-approval — Associate HOD')).toBeLessThan(
      stageTitles.indexOf('Faculty Coordinator review'),
    );

    expect(screen.getByRole('link', { name: 'DOC Analytica — Excel Masterclass' })).toHaveAttribute(
      'href',
      '/app/claims/yellow_forms?open=ccs_da_7',
    );
  });
});
