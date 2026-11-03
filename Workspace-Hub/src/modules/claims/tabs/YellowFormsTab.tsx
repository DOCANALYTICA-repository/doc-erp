import React from 'react';

import { useClaimsWorkspace } from '../ClaimsContext';
import { ReviewerYellowForms } from '../yellow-forms/ReviewerYellowForms';
import { StudentYellowForms } from '../yellow-forms/StudentYellowForms';

/** Club yellow forms: the reviewer's desk, or the forms a student is listed on. */
export const YellowFormsTab: React.FC = () => {
  const { isReviewer } = useClaimsWorkspace();
  return isReviewer ? <ReviewerYellowForms /> : <StudentYellowForms />;
};
