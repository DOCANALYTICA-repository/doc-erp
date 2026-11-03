import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { PendingApprovals } from './PendingApprovals';

afterEach(cleanup);

describe('PendingApprovals', () => {
  it('names both teachers of a co-taught hour as alternatives', () => {
    render(
      <PendingApprovals
        pending={[
          {
            stage: 'subject_faculty',
            role: 'Subject Faculty',
            faculty_id: 'fac_afa_nisha',
            faculty_name: 'Nisha',
            co_faculty_id: 'fac_afa_thirunavukkarasu',
            co_faculty_name: 'Thirunavukkarasu',
            subject: 'Deep Learning and Natural Language Processing',
            course_code: 'COAF301-6',
          },
          {
            stage: 'subject_faculty',
            role: 'Subject Faculty',
            faculty_id: 'fac_afa_simon',
            faculty_name: 'Simon Giri',
            subject: 'Risk Management & Derivatives',
            course_code: 'COAF302-6',
          },
        ]}
      />,
    );
    expect(screen.getByText('Nisha or Thirunavukkarasu')).toBeTruthy();
    expect(screen.getByText('Simon Giri')).toBeTruthy();
  });
});
